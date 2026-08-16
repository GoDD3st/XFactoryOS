import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../client';

/**
 * Late check-in requests: a reservation holder who missed the QR check-in asks a manager to
 * grant it. Same request/approve shape as cluster_authorizations.
 *
 * The database enforces the rules that matter, so they hold even if this layer is bypassed:
 *  - a request must belong to the reservation's owner (trigger)
 *  - nobody may review their own request (check constraint)
 *  - a decided row must carry reviewer + timestamp (check constraint)
 *  - at most one PENDING request per reservation (partial unique index)
 *  - only BUILDING_MANAGER / ADMIN / SUPER_ADMIN may update a row (RLS)
 */
export type LateCheckInStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface LateCheckInRequest {
  id: string;
  reservation_id: string;
  user_id: string;
  justification: string;
  status: LateCheckInStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  reviewer_comment?: string | null;
  created_at: string;
  updated_at: string;

  // Joined, for the reviewer's decision context.
  requester_name?: string;
  requester_email?: string;
  requester_department?: string;
  reviewer_name?: string;
  workstation_code?: string;
  cluster_name?: string;
  reservation_start?: string;
  reservation_end?: string;
  reservation_status?: string;
}

async function resolveClient(dbClient?: SupabaseClient): Promise<SupabaseClient> {
  if (dbClient) return dbClient;
  if (typeof window === 'undefined') {
    const { getAdminClient } = await import('../serverClient');
    const admin = getAdminClient();
    if (admin) return admin;
  }
  return supabase;
}

// users is embedded twice (requester and reviewer) so both need explicit FK hints, and
// reservations -> workstations -> clusters gives the reviewer the seat and zone.
const SELECT_WITH_JOINS = `
  *,
  requester:users!late_check_in_requests_user_id_fkey(full_name, email, department),
  reviewer:users!late_check_in_requests_reviewed_by_fkey(full_name),
  reservations(start_at, end_at, status, workstations(code, clusters(name)))
`;

function mapRow(row: any): LateCheckInRequest {
  const reservation = row.reservations;
  return {
    id: row.id,
    reservation_id: row.reservation_id,
    user_id: row.user_id,
    justification: row.justification,
    status: row.status,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    reviewer_comment: row.reviewer_comment,
    created_at: row.created_at,
    updated_at: row.updated_at,
    requester_name: row.requester?.full_name,
    requester_email: row.requester?.email,
    requester_department: row.requester?.department,
    reviewer_name: row.reviewer?.full_name,
    workstation_code: reservation?.workstations?.code,
    cluster_name: reservation?.workstations?.clusters?.name,
    reservation_start: reservation?.start_at,
    reservation_end: reservation?.end_at,
    reservation_status: reservation?.status,
  };
}

export class LateCheckInRepository {
  static async create(
    reservationId: string,
    userId: string,
    justification: string,
    dbClient?: SupabaseClient
  ): Promise<LateCheckInRequest> {
    const db = await resolveClient(dbClient);
    const { data, error } = await db
      .from('late_check_in_requests')
      .insert({ reservation_id: reservationId, user_id: userId, justification })
      .select(SELECT_WITH_JOINS)
      .single();

    if (error || !data) {
      // 23505 is the partial unique index: an open request already exists for this reservation.
      if (error?.code === '23505') {
        throw new Error('Une demande est déjà en attente pour cette réservation.');
      }
      throw new Error(error?.message || "Échec de la création de la demande de check-in tardif.");
    }
    return mapRow(data);
  }

  static async getById(id: string, dbClient?: SupabaseClient): Promise<LateCheckInRequest | null> {
    const db = await resolveClient(dbClient);
    const { data, error } = await db
      .from('late_check_in_requests')
      .select(SELECT_WITH_JOINS)
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return mapRow(data);
  }

  /** Every request, most recent first - the reviewer queue and its history. */
  static async getAll(limit = 200, dbClient?: SupabaseClient): Promise<LateCheckInRequest[]> {
    const db = await resolveClient(dbClient);
    const { data, error } = await db
      .from('late_check_in_requests')
      .select(SELECT_WITH_JOINS)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map(mapRow);
  }

  /** A single user's own requests, so they can follow their status. */
  static async getForUser(userId: string, dbClient?: SupabaseClient): Promise<LateCheckInRequest[]> {
    const db = await resolveClient(dbClient);
    const { data, error } = await db
      .from('late_check_in_requests')
      .select(SELECT_WITH_JOINS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data.map(mapRow);
  }

  /**
   * Decide a request. The `.eq('status', 'PENDING')` is the concurrency guard: two reviewers
   * acting at once both issue this UPDATE, but only the first matches a PENDING row - the
   * second returns no rows and is reported as already handled, so approval cannot run twice.
   */
  static async decide(
    id: string,
    status: Exclude<LateCheckInStatus, 'PENDING'>,
    reviewerId: string,
    reviewerComment: string | undefined,
    dbClient?: SupabaseClient
  ): Promise<LateCheckInRequest | null> {
    const db = await resolveClient(dbClient);
    const { data, error } = await db
      .from('late_check_in_requests')
      .update({
        status,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        reviewer_comment: reviewerComment || null,
      })
      .eq('id', id)
      .eq('status', 'PENDING')
      .select(SELECT_WITH_JOINS)
      .maybeSingle();

    if (error) {
      // The no-self-review constraint surfaces here rather than as a silent no-op.
      if (error.code === '23514') {
        throw new Error('Vous ne pouvez pas traiter votre propre demande.');
      }
      throw new Error(error.message || 'Échec de la décision.');
    }
    return data ? mapRow(data) : null;
  }
}
