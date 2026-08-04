import { Reservation, ReservationStatus, UserRole } from '@/frontend/src/types';
import { ReservationRepository } from '@/database/repositories/reservationRepository';
import { SettingsRepository } from '@/database/repositories/settingsRepository';
import { ApprovalRepository } from '@/database/repositories/approvalRepository';
import { AuditRepository } from '@/database/repositories/auditRepository';
import { NotificationService } from '../notifications/notificationService';

export class ReservationService {
  /**
   * Get all reservations from the Supabase database
   */
  static async getReservations(): Promise<Reservation[]> {
    return await ReservationRepository.getAllReservations();
  }

  static async fetchReservations(): Promise<Reservation[]> {
    return await this.getReservations();
  }

  /**
   * Synchronous helper for local getters
   */
  static getLocalReservations(): Reservation[] {
    ReservationRepository.getAllReservations().then((data) => {
      if (typeof window !== 'undefined' && data.length > 0) {
        localStorage.setItem('xfactory_reservations_v2', JSON.stringify(data));
      }
    });

    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('xfactory_reservations_v2');
      if (cached) return JSON.parse(cached);
    }
    return [];
  }

  static saveLocalReservations(reservations: Reservation[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('xfactory_reservations_v2', JSON.stringify(reservations));
      window.dispatchEvent(new CustomEvent('xfactory_reservations_changed'));
    }
  }

  /**
   * Create reservation with Double-Booking Prevention, Booking-Window & Quota
   * Enforcement, Role Bypass, and Approval Routing.
   *
   * `userRole` is used only to check `settings.bypassRoles` (booking window +
   * daily/weekly quotas are skipped for bypass roles, e.g. admin/super_admin/
   * director). It is never trusted for identity — `payload.user_id` should
   * already come from an authenticated source (see reservations.routes.ts,
   * which derives it from req.user rather than the client body).
   */
  static async createReservation(payload: Partial<Reservation>, userRole?: UserRole): Promise<Reservation> {
    const settings = await SettingsRepository.getSettings();
    const isBypassRole = !!userRole && settings.bypassRoles.includes(userRole);

    // 1. Double-booking conflict check (same desk, overlapping slot)
    if (payload.workstation_code && payload.reservation_date && payload.start_time && payload.end_time) {
      const conflict = await ReservationRepository.checkConflict(
        payload.workstation_code,
        payload.reservation_date,
        payload.start_time,
        payload.end_time
      );

      if (conflict) {
        throw new Error(`Conflit de réservation : Le poste ${payload.workstation_code} est déjà réservé sur ce créneau.`);
      }
    }

    // 2. Anticipation delay check: reservation must start at least bookingWindowDays from today
    if (!isBypassRole && payload.reservation_date) {
      const todayStr = new Date().toISOString().split('T')[0];
      const today = new Date(todayStr + 'T00:00:00');
      const minAllowedStart = new Date(today);
      minAllowedStart.setDate(minAllowedStart.getDate() + settings.bookingWindowDays);
      const requestedDate = new Date(payload.reservation_date + 'T00:00:00');

      if (requestedDate < minAllowedStart) {
        const minFormatted = minAllowedStart.toLocaleDateString('fr-FR');
        throw new Error(
          `Les réservations doivent être effectuées au moins ${settings.bookingWindowDays} jour(s) à l'avance. Date minimale : ${minFormatted}.`
        );
      }
    }

    // 3. Daily / weekly quota check for the requesting user
    if (!isBypassRole && payload.user_id && payload.reservation_date) {
      const userReservations = await ReservationRepository.getUserReservations(payload.user_id);

      const requestedDate = new Date(payload.reservation_date + 'T00:00:00');
      const startOfWeek = new Date(requestedDate);
      const dayOfWeek = startOfWeek.getDay() === 0 ? 7 : startOfWeek.getDay(); // ISO: Monday = 1
      startOfWeek.setDate(startOfWeek.getDate() - (dayOfWeek - 1));
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);

      const sameDayCount = userReservations.filter((r) => r.reservation_date === payload.reservation_date).length;
      const sameWeekCount = userReservations.filter((r) => {
        const d = new Date(r.reservation_date + 'T00:00:00');
        return d >= startOfWeek && d <= endOfWeek;
      }).length;

      if (sameDayCount >= settings.maxReservationsPerUserPerDay) {
        throw new Error(
          `Quota journalier atteint (${settings.maxReservationsPerUserPerDay} réservation(s) maximum par jour).`
        );
      }
      if (sameWeekCount >= settings.maxReservationsPerUserPerWeek) {
        throw new Error(
          `Quota hebdomadaire atteint (${settings.maxReservationsPerUserPerWeek} réservation(s) maximum par semaine).`
        );
      }
    }

    let requiresApproval = false;
    let initialStatus: ReservationStatus = 'confirmée';

    if (payload.start_time && payload.end_time && payload.reservation_date) {
      const start = new Date(`${payload.reservation_date}T${payload.start_time}`);
      const end = new Date(`${payload.reservation_date}T${payload.end_time}`);
      const durationHours = (end.getTime() - start.getTime()) / (1000 * 3600);

      if (durationHours > (settings.maxReservationDaysWithoutApproval * 24)) {
        requiresApproval = true;
        initialStatus = 'en attente';
      }
    }

    const newReservation = await ReservationRepository.createReservation({
      ...payload,
      status: initialStatus,
    });

    const current = this.getLocalReservations();
    this.saveLocalReservations([newReservation, ...current]);

    if (requiresApproval) {
      await ApprovalRepository.createApproval({
        reservation_id: newReservation.id,
        requester_id: newReservation.user_id,
        requester_name: newReservation.user_name,
        approver_role: 'executive_assistant',
        reason: `Réservation longue durée (${payload.reservation_date})`,
      });

      NotificationService.sendNotification(
        newReservation.user_id,
        'Demande d\'Approbation Requise',
        `Votre réservation sur ${newReservation.workstation_code} nécessite une approbation en raison de sa longue durée.`,
        'info'
      );
    } else {
      NotificationService.sendNotification(
        newReservation.user_id,
        'Réservation Confirmée',
        `Votre poste ${newReservation.workstation_code} a été réservé pour le ${newReservation.reservation_date}.`,
        'success'
      );
    }

    await AuditRepository.logEvent(
      'RESERVATION_CREATED',
      newReservation.user_id,
      newReservation.user_name || 'Collaborateur',
      'collaborator',
      newReservation.workstation_code,
      `Réservation ${newReservation.id} créée (Statut: ${initialStatus})`
    );

    return newReservation;
  }

  static async updateReservationStatus(id: string, status: ReservationStatus): Promise<boolean> {
    const success = await ReservationRepository.updateReservationStatus(id, status);
    const reservations = this.getLocalReservations().map((r) => (r.id === id ? { ...r, status } : r));
    this.saveLocalReservations(reservations);
    return success;
  }

  static async deleteReservation(id: string): Promise<boolean> {
    return await this.updateReservationStatus(id, 'annulée');
  }
}

export const createReservation = ReservationService.createReservation.bind(ReservationService);
export const getLocalReservations = ReservationService.getLocalReservations.bind(ReservationService);
export const saveLocalReservations = ReservationService.saveLocalReservations.bind(ReservationService);
export const deleteReservation = ReservationService.deleteReservation.bind(ReservationService);
export const fetchReservations = ReservationService.fetchReservations.bind(ReservationService);
export const updateReservationStatus = ReservationService.updateReservationStatus.bind(ReservationService);