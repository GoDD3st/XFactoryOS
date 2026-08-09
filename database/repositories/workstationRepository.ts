import { supabase } from '../client';
import { Workstation, Cluster } from '@/frontend/src/types';
import { SupabaseClient } from '@supabase/supabase-js';

// Falls back to the service-role client on the server when the caller didn't pass one
// explicitly — most callers (check-in/out, no-show release) update workstation status on
// behalf of the acting user rather than as that user, and only admin/building/GCI-manager
// roles have a direct write RLS policy on this table.
async function resolveClient(explicit?: SupabaseClient): Promise<SupabaseClient> {
  if (explicit) return explicit;
  if (typeof window === 'undefined') {
    const { getAdminClient } = await import('../serverClient');
    const admin = getAdminClient();
    if (admin) return admin;
  }
  return supabase;
}

export class WorkstationRepository {
  /**
   * Resolve a workstation UUID from id and/or code (required for Supabase FK inserts).
   */
  static async resolveWorkstationId(
    workstationId?: string,
    workstationCode?: string,
    dbClient?: SupabaseClient
  ): Promise<string> {
    const { isValidUuid } = await import('../utils/uuid');
    const client = dbClient || (await import('../client')).supabase;

    if (workstationId && isValidUuid(workstationId)) {
      const { data } = await client.from('workstations').select('id').eq('id', workstationId).maybeSingle();
      if (data?.id) return data.id;
    }

    if (workstationCode) {
      const { data } = await client.from('workstations').select('id').eq('code', workstationCode).maybeSingle();
      if (data?.id) return data.id;
    }

    throw new Error(
      `Poste introuvable dans Supabase (${workstationCode || workstationId || 'inconnu'}). ` +
        'Vérifiez que le serveur a bien initialisé les clusters (npm run dev).'
    );
  }

  /**
   * Fetch all active clusters from Supabase
   */
  static async getClusters(dbClient: SupabaseClient = supabase): Promise<Cluster[]> {
    try {
      const { data, error } = await dbClient
        .from('clusters')
        .select('*')
        .order('code', { ascending: true });

      if (error || !data || data.length === 0) {
        return [];
      }

      const { data: vipRows } = await dbClient.from('cluster_vip_members').select('cluster_id, user_id');
      const vipByCluster = new Map<string, string[]>();
      (vipRows || []).forEach((r: any) => {
        if (!vipByCluster.has(r.cluster_id)) vipByCluster.set(r.cluster_id, []);
        vipByCluster.get(r.cluster_id)!.push(r.user_id);
      });

      return data.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        description: `Cluster ${c.code} — ${c.name}`,
        desk_count: c.desk_count || 4,
        is_management_only: c.management_reserved || false,
        enabled: c.enabled !== false,
        location_zone: 'Zone Central Safi Level 1',
        workstations: [],
        vipMemberIds: vipByCluster.get(c.id) || [],
      }));
    } catch (err) {
      console.warn('⚠️ Fetching clusters fallback:', err);
      return [];
    }
  }

  /**
   * Fetch all workstations grouped by cluster from Supabase
   */
  static async getWorkstations(dbClient: SupabaseClient = supabase): Promise<Record<string, Workstation[]>> {
    try {
      const { data: wsData, error: wsError } = await dbClient
        .from('workstations')
        .select('*')
        .order('code', { ascending: true });

      if (wsError || !wsData || wsData.length === 0) {
        return {};
      }

      const map: Record<string, Workstation[]> = {};

      wsData.forEach((w: any) => {
        const clusterUuid = w.cluster_id;
        const codeParts = w.code.split('-W');
        const clusterCodeRaw = codeParts[0] ? codeParts[0].toLowerCase() : 'cl-a';
        const clusterKey = clusterCodeRaw.startsWith('cl-') ? clusterCodeRaw : `cl-${clusterCodeRaw}`;
        const seatNum = w.metadata?.seat_number || parseInt(codeParts[1]) || 1;

        const workstationItem: Workstation = {
          id: w.id,
          cluster_id: clusterKey,
          code: w.code,
          seat_number: seatNum,
          status: this.mapDbStatusToDomain(w.status, w.reservable),
          reservable: w.reservable !== false,
          is_extension: seatNum > 4,
          visibleToUsers: w.metadata?.visibleToUsers ?? true,
          metadata: {
            near_window: w.metadata?.near_window ?? (seatNum === 1),
            is_pmr: w.metadata?.is_pmr ?? (seatNum === 1),
            is_quiet_zone: w.metadata?.is_quiet_zone ?? false,
            notes: w.metadata?.notes || '',
            is_temporary: w.metadata?.is_temporary ?? false,
            temp_start_at: w.metadata?.temp_start_at,
            temp_end_at: w.metadata?.temp_end_at,
          },
        };

        // Key by UUID
        if (clusterUuid) {
          if (!map[clusterUuid]) map[clusterUuid] = [];
          map[clusterUuid].push(workstationItem);
        }

        // Key by cluster code (e.g. cl-a, cl-b)
        if (clusterKey) {
          if (!map[clusterKey]) map[clusterKey] = [];
          // Avoid duplicate pushing if already pushed under same key
          if (!map[clusterKey].some(item => item.id === workstationItem.id)) {
            map[clusterKey].push(workstationItem);
          }
        }
      });

      return map;
    } catch (err) {
      console.warn('⚠️ Fetching workstations fallback:', err);
      return {};
    }
  }

  /**
   * Update seat status in Supabase. Matches by UUID `id` first, falling back to `code`
   * (some callers pass a workstation code instead of its UUID). Returns false — instead of
   * silently reporting success — when neither match updates a row, so callers can surface
   * a real failure rather than assuming the write landed.
   */
  static async updateWorkstationStatus(id: string, status: string, reservable: boolean, dbClient?: SupabaseClient): Promise<boolean> {
    try {
      const db = await resolveClient(dbClient);
      const dbStatus = this.mapDomainStatusToDb(status);
      const updatePayload = { status: dbStatus, reservable, updated_at: new Date().toISOString() };

      const { data, error } = await db
        .from('workstations')
        .update(updatePayload)
        .eq('id', id)
        .select('id');

      if (!error && data && data.length > 0) return true;

      const { data: dataByCode, error: errorByCode } = await db
        .from('workstations')
        .update(updatePayload)
        .eq('code', id)
        .select('id');

      if (errorByCode) {
        console.error('Error updating workstation status:', errorByCode);
        return false;
      }
      return !!dataByCode && dataByCode.length > 0;
    } catch (err) {
      console.error('Error updating workstation status:', err);
      return false;
    }
  }

  /**
   * Update status/reservable and merge metadata (visibility, amenities, notes) in one write.
   * Used by the admin edit modal, which needs to persist fields updateWorkstationStatus
   * doesn't touch. Merges against the current row's metadata since Supabase update() replaces
   * the jsonb column wholesale rather than patching individual keys.
   */
  static async updateWorkstation(
    id: string,
    updates: { status?: string; reservable?: boolean; metadataPatch?: Record<string, unknown> },
    dbClient?: SupabaseClient
  ): Promise<boolean> {
    try {
      const db = await resolveClient(dbClient);
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (updates.status !== undefined) payload.status = this.mapDomainStatusToDb(updates.status);
      if (updates.reservable !== undefined) payload.reservable = updates.reservable;

      if (updates.metadataPatch) {
        const { data: current } = await db.from('workstations').select('metadata').eq('id', id).maybeSingle();
        payload.metadata = { ...(current?.metadata || {}), ...updates.metadataPatch };
      }

      const { data, error } = await db.from('workstations').update(payload).eq('id', id).select('id');
      if (!error && data && data.length > 0) return true;

      const { data: dataByCode, error: errorByCode } = await db
        .from('workstations')
        .update(payload)
        .eq('code', id)
        .select('id');

      if (errorByCode) {
        console.error('Error updating workstation:', errorByCode);
        return false;
      }
      return !!dataByCode && dataByCode.length > 0;
    } catch (err) {
      console.error('Error updating workstation:', err);
      return false;
    }
  }

  private static mapDbStatusToDomain(dbStatus: string, reservable: boolean): any {
    if (dbStatus === 'DISABLED') return 'disabled';
    if (dbStatus === 'MAINTENANCE') return 'maintenance';
    if (dbStatus === 'MANAGEMENT_RESERVED' || !reservable) return 'management_reserved';
    if (dbStatus === 'OCCUPIED' || dbStatus === 'CHECKED_IN') return 'occupé';
    if (dbStatus === 'RESERVED') return 'réservé';
    return 'disponible';
  }

  private static mapDomainStatusToDb(domainStatus: string): string {
    if (domainStatus === 'disabled') return 'DISABLED';
    if (domainStatus === 'maintenance') return 'MAINTENANCE';
    // 'MANAGEMENT_RESERVED' is not a workstation_status enum value — callers also set
    // `reservable: false` alongside this, which mapDbStatusToDomain reads back correctly.
    if (domainStatus === 'management_reserved') return 'AVAILABLE';
    if (domainStatus === 'occupé' || domainStatus === 'check-in') return 'OCCUPIED';
    if (domainStatus === 'réservé' || domainStatus === 'confirmée') return 'RESERVED';
    return 'AVAILABLE';
  }
}
