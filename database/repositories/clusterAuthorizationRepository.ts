import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../client';

// BR-09 / SRS §14.4: a collaborator requests temporary access to a locked management cluster;
// Building Manager, GCI Manager, Admin, or Super Admin approve or refuse it. This table already
// existed in the schema (with matching RLS) before any application code used it.
export type ClusterAuthorizationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'INFO_REQUESTED';

export interface ClusterAuthorization {
  id: string;
  cluster_id: string;
  cluster_code?: string;
  cluster_name?: string;
  requested_by: string;
  requester_name?: string;
  requester_department?: string;
  reason: string;
  status: ClusterAuthorizationStatus;
  starts_at?: string | null;
  ends_at?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  decision_note?: string | null;
  created_at: string;
}

// cluster_authorizations only grants INSERT to `requested_by = auth.uid()` and read/decide to
// requester-or-privileged-role - server-side callers acting on behalf of the ticker or across
// users need the service-role client to bypass RLS, matching every other repository here.
async function resolveClient(): Promise<SupabaseClient> {
  if (typeof window === 'undefined') {
    const { getAdminClient } = await import('../serverClient');
    const admin = getAdminClient();
    if (admin) return admin;
  }
  return supabase;
}

function mapRow(row: any): ClusterAuthorization {
  return {
    id: row.id,
    cluster_id: row.cluster_id,
    cluster_code: row.clusters?.code,
    cluster_name: row.clusters?.name,
    requested_by: row.requested_by,
    requester_name: row.requester?.full_name,
    requester_department: row.requester?.department,
    reason: row.reason,
    status: row.status,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    decided_by: row.decided_by,
    decided_at: row.decided_at,
    decision_note: row.decision_note,
    created_at: row.created_at,
  };
}

const SELECT_WITH_JOINS =
  '*, clusters(code, name), requester:users!cluster_authorizations_requested_by_fkey(full_name, department)';

export class ClusterAuthorizationRepository {
  static async create(
    clusterId: string,
    requestedBy: string,
    reason: string,
    startsAt?: string,
    endsAt?: string,
    dbClient?: SupabaseClient
  ): Promise<ClusterAuthorization> {
    const db = dbClient || (await resolveClient());
    const { data, error } = await db
      .from('cluster_authorizations')
      .insert({
        cluster_id: clusterId,
        requested_by: requestedBy,
        reason,
        status: 'PENDING',
        starts_at: startsAt || null,
        ends_at: endsAt || null,
      })
      .select(SELECT_WITH_JOINS)
      .single();

    if (error || !data) {
      throw new Error(error?.message || "Échec de la création de la demande d'autorisation cluster.");
    }

    return mapRow(data);
  }

  static async getPending(dbClient?: SupabaseClient): Promise<ClusterAuthorization[]> {
    const db = dbClient || (await resolveClient());
    const { data, error } = await db
      .from('cluster_authorizations')
      .select(SELECT_WITH_JOINS)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data.map(mapRow);
  }

  static async getById(id: string, dbClient?: SupabaseClient): Promise<ClusterAuthorization | null> {
    const db = dbClient || (await resolveClient());
    const { data, error } = await db.from('cluster_authorizations').select(SELECT_WITH_JOINS).eq('id', id).maybeSingle();
    if (error || !data) return null;
    return mapRow(data);
  }

  /** Approved-and-not-yet-expired authorizations - used by the auto-relock ticker. */
  static async getActiveApproved(dbClient?: SupabaseClient): Promise<ClusterAuthorization[]> {
    const db = dbClient || (await resolveClient());
    const { data, error } = await db.from('cluster_authorizations').select(SELECT_WITH_JOINS).eq('status', 'APPROVED');
    if (error || !data) return [];
    return data.map(mapRow);
  }

  /**
   * Full history (most recent first), optionally capped. Backs the Autorisations Management
   * screen's active/decided lists and its KPI counts.
   */
  static async getHistory(limit = 200, dbClient?: SupabaseClient): Promise<ClusterAuthorization[]> {
    const db = dbClient || (await resolveClient());
    const { data, error } = await db
      .from('cluster_authorizations')
      .select(SELECT_WITH_JOINS)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data.map(mapRow);
  }

  /**
   * `startsAt`/`endsAt` are the *decider's* window, which overrides whatever the requester
   * suggested - BR-09 requires the authorization to be temporary and the decider owns that call.
   */
  static async decide(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    decidedBy: string,
    decisionNote?: string,
    startsAt?: string,
    endsAt?: string,
    dbClient?: SupabaseClient
  ): Promise<ClusterAuthorization | null> {
    const db = dbClient || (await resolveClient());
    const { data, error } = await db
      .from('cluster_authorizations')
      .update({
        status: decision,
        decided_by: decidedBy,
        decided_at: new Date().toISOString(),
        decision_note: decisionNote || null,
        ...(decision === 'APPROVED' ? { starts_at: startsAt || new Date().toISOString(), ends_at: endsAt || null } : {}),
      })
      .eq('id', id)
      .select(SELECT_WITH_JOINS)
      .single();

    // Surface the real Postgres message instead of collapsing every failure into a null that the
    // caller reports as a generic "Échec de la décision." - that hid an invalid-uuid error on
    // decided_by for a full debugging cycle.
    if (error) throw new Error(`Échec de l'enregistrement de la décision : ${error.message}`);
    if (!data) return null;
    return mapRow(data);
  }
}
