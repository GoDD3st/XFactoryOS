import { Reservation, ReservationStatus, UserRole } from '@/frontend/src/types';
import { SupabaseClient } from '@supabase/supabase-js';
import { ReservationRepository } from '@/database/repositories/reservationRepository';
import { SettingsRepository } from '@/database/repositories/settingsRepository';
import { ApprovalRepository } from '@/database/repositories/approvalRepository';
import { AuditRepository } from '@/database/repositories/auditRepository';
import { UserRepository } from '@/database/repositories/userRepository';
import { NotificationService } from '../notifications/notificationService';
import { supabase } from '@/database/client';
import { apiCreateReservation, apiFetchReservations } from '../api/reservationApi';
import { isDateLockedDown, isPublicHoliday, isWeekend, getHolidayName } from '@/frontend/src/shared/utils/dateValidation';

const CACHE_KEY = 'xfactory_reservations_v2';

export class ReservationService {
  static readCachedReservations(): Reservation[] {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          return [];
        }
      }
    }
    return [];
  }

  static async getReservations(): Promise<Reservation[]> {
    return await ReservationRepository.getAllReservations();
  }

  static async fetchReservations(): Promise<Reservation[]> {
    return await this.syncFromDatabase();
  }

  /**
   * Pull authoritative reservations from Supabase and refresh local cache.
   * On failure, keeps existing cache (prevents wiping reservations after a failed read).
   *
   * Deliberately does NOT dispatch 'xfactory_reservations_changed' — this is a pure read/refresh,
   * and every current listener of that event (EndUserDashboard, ReservationsTable,
   * MyReservationsView) reacts to it by calling this same method. Dispatching here created an
   * unbounded feedback loop (event -> listener -> syncFromDatabase -> dispatch -> event -> ...)
   * that hammered /api/reservations continuously and tripped the rate limiter. Only actual
   * mutations (saveLocalReservations) and the realtime subscription / no-show ticker should
   * announce the event — this method just answers "what's current" without re-announcing it.
   */
  static async syncFromDatabase(): Promise<Reservation[]> {
    try {
      const data =
        typeof window !== 'undefined'
          ? await apiFetchReservations()
          : await ReservationRepository.getAllReservations();

      if (typeof window !== 'undefined') {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      }
      return data;
    } catch (err) {
      console.warn('syncFromDatabase: keeping cached reservations', err);
      return this.readCachedReservations();
    }
  }

  /**
   * Read cached reservations only — does NOT trigger a background sync that could wipe data.
   */
  static getLocalReservations(): Reservation[] {
    return this.readCachedReservations();
  }

  static saveLocalReservations(reservations: Reservation[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CACHE_KEY, JSON.stringify(reservations));
      window.dispatchEvent(new CustomEvent('xfactory_reservations_changed'));
    }
  }

  static async createReservation(
    payload: Partial<Reservation>,
    userRole?: UserRole,
    dbClient?: SupabaseClient
  ): Promise<Reservation> {
    // Browser: route through authenticated API (fixes RLS / permission denied)
    if (typeof window !== 'undefined') {
      const newReservation = await apiCreateReservation(payload, userRole);
      const current = this.readCachedReservations();
      this.saveLocalReservations([newReservation, ...current.filter((r) => r.id !== newReservation.id)]);
      await this.syncFromDatabase();
      window.dispatchEvent(new CustomEvent('xfactory_workstations_changed'));
      return newReservation;
    }

    // Server: ensure profile exists when using user-scoped client
    if (payload.user_id) {
      await UserRepository.ensureUserProfile({
        id: payload.user_id,
        email: undefined,
        user_metadata: { full_name: payload.user_name, department: payload.user_department },
      });
    }

    const settings = await SettingsRepository.getSettings();
    const isBypassRole = !!userRole && settings.bypassRoles.includes(userRole);

    // Workspace lockdown — always enforced (even for bypass roles: a physical closure isn't an
    // access-control rule). This is the server-side twin of validateReservationConstraints()'s
    // check, needed because the browser only calls that for live UI feedback — without this,
    // a direct POST to the API could bypass a lockdown entirely.
    if (payload.reservation_date) {
      const lockdown = isDateLockedDown(payload.reservation_date, settings.closedDates);
      if (lockdown) {
        throw new Error(
          `L'Open Space est fermé le ${new Date(payload.reservation_date + 'T00:00:00').toLocaleDateString('fr-FR')} (${lockdown.reason || 'fermeture exceptionnelle'}). Réservation impossible sur cette date.`
        );
      }
    }

    if (!isBypassRole && payload.reservation_date) {
      if (!settings.allowWeekendBooking && isWeekend(payload.reservation_date)) {
        throw new Error('Les réservations sont strictement interdites les week-ends (Samedi / Dimanche).');
      }
      if (!settings.allowHolidayBooking && isPublicHoliday(payload.reservation_date, settings.holidays)) {
        throw new Error(
          `La date sélectionnée est un jour férié OCP Safi (${getHolidayName(payload.reservation_date, settings.holidays)}). Réservation impossible.`
        );
      }
    }

    if (payload.workstation_code && payload.reservation_date && payload.start_time && payload.end_time) {
      const conflict = await ReservationRepository.checkConflict(
        payload.workstation_code,
        payload.reservation_date,
        payload.start_time,
        payload.end_time,
        undefined,
        dbClient
      );

      if (conflict) {
        throw new Error(
          `Conflit de réservation : Le poste ${payload.workstation_code} est déjà réservé sur ce créneau.`
        );
      }
    }

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

    if (!isBypassRole && payload.user_id && payload.reservation_date) {
      const userReservations = await ReservationRepository.getUserReservations(payload.user_id, dbClient);

      const requestedDate = new Date(payload.reservation_date + 'T00:00:00');
      const startOfWeek = new Date(requestedDate);
      const dayOfWeek = startOfWeek.getDay() === 0 ? 7 : startOfWeek.getDay();
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

      if (durationHours > settings.maxReservationDaysWithoutApproval * 24) {
        requiresApproval = true;
        initialStatus = 'en attente';
      }
    }

    const newReservation = await ReservationRepository.createReservation(
      { ...payload, status: initialStatus },
      dbClient
    );

    const current = this.readCachedReservations();
    this.saveLocalReservations([newReservation, ...current.filter((r) => r.id !== newReservation.id)]);

    if (requiresApproval) {
      await ApprovalRepository.createApproval({
        reservation_id: newReservation.id,
        requester_id: newReservation.user_id,
        requester_name: newReservation.user_name,
        approver_role: 'executive_assistant',
        reason: `Réservation longue durée (${payload.reservation_date})`,
      });

      await NotificationService.sendNotification(
        newReservation.user_id,
        "Demande d'Approbation Requise",
        `Votre réservation sur ${newReservation.workstation_code} nécessite une approbation en raison de sa longue durée.`,
        'info',
        newReservation.id
      );
    } else {
      await NotificationService.sendNotification(
        newReservation.user_id,
        'Réservation Confirmée',
        `Votre poste ${newReservation.workstation_code} a été réservé pour le ${newReservation.reservation_date}.`,
        'success',
        newReservation.id
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

    // Refresh from DB so all views stay in sync (server-side path)
    await this.syncFromDatabase();

    return newReservation;
  }

  static async updateReservationStatus(id: string, status: ReservationStatus): Promise<boolean> {
    const success = await ReservationRepository.updateReservationStatus(id, status);
    const reservations = this.readCachedReservations().map((r) => (r.id === id ? { ...r, status } : r));
    this.saveLocalReservations(reservations);
    await this.syncFromDatabase();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('xfactory_workstations_changed'));
    }
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
export const syncReservationsFromDb = ReservationService.syncFromDatabase.bind(ReservationService);
