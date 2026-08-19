import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../client';
import { WaitingListEntry, WaitingListPreferences } from '@/frontend/src/types';

/** "HH:mm" in the server's local timezone - the timezone entries are written in. */
function toLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" in local time, so a late-evening slot doesn't roll onto the next UTC day. */
function toLocalDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function resolveClient(): Promise<SupabaseClient> {
  if (typeof window === 'undefined') {
    const { getAdminClient } = await import('../serverClient');
    const admin = getAdminClient();
    if (admin) return admin;
  }
  return supabase;
}

// waiting_list_entries.space_id is a required FK to spaces - there's exactly one Open Space
// row (spaces.type = 'OPEN_SPACE') in this deployment, so resolve it once instead of hardcoding
// a placeholder UUID (which fails the FK constraint on every insert).
let cachedOpenSpaceId: string | null = null;
async function resolveOpenSpaceId(db: SupabaseClient): Promise<string> {
  if (cachedOpenSpaceId) return cachedOpenSpaceId;
  const { data } = await db.from('spaces').select('id').eq('type', 'OPEN_SPACE').limit(1).maybeSingle();
  if (!data?.id) {
    throw new Error("Espace Open Space introuvable dans Supabase - vérifiez l'initialisation des données.");
  }
  cachedOpenSpaceId = data.id;
  return cachedOpenSpaceId;
}

// preferred_cluster_id is a uuid FK to clusters - the app works with cluster codes (e.g. "CL-A").
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

/**
 * preferred_attributes is jsonb, so anything could be in the column. Keep only the three known
 * flags and only when true - the matcher treats `true` as a constraint and everything else as
 * "no opinion", so coercing here keeps that reading honest for legacy and hand-edited rows.
 */
function normalizePreferences(raw: any): WaitingListPreferences | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const prefs: WaitingListPreferences = {};
  if (raw.nearWindow === true) prefs.nearWindow = true;
  if (raw.isPMR === true) prefs.isPMR = true;
  if (raw.isQuietZone === true) prefs.isQuietZone = true;
  return Object.keys(prefs).length > 0 ? prefs : undefined;
}

export class WaitingListRepository {
  static async getWaitingList(): Promise<WaitingListEntry[]> {
    try {
      const db = await resolveClient();
      // Two FKs now point at workstations (the seat requested vs the seat offered), so the embeds
      // must name their constraint - a bare `workstations(code)` is ambiguous and errors out.
      const { data, error } = await db
        .from('waiting_list_entries')
        .select(
          '*, users(full_name, department), clusters(code), ' +
            'offered:workstations!waiting_list_entries_offered_workstation_id_fkey(code), ' +
            'requested:workstations!waiting_list_entries_requested_workstation_id_fkey(code)'
        )
        .order('fifo_rank', { ascending: true });

      if (error || !data) return [];

      return data.map((e: any) => ({
        id: e.id,
        user_id: e.user_id,
        user_name: e.users?.full_name || 'Collaborateur Safi',
        user_department: e.users?.department || 'Digital Factory',
        cluster_preference: e.clusters?.code || undefined,
        // Read back in LOCAL time, matching how addEntry wrote it.
        //
        // These were previously read with toISOString(), i.e. UTC, while the write side parses
        // `${date}T${time}` as local. On a UTC+1 server an entry queued for 08:00-18:00 came back
        // as 07:00-17:00. That is not merely cosmetic: acceptOffer splits this exact string to
        // build the reservation, so accepting an offer booked an hour earlier than requested - 
        // outside opening hours. mapRowToReservation in reservationRepository already does it
        // this way; this now matches.
        reservation_date: e.requested_start_at
          ? toLocalDate(e.requested_start_at)
          : toLocalDate(new Date().toISOString()),
        time_slot: e.requested_start_at && e.requested_end_at
          ? `${toLocalTime(e.requested_start_at)} - ${toLocalTime(e.requested_end_at)}`
          : '08:00 - 18:00',
        status: e.status === 'OFFERED' ? 'offered' : e.status === 'EXPIRED' ? 'expired' : e.status === 'ACCEPTED' ? 'fulfilled' : e.status === 'CANCELLED' ? 'cancelled' : 'waiting',
        created_at: e.created_at,
        notes: e.notes,
        requested_workstation_id: e.requested_workstation_id || undefined,
        requested_workstation_code: e.requested?.code || undefined,
        offered_workstation_id: e.offered_workstation_id || undefined,
        offered_workstation_code: e.offered?.code || undefined,
        offer_expires_at: e.offer_expires_at || undefined,
        preferences: normalizePreferences(e.preferred_attributes),
        // Same local-time reading as time_slot above - this string is split by acceptOffer to
        // build the reservation, so reading it in UTC would shift the booking by the offset.
        offered_time_slot:
          e.offered_start_at && e.offered_end_at
            ? `${toLocalTime(e.offered_start_at)} - ${toLocalTime(e.offered_end_at)}`
            : undefined,
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
        requested_workstation_id: payload.requested_workstation_id || null,
        requested_start_at: startAt,
        requested_end_at: endAt,
        status: 'WAITING',
        notes: payload.notes || null,
        preferred_attributes: payload.preferences || {},
      })
      .select()
      .single();

    if (error) {
      // 23505 = the one-active-entry-per-user-per-seat index. Queuing twice for the same desk is
      // a double click, not an error worth surfacing as a failure - report it as such.
      if ((error as any).code === '23505') {
        throw new Error("Vous êtes déjà inscrit sur la liste d'attente pour ce poste.");
      }
      throw new Error(`Échec de l'inscription en liste d'attente : ${error.message}`);
    }

    return {
      id: data.id,
      user_id: payload.user_id || 'usr-current',
      user_name: payload.user_name || 'Collaborateur Safi',
      user_department: payload.user_department || 'Digital Factory',
      cluster_preference: payload.cluster_preference,
      requested_workstation_id: payload.requested_workstation_id,
      requested_workstation_code: payload.requested_workstation_code,
      reservation_date: dateStr,
      time_slot: payload.time_slot || '08:00 - 18:00',
      status: 'waiting',
      created_at: data.created_at || new Date().toISOString(),
      notes: payload.notes,
      preferences: payload.preferences,
    };
  }

  /**
   * FR-70: mark the next FIFO entry as offered a freed desk, with an expiry window.
   *
   * `grantedWindow` is the hours the offer is good for - the entry's requested slot narrowed to
   * the hours the desk is actually free. It is stored separately from requested_start_at/end_at
   * because acceptOffer must book the granted hours, not the requested ones.
   */
  static async markOffered(
    id: string,
    workstationId?: string,
    offerMinutes = 15,
    grantedWindow?: { date: string; start: string; end: string }
  ): Promise<boolean> {
    try {
      const db = await resolveClient();
      const { error } = await db
        .from('waiting_list_entries')
        .update({
          status: 'OFFERED',
          offered_workstation_id: workstationId || null,
          offer_expires_at: new Date(Date.now() + offerMinutes * 60000).toISOString(),
          // Written as local time, matching how addEntry writes requested_start_at.
          offered_start_at: grantedWindow
            ? new Date(`${grantedWindow.date}T${grantedWindow.start}:00`).toISOString()
            : null,
          offered_end_at: grantedWindow
            ? new Date(`${grantedWindow.date}T${grantedWindow.end}:00`).toISOString()
            : null,
        })
        .eq('id', id);
      return !error;
    } catch (err) {
      return false;
    }
  }

  /** BPMN D5 GWRESP "ACCEPTE" branch - the offer was taken up and converted into a reservation. */
  static async markAccepted(id: string): Promise<boolean> {
    try {
      const db = await resolveClient();
      const { error } = await db
        .from('waiting_list_entries')
        .update({ status: 'ACCEPTED', resolved_at: new Date().toISOString() })
        .eq('id', id);
      return !error;
    } catch (err) {
      return false;
    }
  }

  /** BPMN D5 GWRESP "REFUSE ou expire" branch. */
  static async markExpired(id: string): Promise<boolean> {
    try {
      const db = await resolveClient();
      const { error } = await db
        .from('waiting_list_entries')
        .update({ status: 'EXPIRED', resolved_at: new Date().toISOString() })
        .eq('id', id);
      return !error;
    } catch (err) {
      return false;
    }
  }

  /** Soft-cancel (status = CANCELLED) - there's no DELETE policy on this table by design,
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
