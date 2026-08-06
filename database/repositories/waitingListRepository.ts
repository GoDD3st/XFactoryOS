import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../client';
import { WaitingListEntry } from '@/frontend/src/types';

async function resolveClient(): Promise<SupabaseClient> {
  if (typeof window === 'undefined') {
    const { getAdminClient } = await import('../serverClient');
    const admin = getAdminClient();
    if (admin) return admin;
  }
  return supabase;
}

// waiting_list_entries.space_id is a required FK to spaces — there's exactly one Open Space
// row (spaces.type = 'OPEN_SPACE') in this deployment, so resolve it once instead of hardcoding
// a placeholder UUID (which fails the FK constraint on every insert).
let cachedOpenSpaceId: string | null = null;
async function resolveOpenSpaceId(db: SupabaseClient): Promise<string> {
  if (cachedOpenSpaceId) return cachedOpenSpaceId;
  const { data } = await db.from('spaces').select('id').eq('type', 'OPEN_SPACE').limit(1).maybeSingle();
  if (!data?.id) {
    throw new Error("Espace Open Space introuvable dans Supabase — vérifiez l'initialisation des données.");
  }
  cachedOpenSpaceId = data.id;
  return cachedOpenSpaceId;
}

// preferred_cluster_id is a uuid FK to clusters — the app works with cluster codes (e.g. "CL-A").
async function resolveClusterId(db: SupabaseClient, clusterCode?: string): Promise<string | null> {
  if (!clusterCode) return null;
  const { data } = await db.from('clusters').select('id').eq('code', clusterCode).maybeSingle();
  return data?.id || null;
}

/** Parses "08:30 - 17:30" into {start:"08:30", end:"17:30"}, defaulting to a full business day. */
function parseTimeSlot(timeSlot?: string): { start: string; end: string } {
  const match = timeSlot?.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  return match ? { start: match[1], end: match[2] } : { start: '08:00', end: '18:00' };
}

export class WaitingListRepository {
  static async getWaitingList(): Promise<WaitingListEntry[]> {
    try {
      const db = await resolveClient();
      const { data, error } = await db
        .from('waiting_list_entries')
        .select('*, users(full_name, department), clusters(code)')
        .order('fifo_rank', { ascending: true });

      if (error || !data) return [];

      return data.map((e: any) => ({
        id: e.id,
        user_id: e.user_id,
        user_name: e.users?.full_name || 'Collaborateur Safi',
        user_department: e.users?.department || 'Digital Factory',
        cluster_preference: e.clusters?.code || undefined,
        reservation_date: e.requested_start_at
          ? new Date(e.requested_start_at).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        time_slot: e.requested_start_at && e.requested_end_at
          ? `${new Date(e.requested_start_at).toISOString().slice(11, 16)} - ${new Date(e.requested_end_at).toISOString().slice(11, 16)}`
          : '08:00 - 18:00',
        status: e.status === 'OFFERED' ? 'offered' : e.status === 'EXPIRED' ? 'expired' : e.status === 'ACCEPTED' ? 'fulfilled' : e.status === 'CANCELLED' ? 'cancelled' : 'waiting',
        created_at: e.created_at,
        notes: e.notes,
      }));
    } catch (err) {
      console.warn('Fetch waiting list fallback:', err);
      return [];
    }
  }

  static async addEntry(payload: Partial<WaitingListEntry>): Promise<WaitingListEntry> {
    const db = await resolveClient();
    const spaceId = await resolveOpenSpaceId(db);
    const clusterId = await resolveClusterId(db, payload.cluster_preference);

    const dateStr = payload.reservation_date || new Date().toISOString().split('T')[0];
    const { start, end } = parseTimeSlot(payload.time_slot);
    const startAt = new Date(`${dateStr}T${start}:00`).toISOString();
    const endAt = new Date(`${dateStr}T${end}:00`).toISOString();

    const { data, error } = await db
      .from('waiting_list_entries')
      .insert({
        user_id: payload.user_id,
        space_id: spaceId,
        preferred_cluster_id: clusterId,
        requested_start_at: startAt,
        requested_end_at: endAt,
        status: 'WAITING',
        notes: payload.notes || null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Échec de l'inscription en liste d'attente : ${error.message}`);
    }

    return {
      id: data.id,
      user_id: payload.user_id || 'usr-current',
      user_name: payload.user_name || 'Collaborateur Safi',
      user_department: payload.user_department || 'Digital Factory',
      cluster_preference: payload.cluster_preference,
      reservation_date: dateStr,
      time_slot: payload.time_slot || '08:00 - 18:00',
      status: 'waiting',
      created_at: data.created_at || new Date().toISOString(),
      notes: payload.notes,
    };
  }

  /** FR-70: mark the next FIFO entry as offered a freed desk, with an expiry window. */
  static async markOffered(id: string, workstationId?: string, offerMinutes = 15): Promise<boolean> {
    try {
      const db = await resolveClient();
      const { error } = await db
        .from('waiting_list_entries')
        .update({
          status: 'OFFERED',
          offered_workstation_id: workstationId || null,
          offer_expires_at: new Date(Date.now() + offerMinutes * 60000).toISOString(),
        })
        .eq('id', id);
      return !error;
    } catch (err) {
      return false;
    }
  }

  /** Soft-cancel (status = CANCELLED) — there's no DELETE policy on this table by design,
   * and preserving the row keeps FIFO/audit history intact. */
  static async cancelEntry(id: string): Promise<boolean> {
    try {
      const db = await resolveClient();
      const { error } = await db
        .from('waiting_list_entries')
        .update({ status: 'CANCELLED', resolved_at: new Date().toISOString() })
        .eq('id', id);
      return !error;
    } catch (err) {
      return false;
    }
  }
}
