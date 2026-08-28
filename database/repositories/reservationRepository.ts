import { supabase, executeDbQuery, DatabaseError } from '../client';
import { SupabaseClient } from '@supabase/supabase-js';
import { Reservation, ReservationStatus } from '@/frontend/src/types';
import { AuditRepository } from './auditRepository';
import { WorkstationRepository } from './workstationRepository';
import { isValidUuid } from '../utils/uuid';
import { siteWallClockToEpoch } from '@/services/time/siteTime';

/**
 * `reservations` stores only foreign keys - there is no flat `workstation_code`, `user_name` or
 * `cluster_name` column. Reading with a plain `select('*')` therefore left every one of those
 * fields undefined, and mapRowToReservation() silently substituted its placeholders
 * ("WS-SF" / "Collaborateur Safi" / "Cluster A"). It only ever looked correct for reservations
 * created in the current browser session, because those carry a `fallback` from the client
 * payload; anything read fresh from the database showed the placeholder desk.
 *
 * `users` is embedded with an explicit FK hint: reservations has TWO foreign keys to users
 * (user_id and cancelled_by), so a bare `users(...)` embed is ambiguous and PostgREST rejects it.
 */
const RESERVATION_SELECT =
  '*, workstations(code, clusters(id, code, name)), users!reservations_user_id_fkey(full_name, department)';

/**
 * The module-level `supabase` client carries the anon key and is subject to RLS. Server-side
 * callers (routes, tickers) have no user JWT, so reads through it come back empty - which
 * surfaced as "Réservation introuvable" on the reception check-in path. Same resolveClient()
 * pattern the workstation/roles/clusterAuthorization repositories already use.
 */
async function resolveClient(): Promise<SupabaseClient> {
  if (typeof window === 'undefined') {
    const { getAdminClient } = await import('../serverClient');
    const admin = getAdminClient();
    if (admin) return admin;
  }
  return supabase;
}

export class ReservationRepository {
  /**
   * Fetch single reservation by ID
   */
  static async getReservationById(id: string): Promise<Reservation | null> {
    try {
      const db = await resolveClient();
      const { data, error } = await db
        .from('reservations')
        .select(RESERVATION_SELECT)
        .eq('id', id)
        .single();

      if (error || !data) return null;

      return this.mapRowToReservation(data);
    } catch (err) {
      console.warn('getReservationById fallback:', err);
      return null;
    }
  }

  /**
   * The double-booking check. This is the single point that makes two people unable to hold the
   * same desk at the same time.
   *
   * Business context: FR-24. Availability the client showed a user is a snapshot that was already
   * stale when it rendered - somebody else may have booked in between. This runs immediately
   * before the insert, against the database, which is why the database and not the UI is the
   * authority on availability.
   *
   * Overlap test: `newStart < rEnd && newEnd > rStart`. Touching endpoints do NOT overlap, so a
   * booking ending at 12:00 and another starting at 12:00 both stand - that is the half-open
   * interval the whole app assumes, and changing it here without changing seatAvailability.ts
   * would make the grid and the conflict check disagree about the same two bookings.
   *
   * Statuses excluded (CANCELLED, NO_SHOW, COMPLETED) are the ones that no longer hold the desk.
   * Everything else blocks - including pending approvals, deliberately: a reservation awaiting a
   * Director's decision has reserved the desk provisionally, and letting someone else take it
   * would mean approving a booking for a desk that is gone.
   *
   * Multi-day: `endDate` extends the window to the last day. Omitting it silently checks only the
   * first day, which is why ReservationService always passes `effectiveEndDate`.
   *
   * FAILS CLOSED. Any error - unreadable table, bad response - throws rather than returning
   * false. "We could not check" must never be treated as "there is no conflict"; that would hand
   * out a double booking on exactly the paths where something is already wrong.
   *
   * @param excludeReservationId - the reservation being MODIFIED, so it does not conflict with
   *   itself. Omit it on create.
   * @returns true when the requested window overlaps a live reservation on that desk.
   */
  static async checkConflict(
    workstationCode: string,
    reservationDate: string,
    startTime: string,
    endTime: string,
    excludeReservationId?: string,
    dbClient: SupabaseClient = supabase,
    endDate?: string
  ): Promise<boolean> {
    try {
      const workstationId = await WorkstationRepository.resolveWorkstationId(undefined, workstationCode, dbClient);
      const startAt = new Date(`${reservationDate}T${startTime}`).toISOString();
      const endAt = new Date(`${endDate || reservationDate}T${endTime}`).toISOString();

      let query = dbClient
        .from('reservations')
        .select('id, workstation_id, start_at, end_at, status')
        .eq('workstation_id', workstationId)
        .neq('status', 'CANCELLED')
        .neq('status', 'NO_SHOW')
        .neq('status', 'COMPLETED');

      if (excludeReservationId) {
        query = query.neq('id', excludeReservationId);
      }

      const { data, error } = await query;
      if (error) {
        throw new DatabaseError('reservations', 'select', error.message || 'Impossible de vérifier les conflits de réservation', error);
      }
      if (!data) return false;

      const newStart = new Date(startAt).getTime();
      const newEnd = new Date(endAt).getTime();

      return data.some((r: any) => {
        const rStart = new Date(r.start_at).getTime();
        const rEnd = new Date(r.end_at).getTime();
        return newStart < rEnd && newEnd > rStart;
      });
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      // Fail closed: an unreadable conflict check must never be treated as "no conflict".
      throw new DatabaseError('reservations', 'select', 'Impossible de vérifier la disponibilité du poste', err);
    }
  }

  /**
   * Find the reservation that lets `userId` check in/out of `workstationId` right now - 
   * used by the seat-QR badge scan flow. Only CONFIRMED (not yet checked in) or OCCUPIED
   * (already checked in, scanning again checks out) reservations count; the current moment
   * must fall within [start_at, end_at] so a seat's badge doesn't check someone into a
   * reservation for a different day.
   */
  static async getActiveReservationForUserAndSeat(
    userId: string,
    workstationId: string,
    client?: SupabaseClient
  ): Promise<Reservation | null> {
    if (!isValidUuid(userId) || !isValidUuid(workstationId)) return null;
    const dbClient = client || (await resolveClient());

    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await dbClient
        .from('reservations')
        .select('*')
        .eq('user_id', userId)
        .eq('workstation_id', workstationId)
        .in('status', ['CONFIRMED', 'OCCUPIED'])
        .lte('start_at', nowIso)
        .gte('end_at', nowIso)
        .order('start_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;
      return this.mapRowToReservation(data);
    } catch (err) {
      console.warn('getActiveReservationForUserAndSeat fallback:', err);
      return null;
    }
  }

  /**
   * Fetch active reservations for a single user
   */
  static async getUserReservations(userId: string, client?: SupabaseClient): Promise<Reservation[]> {
    if (!isValidUuid(userId)) return [];
    const dbClient = client || (await resolveClient());

    try {
      const { data, error } = await dbClient
        .from('reservations')
        .select(RESERVATION_SELECT)
        .eq('user_id', userId)
        .not('status', 'in', '(CANCELLED,NO_SHOW,REJECTED)')
        .order('start_at', { ascending: false });

      if (error) {
        throw new DatabaseError('reservations', 'select', error.message || "Impossible de lire les réservations de l'utilisateur", error);
      }
      if (!data) return [];

      return data.map((r: any) => this.mapRowToReservation(r));
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      // Fail closed: an unreadable reservation count must never be treated as "zero usage"
      // for quota enforcement (BR-04/BR-05, FR-30).
      throw new DatabaseError('reservations', 'select', "Impossible de vérifier le quota de réservations", err);
    }
  }

  /**
   * Every reservation touching one desk on one day - INCLUDING the cancelled, rejected and
   * completed rows the other readers filter out.
   *
   * Those rows are the point. Deciding whether the holder of a reservation may start earlier
   * means reading the desk's whole timeline: the booking immediately before theirs, whether it
   * ended early (a COMPLETED row plus check_out_at), and whether anything live sits in the gap.
   * A reader that filtered out completed bookings could not tell an early departure from a desk
   * that was never booked, and the two must not be confused - only the first creates an offer.
   *
   * Matched on the instant range rather than on a date column, so a multi-day booking that merely
   * passes through `date` is returned too.
   *
   * No client is passed on purpose: resolveClient() prefers the service-role client on the server,
   * which is what lets this see the previous occupant's row at all. Under a user-scoped client RLS
   * shows a collaborator only their own bookings, and the offer would simply never materialise -
   * the failure mode is "no extension offered", never "an extension wrongly granted".
   *
   * See services/reservations/earlyExtensionService.ts for the rule this feeds.
   */
  static async getSeatReservationsOnDate(
    workstationId: string,
    date: string,
    client?: SupabaseClient
  ): Promise<Reservation[]> {
    if (!isValidUuid(workstationId)) return [];
    const db = client || (await resolveClient());

    const dayStartMs = siteWallClockToEpoch(date, '00:00');
    if (!Number.isFinite(dayStartMs)) return [];
    const dayStart = new Date(dayStartMs).toISOString();
    const dayEnd = new Date(dayStartMs + 24 * 60 * 60 * 1000).toISOString();

    try {
      const { data, error } = await db
        .from('reservations')
        .select(RESERVATION_SELECT)
        .eq('workstation_id', workstationId)
        .lt('start_at', dayEnd)
        .gt('end_at', dayStart);
      if (error || !data) return [];
      return data.map((r: any) => this.mapRowToReservation(r));
    } catch {
      // Fail closed: no evidence of a release means no exception, not a free pass.
      return [];
    }
  }

  /**
   * Fetch all reservations from Supabase (throws on query error - never silently wipe cache)
   */

  private static deriveReservationType(date?: string, startTime?: string, endTime?: string, endDate?: string): string {
    if (endDate && date && endDate !== date) return 'MULTI_DAY';
    if (!date || !startTime || !endTime) return 'FULL_DAY';
      const [sh] = startTime.split(':').map(Number);
      const [eh] = endTime.split(':').map(Number);
    if (eh - sh <= 4) return sh < 13 ? 'HALF_DAY_AM' : 'HALF_DAY_PM';
      return 'FULL_DAY';
  }

  /**
   * Every reservation the caller is allowed to see.
   *
   * `dbClient` defaults to resolveClient(), NOT to the module-level `supabase`. It used to default
   * to `supabase`the anon-key client - and that made every bare server-side call return zero
   * rows: on the server there is no session, so `p_reservations_owner_read` matches neither
   * `user_id = auth.uid()` nor `has_role(...)`, and RLS filtered the table to nothing without
   * raising an error. The callers this silently disabled were the ones that matter most:
   *
   *   - the no-show ticker (NoShowService.detectNoShows) never saw a reservation to expire, so
   *     no-shows were never detected and the D5 waiting-list cascade they trigger never ran;
   *   - the auto check-out ticker (CheckInOutService.autoCheckOutExpired) likewise;
   *   - every telemetry aggregate - trends, department stats, peak hours, the occupancy
   *     forecast - computed over an empty array and returned zeros.
   *
   * Browser behaviour is unchanged: resolveClient() returns the same `supabase` client there.
   * Callers that deliberately want RLS scoping still pass their own client - backend/routes/
   * reservations.routes.ts passes a user-scoped one, and an explicit argument always wins.
   */
  static async getAllReservations(dbClient?: SupabaseClient): Promise<Reservation[]> {
    const db = dbClient || (await resolveClient());
    const { data, error } = await db
      .from('reservations')
      .select(RESERVATION_SELECT)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('getAllReservations error:', error);
      throw new DatabaseError('reservations', 'select', error.message || 'Impossible de lire les réservations', error);
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map((r: any) => this.mapRowToReservation(r));
  }

  /**
   * Create a new reservation in Supabase & log audit event.
   * Throws if the insert fails - never returns a fake local-only reservation.
   *
   * Falls back to resolveClient(), not the anon `supabase` client. Server-side callers that
   * insert on a user's behalf have no session, so the anon client fails
   * `p_reservations_owner_insert` with `42501 new row violates row-level security policy`. That
   * broke the BPMN D5 "ACCEPTE" branch outright: WaitingListService.acceptOffer calls this
   * without a client, so a correctly-made waiting-list offer could never be turned into a
   * reservation. Routes still pass their own client and are unaffected.
   */
  static async createReservation(
    payload: Partial<Reservation>,
    client?: SupabaseClient
  ): Promise<Reservation> {
    if (!payload.user_id || !isValidUuid(payload.user_id)) {
      throw new Error(
        'Session utilisateur invalide. Déconnectez-vous puis reconnectez-vous avec votre compte Supabase.'
      );
    }
    const dbClient = client || (await resolveClient());

    const workstationId = await WorkstationRepository.resolveWorkstationId(
      payload.workstation_id,
      payload.workstation_code,
      dbClient
    );

    const startAt = new Date(`${payload.reservation_date}T${payload.start_time}`).toISOString();
    const endAt = new Date(`${payload.end_date || payload.reservation_date}T${payload.end_time}`).toISOString();
    const dbStatus = this.mapDomainStatusToDb(payload.status || 'confirmée');


    const dbPayload = {
      workstation_id: workstationId,
      user_id: payload.user_id,
      type: this.deriveReservationType(payload.reservation_date, payload.start_time, payload.end_time, payload.end_date),
      start_at: startAt,
      end_at: endAt,
      status: dbStatus,
      requires_approval: payload.status === 'en attente',
      purpose: payload.purpose || 'Session travail',
      check_in_deadline: new Date(new Date(startAt).getTime() + 30 * 60000).toISOString(),
    };

    const data = await executeDbQuery<any>('reservations', 'insert', async () =>
      dbClient.from('reservations').insert(dbPayload).select().single()
    );

    const createdReservation = this.mapRowToReservation(data, payload);

    await AuditRepository.logEvent(
      'CREATE',
      createdReservation.user_id,
      createdReservation.user_name || 'Utilisateur',
      'collaborator',
      createdReservation.id,
      `Création réservation #${createdReservation.id.substring(0, 8)} pour ${createdReservation.user_name} sur poste ${createdReservation.workstation_code} le ${createdReservation.reservation_date}`,
      '10.120.4.18',
      'reservation'
    );

    return createdReservation;
  }

  /**
   * Moves an existing reservation's window, keeping every derived column consistent with it.
   *
   * The one sanctioned way to change WHEN a reservation happens. It exists for the early-extension
   * workflow (services/reservations/earlyExtensionService.ts) and deliberately does nothing else:
   * no status change, no desk change, no ownership change. Callers must have already established
   * that the new window is allowed - this method enforces no business rule of its own.
   *
   * check_in_deadline is recomputed rather than left alone. It is derived from the start, so a
   * reservation moved earlier while keeping a deadline computed from its old start would be
   * checkable-in long after the no-show window should have closed.
   *
   * A `23P01` from Postgres is the exclusion constraint on (workstation_id, period) refusing an
   * overlap with another live reservation. That is the race the application cannot close by
   * checking first: two requests can both read a free gap and only one may have it. It is
   * translated into a user-facing refusal rather than a 500 - losing that race is a normal
   * outcome, not a fault.
   */
  static async updateReservationWindow(
    id: string,
    window: { date: string; startTime: string; endTime: string; endDate?: string },
    client?: SupabaseClient
  ): Promise<Reservation | null> {
    const db = client || (await resolveClient());

    const startAt = new Date(`${window.date}T${window.startTime}`).toISOString();
    const endAt = new Date(`${window.endDate || window.date}T${window.endTime}`).toISOString();

    const { data, error } = await db
      .from('reservations')
      .update({
        start_at: startAt,
        end_at: endAt,
        check_in_deadline: new Date(new Date(startAt).getTime() + 30 * 60000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(RESERVATION_SELECT)
      .single();

    if (error) {
      if ((error as any).code === '23P01') {
        throw new Error("Ce créneau vient d'être pris sur ce poste. Rafraîchissez la page.");
      }
      console.error('updateReservationWindow error:', error);
      return null;
    }

    return data ? this.mapRowToReservation(data) : null;
  }

  /**
   * Update reservation status in Supabase & log audit event
   */
  static async updateReservationStatus(id: string, status: ReservationStatus, extra?: any): Promise<boolean> {
    try {
      const dbStatus = this.mapDomainStatusToDb(status);
      const updateObj: any = {
        status: dbStatus,
        updated_at: new Date().toISOString(),
        ...extra,
      };

      const db = await resolveClient();
      const { error } = await db.from('reservations').update(updateObj).eq('id', id);
      if (error) {
        console.error('Error updating reservation status:', error);
        return false;
      }

      await AuditRepository.logEvent(
        'UPDATE',
        'system',
        'XFactory OS',
        'admin',
        id,
        `Mise à jour statut réservation #${id.substring(0, 8)} à : ${status}`,
        '10.120.4.18',
        'reservation'
      );

      return true;
    } catch (err) {
      console.error('Error updating reservation status:', err);
      return false;
    }
  }

  private static mapRowToReservation(data: any, fallback?: Partial<Reservation>): Reservation {
    const formatTime = (iso: string) => {
      const d = new Date(iso);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    // Joined values win over the client-supplied `fallback`: the database is authoritative, and
    // the fallback only exists so a just-created reservation can be returned before it's re-read.
    const seat = data.workstations;
    const cluster = seat?.clusters;
    const person = data.users;

    return {
      id: data.id,
      user_id: data.user_id,
      user_name: person?.full_name || fallback?.user_name || data.user_name || 'Collaborateur Safi',
      user_department: person?.department || fallback?.user_department || data.user_department || 'Digital Factory',
      workstation_id: data.workstation_id,
      workstation_code: seat?.code || fallback?.workstation_code || data.workstation_code || 'WS-SF',
      cluster_id: cluster?.id || fallback?.cluster_id || data.cluster_id || 'cl-a',
      cluster_name: cluster?.name || fallback?.cluster_name || data.cluster_name || 'Cluster A',
      reservation_date: data.start_at
        ? new Date(data.start_at).toISOString().split('T')[0]
        : fallback?.reservation_date || new Date().toISOString().split('T')[0],
      end_date: data.end_at
        ? new Date(data.end_at).toISOString().split('T')[0]
        : fallback?.end_date,
      start_time: data.start_at ? formatTime(data.start_at) : fallback?.start_time || '08:30',
      end_time: data.end_at ? formatTime(data.end_at) : fallback?.end_time || '17:30',
      status: this.mapDbStatusToDomain(data.status),
      created_at: data.created_at,
      check_in_at: data.check_in_at,
      check_out_at: data.check_out_at,
      notes: data.cancel_reason || fallback?.notes || '',
      purpose: data.purpose || fallback?.purpose || 'Session travail',
    };
  }

  // Must match the Postgres enum reservation_status exactly: DRAFT, PENDING_APPROVAL,
  // CONFIRMED, CHECK_IN_PENDING, OCCUPIED, COMPLETED, CANCELLED, REJECTED, NO_SHOW,
  // AVAILABLE_RELEASED. 'CHECKED_IN' is NOT a valid value - using it (as a previous version of
  // this mapping did) makes every check-in write fail outright with an invalid-enum error.
  static mapDbStatusToDomain(dbStatus: string): ReservationStatus {
    if (dbStatus === 'OCCUPIED') return 'check-in';
    if (dbStatus === 'NO_SHOW') return 'no-show';
    if (dbStatus === 'PENDING_APPROVAL') return 'en attente';
    if (dbStatus === 'CANCELLED') return 'annulée';
    if (dbStatus === 'REJECTED') return 'rejetée';
    if (dbStatus === 'COMPLETED') return 'terminée';
    return 'confirmée';
  }

  static mapDomainStatusToDb(domainStatus: string): string {
    if (domainStatus === 'check-in') return 'OCCUPIED';
    if (domainStatus === 'no-show') return 'NO_SHOW';
    if (domainStatus === 'en attente') return 'PENDING_APPROVAL';
    if (domainStatus === 'annulée') return 'CANCELLED';
    if (domainStatus === 'rejetée') return 'REJECTED';
    if (domainStatus === 'terminée' || domainStatus === 'check-out') return 'COMPLETED';
    return 'CONFIRMED';
  }
}
