import { supabase } from '../client';
import { Workstation, Cluster } from '@/frontend/src/types';

export class WorkstationRepository {
  /**
   * Fetch all active clusters from Supabase
   */
  static async getClusters(): Promise<Cluster[]> {
    try {
      const { data, error } = await supabase
        .from('clusters')
        .select('*')
        .order('code', { ascending: true });

      if (error || !data || data.length === 0) {
        return [];
      }

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
      }));
    } catch (err) {
      console.warn('⚠️ Fetching clusters fallback:', err);
      return [];
    }
  }

  /**
   * Fetch all workstations grouped by cluster from Supabase
   */
  static async getWorkstations(): Promise<Record<string, Workstation[]>> {
    try {
      const { data: wsData, error: wsError } = await supabase
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
          visibleToUsers: w.visibleToUsers ?? true,
          metadata: {
            monitor_size: w.metadata?.monitor_size || '27" 4K Dual Dock',
            docking_station: w.metadata?.docking_station || 'USB-C Thunderbolt 4',
            has_double_screen: w.metadata?.has_double_screen ?? (seatNum % 2 === 0),
            near_window: w.metadata?.near_window ?? (seatNum === 1),
            is_pmr: w.metadata?.is_pmr ?? (seatNum === 1),
            is_quiet_zone: w.metadata?.is_quiet_zone ?? false,
            notes: w.metadata?.notes || 'Équipement OCP Safi',
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
   * Update seat status in Supabase
   */
  static async updateWorkstationStatus(id: string, status: string, reservable: boolean): Promise<boolean> {
    try {
      const dbStatus = this.mapDomainStatusToDb(status);
      const { error } = await supabase
        .from('workstations')
        .update({
          status: dbStatus,
          reservable: reservable,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) {
        await supabase
          .from('workstations')
          .update({ status: dbStatus, reservable })
          .eq('code', id);
      }
      return true;
    } catch (err) {
      console.error('Error updating workstation status:', err);
      return false;
    }
  }

  private static mapDbStatusToDomain(dbStatus: string, reservable: boolean): any {
    if (dbStatus === 'MAINTENANCE') return 'maintenance';
    if (dbStatus === 'MANAGEMENT_RESERVED' || !reservable) return 'management_reserved';
    if (dbStatus === 'OCCUPIED' || dbStatus === 'CHECKED_IN') return 'occupé';
    if (dbStatus === 'RESERVED') return 'réservé';
    return 'disponible';
  }

  private static mapDomainStatusToDb(domainStatus: string): string {
    if (domainStatus === 'maintenance') return 'MAINTENANCE';
    if (domainStatus === 'management_reserved') return 'MANAGEMENT_RESERVED';
    if (domainStatus === 'occupé' || domainStatus === 'check-in') return 'OCCUPIED';
    if (domainStatus === 'réservé' || domainStatus === 'confirmée') return 'RESERVED';
    return 'AVAILABLE';
  }
}
