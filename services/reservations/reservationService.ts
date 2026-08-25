import { Reservation, ReservationStatus, UserRole } from '@/frontend/src/types';
import { SupabaseClient } from '@supabase/supabase-js';
import { ReservationRepository } from '@/database/repositories/reservationRepository';
import { SettingsRepository } from '@/database/repositories/settingsRepository';
import { ApprovalRepository } from '@/database/repositories/approvalRepository';
import { UserRepository } from '@/database/repositories/userRepository';
import { WorkstationRepository } from '@/database/repositories/workstationRepository';
import { NotificationService } from '../notifications/notificationService';
import { supabase } from '@/database/client';
import { apiCreateReservation, apiFetchReservations } from '../api/reservationApi';
import { isDateLockedDown, isPublicHoliday, isWeekend, getHolidayName, calculateBusinessDays } from '@/frontend/src/shared/utils/dateValidation';

const CACHE_KEY = 'xfactory_reservations_v2';

/**
 * BPMN D1 "GWAV NON -> Proposer alternatives (postes proches ou liste d'attente)" - carries
 * up-to-3 other available desks in the same cluster/slot so the caller can offer them instead
 * of a flat rejection.
 */
export class ReservationConflictError extends Error {
  alternatives: { code: string; cluster_name: string }[];
  constructor(message: string, alternatives: { code: string; cluster_name: string }[]) {
    super(message);
    this.name = 'ReservationConflictError';
    this.alternatives = alternatives;
  }
}

async function findAlternativeDesks(
  clusterName: string | undefined,
  excludeWorkstationCode: string | undefined,
  date: string,
  endDate: string,
  startTime: string,
  endTime: string,
  dbClient?: SupabaseClient
): Promise<{ code: string; cluster_name: string }[]> {
  if (!clusterName) return [];

  const [wsMap, clusters] = await Promise.all([
    WorkstationRepository.getWorkstations(dbClient),
    WorkstationRepository.getClusters(dbClient),
  ]);
  const cluster = clusters.find((c) => c.name === clusterName || c.code === clusterName);
  if (!cluster) return [];

  const candidates = (wsMap[cluster.id] || []).filter(
    (w) => w.code !== excludeWorkstationCode && w.reservable && w.status !== 'maintenance' && w.status !== 'management_reserved'
  );

  const alternatives: { code: string; cluster_name: string }[] = [];
  for (const seat of candidates) {
    if (alternatives.length >= 3) break;
    const conflict = await ReservationRepository.checkConflict(seat.code, date, startTime, endTime, undefined, dbClient, endDate).catch(() => true);
    if (!conflict) alternatives.push({ code: seat.code, cluster_name: cluster.name });
  }
  return alternatives;
}

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
   * Deliberately does NOT dispatch 'xfactory_reservations_changed' - this is a pure read/refresh,
   * and every current listener of that event (EndUserDashboard, ReservationsTable,
   * MyReservationsView) reacts to it by calling this same method. Dispatching here created an
   * unbounded feedback loop (event -> listener -> syncFromDatabase -> dispatch -> event -> ...)
   * that hammered /api/reservations continuously and tripped the rate limiter. Only actual
   * mutations (saveLocalReservations) and the realtime subscription / no-show ticker should
   * announce the event - this method just answers "what's current" without re-announcing it.
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
   * Read cached reservations only - does NOT trigger a background sync that could wipe data.
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

  /**
   * Creates a reservation, applying every rule that decides whether one is allowed to exist.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────────
   * BEFORE YOU MODIFY THIS
   *
   * This is the only sanctioned way to create a reservation. It is called from
   * POST /api/reservations, from the Digital Twin and form booking paths, and from the
   * waiting-list acceptOffer flow. Writing to ReservationRepository.createReservation directly
   * skips EVERY rule below - quotas, conflicts, VIP locks, approval routing - and produces a row
   * the rest of the system believes was validated.
   * ───────────────────────────────────────────────────────────────────────────────────────────
   *
   * TWO EXECUTION CONTEXTS, ONE FUNCTION.
   * In the browser it forwards to the authenticated API and returns - the rules below do NOT run
   * client-side, because a browser cannot be trusted to enforce them and its Supabase client is
   * RLS-limited anyway. Everything after that early return is the server path. The client still
   * calls validateReservationConstraints() separately for live feedback; that is a courtesy to
   * the user, not a control.
   *
   * ORDER OF CHECKS (it matters - cheap and absolute before expensive and conditional):
   *
   *  1. Workspace lockdown. Applies to EVERYONE, including bypass roles. A closed building is a
   *     physical fact, not an access-control rule; there is nothing to be privileged about.
   *  2. Weekend / public holiday. Configurable, skipped for bypass roles.
   *  3. Conflict over the whole span (see ReservationRepository.checkConflict). On conflict this
   *     throws ReservationConflictError CARRYING ALTERNATIVE DESKS, so the UI can offer a way
   *     forward instead of only refusing. Keep that payload if you touch the error.
   *  4. BR-07 VIP / management lock: a non-reservable desk needs a privileged role or membership
   *     in cluster_vip_members. This was once enforced only by disabling the button, which a
   *     direct POST ignored.
   *  5. Booking window: settings.bookingWindowDays minimum lead time.
   *  6. Quotas: per day and per week, counted from the user's existing reservations.
   *  7. Approval routing (below).
   *
   * APPROVAL ROUTING - two distinct pools, per SRS 8.6 and 8.7:
   *   - longer than maxReservationDaysWithoutApproval HOURS  → 'en attente', Executive Assistant
   *   - a multi-day span exceeding that many BUSINESS DAYS   → 'en attente', Director,
   *     with duration_days recorded
   * Both were once hardcoded to the EA while the client separately created a duplicate 'director'
   * row. That is why multi-day routing lives here and must not be recreated client-side.
   *
   * WHY EVERY RULE IS REPEATED SERVER-SIDE even though the UI checks it: client validation cannot
   * stop a direct POST, and two users can pass the same client-side availability check at the
   * same instant because both validated against data that was already stale. Do not remove a
   * check here on the grounds that the interface already prevents it.
   *
   * Side effects: writes the reservation, refreshes the local cache, creates an approval request
   * when one is required, and notifies the approver pool.
   *
   * @param userRole - the CALLER'S role, used for bypass and VIP decisions. The route passes
   *   req.user.role; it is never taken from the request body.
   * @param dbClient - the request-scoped Supabase client, so RLS evaluates as the calling user.
   * @throws ReservationConflictError with alternatives, or Error with a user-facing French
   *   message for any other rule.
   */
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

    // Workspace lockdown - always enforced (even for bypass roles: a physical closure isn't an
    // access-control rule). This is the server-side twin of validateReservationConstraints()'s
    // check, needed because the browser only calls that for live UI feedback - without this,
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
          `La date sélectionnée est un jour férié (${getHolidayName(payload.reservation_date, settings.holidays)}). Réservation impossible.`
        );
      }
    }

    // Business hours (settings.workingHoursStart / workingHoursEnd).
    //
    // This existed ONLY in the browser (validateReservationConstraints in
    // frontend/src/shared/utils/dateValidation.ts), so the rule held exactly as long as the
    // request came through the form. Anything else - a direct POST, a seeded row, a future
    // integration - could book outside opening hours, and production had a live 07:00-17:00
    // reservation on a site that opens at 08:00 to prove it.
    //
    // Placed with the weekend/holiday rules and skipped for bypass roles for the same reason
    // they are: these are operational scheduling rules, not physical facts about the building.
    // The lockdown check above is the one that binds everyone, because a closed floor is closed
    // to everybody.
    if (!isBypassRole && payload.start_time && payload.end_time) {
      const toMinutes = (hhmm: string) => {
        const [h, m] = hhmm.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      const openMins = toMinutes(settings.workingHoursStart);
      const closeMins = toMinutes(settings.workingHoursEnd);
      const startMins = toMinutes(payload.start_time);
      const endMins = toMinutes(payload.end_time);

      if (startMins < openMins || startMins >= closeMins) {
        throw new Error(
          `L'heure de début doit être comprise entre ${settings.workingHoursStart} et ${settings.workingHoursEnd}.`
        );
      }
      // End is compared with <= because a booking may finish exactly at closing time.
      if (endMins <= openMins || endMins > closeMins) {
        throw new Error(
          `L'heure de fin doit être comprise entre ${settings.workingHoursStart} et ${settings.workingHoursEnd}.`
        );
      }
      if (endMins <= startMins) {
        throw new Error("L'heure de fin doit être postérieure à l'heure de début.");
      }
    }

    const effectiveEndDate = payload.end_date || payload.reservation_date;

    if (payload.workstation_code && payload.reservation_date && payload.start_time && payload.end_time) {
      const conflict = await ReservationRepository.checkConflict(
        payload.workstation_code,
        payload.reservation_date,
        payload.start_time,
        payload.end_time,
        undefined,
        dbClient,
        effectiveEndDate
      );

      if (conflict) {
        const alternatives = await findAlternativeDesks(
          payload.cluster_name,
          payload.workstation_code,
          payload.reservation_date,
          effectiveEndDate!,
          payload.start_time,
          payload.end_time,
          dbClient
        );
        throw new ReservationConflictError(
          payload.end_date && payload.end_date !== payload.reservation_date
            ? `Conflit de réservation : Le poste ${payload.workstation_code} n'est pas disponible sur toute la période du ${payload.reservation_date} au ${payload.end_date}.`
            : `Conflit de réservation : Le poste ${payload.workstation_code} est déjà réservé sur ce créneau.`,
          alternatives
        );
      }
    }

    // BR-07: block booking a VIP/management-locked seat unless the requester holds one of the
    // roles that cluster is reserved for, or has been individually assigned to it. Previously
    // this was only enforced client-side (the seat button was disabled) - a direct POST here
    // had no server-side check at all.
    if (payload.workstation_code) {
      const client = dbClient || supabase;
      const { data: wsRow } = await client
        .from('workstations')
        .select('reservable, cluster_id')
        .eq('code', payload.workstation_code)
        .maybeSingle();

      if (wsRow && !wsRow.reservable) {
        const hasRoleBypass =
          !!userRole && ['director', 'executive_assistant', 'admin', 'super_admin'].includes(userRole);
        let isVipMember = false;
        if (!hasRoleBypass && payload.user_id && wsRow.cluster_id) {
          const { data: member } = await client
            .from('cluster_vip_members')
            .select('id')
            .eq('cluster_id', wsRow.cluster_id)
            .eq('user_id', payload.user_id)
            .maybeSingle();
          isVipMember = !!member;
        }
        if (!hasRoleBypass && !isVipMember) {
          throw new Error(
            `Le poste ${payload.workstation_code} est réservé à un accès Direction/VIP. Vous n'êtes pas autorisé à réserver ce poste.`
          );
        }
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
    // SRS 8.6 EA: approves long/sensitive same-day reservations. SRS 8.7 Director: approves
    // reservations exceeding the max configured duration (i.e. genuine multi-day spans). These
    // are two distinct approver pools now that approver_role is actually persisted and enforced
    // (see ApprovalService.decideApproval) - previously this was hardcoded to 'executive_assistant'
    // for every case, and a second, duplicate approval row (tagged 'director') was created
    // separately by the client for the multi-day case. That duplication is why multi-day approval
    // routing lives entirely here now instead of also being created client-side.
    let approverRole: 'executive_assistant' | 'director' = 'executive_assistant';
    let durationDays: number | undefined;

    if (payload.start_time && payload.end_time && payload.reservation_date) {
      const start = new Date(`${payload.reservation_date}T${payload.start_time}`);
      const end = new Date(`${payload.reservation_date}T${payload.end_time}`);
      const durationHours = (end.getTime() - start.getTime()) / (1000 * 3600);

      if (durationHours > settings.maxReservationDaysWithoutApproval * 24) {
        requiresApproval = true;
        initialStatus = 'en attente';
      }
    }

    // Multi-day span (end_date beyond reservation_date): enforced server-side too, not just via
    // the client's UI gating - a direct API call must not be able to book a multi-day span
    // without going through Director approval.
    if (payload.end_date && payload.end_date !== payload.reservation_date && payload.reservation_date) {
      const businessDays = calculateBusinessDays(payload.reservation_date, payload.end_date, payload.start_time, payload.end_time, settings.holidays);
      if (businessDays > settings.maxReservationDaysWithoutApproval) {
        requiresApproval = true;
        initialStatus = 'en attente';
        approverRole = 'director';
        durationDays = businessDays;
      }
    }

    const newReservation = await ReservationRepository.createReservation(
      { ...payload, status: initialStatus },
      dbClient
    );

    const current = this.readCachedReservations();
    this.saveLocalReservations([newReservation, ...current.filter((r) => r.id !== newReservation.id)]);

    if (requiresApproval) {
      const approvalRequest = await ApprovalRepository.createApproval({
        reservation_id: newReservation.id,
        requester_id: newReservation.user_id,
        requester_name: newReservation.user_name,
        user_department: newReservation.user_department,
        approver_role: approverRole,
        reason: payload.notes || `Réservation longue durée (${payload.reservation_date} → ${payload.end_date || payload.reservation_date})`,
        objective: payload.notes,
        reservation_date: payload.reservation_date,
        end_date: payload.end_date,
        start_time: payload.start_time,
        end_time: payload.end_time,
        workstation_code: payload.workstation_code,
        cluster_name: payload.cluster_name,
        duration_days: durationDays,
      });

      await NotificationService.sendNotification(
        newReservation.user_id,
        "Demande d'Approbation Requise",
        `Votre réservation sur ${newReservation.workstation_code} nécessite une approbation en raison de sa longue durée.`,
        'info',
        newReservation.id
      );

      // Tell the approver pool. Without this the request was written and nobody was informed -
      // it only surfaced if an approver happened to open the Approvals screen.
      try {
        const { ApprovalService } = await import('../approval/approvalService');
        await ApprovalService.notifyApprovers(approvalRequest);
      } catch (err) {
        console.warn('[Reservations] Could not notify approvers:', err);
      }
    } else {
      await NotificationService.sendNotification(
        newReservation.user_id,
        'Réservation Confirmée',
        `Votre poste ${newReservation.workstation_code} a été réservé pour le ${newReservation.reservation_date}.`,
        'success',
        newReservation.id
      );
    }

    // Reservation creation is already audited (action 'CREATE') inside
    // ReservationRepository.createReservation - this used to be a second, redundant call here,
    // and one that used an invalid audit_action enum value ('RESERVATION_CREATED'), so it was
    // silently failing on every insert anyway.

    // Refresh from DB so all views stay in sync (server-side path)
    await this.syncFromDatabase();

    return newReservation;
  }

  /**
   * Statuses that hand a desk back before its slot is over, so the waiting list should be offered
   * it. 'terminée' and 'no-show' are deliberately absent - the check-out and no-show paths run
   * their own cascade with the window they actually free, and duplicating it here would offer the
   * same desk twice.
   */
  private static readonly RELEASING_STATUSES: ReservationStatus[] = ['annulée', 'rejetée'];

  static async updateReservationStatus(id: string, status: ReservationStatus): Promise<boolean> {
    // Read before writing: the cascade needs the desk, cluster, date and window, and after the
    // update the row no longer describes a live booking.
    const previous = this.RELEASING_STATUSES.includes(status)
      ? await ReservationRepository.getReservationById(id)
      : null;

    const success = await ReservationRepository.updateReservationStatus(id, status);
    const reservations = this.readCachedReservations().map((r) => (r.id === id ? { ...r, status } : r));
    this.saveLocalReservations(reservations);
    await this.syncFromDatabase();

    // BPMN D5 EVENT → MATCH, "Annulation reservation" edge. The diagram gives three events that
    // free a desk - cancellation, no-show, and early check-out - and only the latter two were
    // wired up. A cancelled booking released the seat but never told the queue, so anyone waiting
    // on that exact desk stayed WAITING while it sat free.
    if (success && previous?.workstation_id) {
      try {
        const { WaitingListService } = await import('../waitinglist/waitingListService');
        await WaitingListService.processWaitingListFIFO(
          previous.cluster_id || previous.cluster_name,
          previous.reservation_date,
          previous.workstation_id,
          { start: previous.start_time, end: previous.end_time }
        );
      } catch (err) {
        // A cancellation must succeed even if the cascade cannot run - the desk is already free.
        console.warn('[Reservations] Waiting-list cascade after cancellation failed:', err);
      }
    }

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
