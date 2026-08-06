import { Cluster, Workstation, SeatStatus } from '@/frontend/src/types';
import { WorkstationRepository } from '@/database/repositories/workstationRepository';
import { ReservationRepository } from '@/database/repositories/reservationRepository';
import { Reservation } from '@/frontend/src/types';
import { SupabaseClient } from '@supabase/supabase-js';

export const INITIAL_CLUSTERS: Cluster[] = [
  { id: 'cl-a', code: 'CL-A', name: 'Cluster A — Innovation & R&D', description: 'Zone dédiée aux projets d\'innovation et R&D Safi', desk_count: 4, is_management_only: false, enabled: true, location_zone: 'Zone Ouest Level 1', workstations: [] },
  { id: 'cl-b', code: 'CL-B', name: 'Cluster B — Digital Factory & Tech', description: 'Zone équipes développement et architecture SI', desk_count: 4, is_management_only: false, enabled: true, location_zone: 'Zone Centre Level 1', workstations: [] },
  { id: 'cl-c', code: 'CL-C', name: 'Cluster C — Facility Management & Operations', description: 'Opérations site et services généraux', desk_count: 4, is_management_only: false, enabled: true, location_zone: 'Zone Est Level 1', workstations: [] },
  { id: 'cl-d', code: 'CL-D', name: 'Cluster D — Security & Infrastructure', description: 'Supervision sécurité et infrastructure', desk_count: 4, is_management_only: false, enabled: true, location_zone: 'Zone Nord Level 1', workstations: [] },
  { id: 'cl-e', code: 'CL-E', name: 'Cluster E — GCI Governance', description: 'Gouvernance et conformité industrielle', desk_count: 4, is_management_only: false, enabled: true, location_zone: 'Zone Sud Level 1', workstations: [] },
  { id: 'cl-f', code: 'CL-F', name: 'Cluster F — Executive Direction', description: 'Cluster réservé Direction Générale', desk_count: 4, is_management_only: true, enabled: true, location_zone: 'Zone VIP Level 1', workstations: [] },
  { id: 'cl-g', code: 'CL-G', name: 'Cluster G — VIP Boardroom Annex', description: 'Annexe VIP réunion exécutive', desk_count: 4, is_management_only: true, enabled: true, location_zone: 'Zone VIP Level 1', workstations: [] },
];

export class WorkspaceService {
  /**
   * Get all workstation data from database repository with local caching
   */
  static getSavedWorkstations(): Record<string, Workstation[]> {
    WorkstationRepository.getWorkstations().then((data) => {
      if (typeof window !== 'undefined' && Object.keys(data).length > 0) {
        localStorage.setItem('xfactory_workstations_v2', JSON.stringify(data));
      }
    });

    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('xfactory_workstations_v2');
      if (cached) return JSON.parse(cached);
    }
    return this.generateDefaultWorkstations();
  }

  static async fetchClustersWithOverlays(): Promise<Cluster[]> {
    const wsMap = await WorkstationRepository.getWorkstations();
    const clusters = await WorkstationRepository.getClusters();

    let reservations: Reservation[] = [];
    if (typeof window !== 'undefined') {
      const { ReservationService } = await import('../reservations/reservationService');
      reservations = ReservationService.readCachedReservations();
    } else {
      try {
        const { getAdminClient } = await import('@/database/serverClient');
        const admin = getAdminClient();
        reservations = admin
          ? await ReservationRepository.getAllReservations(admin)
          : await ReservationRepository.getAllReservations();
      } catch {
        reservations = [];
      }
    }

    const reservedStatuses = new Set(['confirmée', 'check-in', 'en attente']);
    const reservedByWorkstationId = new Map<string, Reservation>();
    const reservedByWorkstationCode = new Map<string, Reservation>();

    reservations.forEach((r) => {
      if (!reservedStatuses.has(r.status)) return;
      if (r.workstation_id) reservedByWorkstationId.set(r.workstation_id, r);
      if (r.workstation_code) reservedByWorkstationCode.set(r.workstation_code, r);
    });

    const applyReservationOverlay = (ws: Workstation): Workstation => {
      if (ws.status === 'maintenance' || ws.status === 'management_reserved') return ws;

      const activeRes =
        reservedByWorkstationId.get(ws.id) || reservedByWorkstationCode.get(ws.code);

      if (!activeRes) return ws;

      const overlayStatus: SeatStatus =
        activeRes.status === 'check-in' ? 'occupé' : 'réservé';

      return { ...ws, status: overlayStatus, reservable: false };
    };

    const targetClusters = clusters.length > 0 ? clusters : INITIAL_CLUSTERS;
    const defaultWsMap = this.generateDefaultWorkstations();

    return targetClusters.map((c) => {
      const codeKey = c.code ? c.code.toLowerCase() : c.id;
      const formattedCodeKey = codeKey.startsWith('cl-') ? codeKey : `cl-${codeKey}`;

      const seats =
        (wsMap[c.id] && wsMap[c.id].length > 0 ? wsMap[c.id] : null) ||
        (wsMap[formattedCodeKey] && wsMap[formattedCodeKey].length > 0 ? wsMap[formattedCodeKey] : null) ||
        (wsMap[codeKey] && wsMap[codeKey].length > 0 ? wsMap[codeKey] : null) ||
        defaultWsMap[c.id] ||
        defaultWsMap[formattedCodeKey] ||
        defaultWsMap[c.code?.toLowerCase()] ||
        [];

      return {
        ...c,
        workstations: seats.map(applyReservationOverlay),
      };
    });
  }

  static generateDefaultWorkstations(): Record<string, Workstation[]> {
    const map: Record<string, Workstation[]> = {};
    INITIAL_CLUSTERS.forEach((cluster) => {
      map[cluster.id] = Array.from({ length: 4 }, (_, i) => {
        const seatNum = i + 1;
        return {
          id: `${cluster.id}-seat-${seatNum}`,
          cluster_id: cluster.id,
          code: `${cluster.code}-W${seatNum}`,
          seat_number: seatNum,
          status: cluster.is_management_only ? 'management_reserved' : 'disponible',
          reservable: !cluster.is_management_only,
          is_extension: false,
          visibleToUsers: true,
          metadata: {
            near_window: seatNum === 1,
            is_pmr: seatNum === 1,
            is_quiet_zone: cluster.id === 'cl-e',
          },
        };
      });
    });
    return map;
  }

  static async setSeatMaintenanceStatus(clusterId: string, seatId: string, isMaintenance: boolean): Promise<Record<string, Workstation[]>> {
    const workstations = this.getSavedWorkstations();
    const clusterSeats = workstations[clusterId];
    if (clusterSeats) {
      const seat = clusterSeats.find((s) => s.id === seatId);
      if (seat) {
        const newStatus: SeatStatus = isMaintenance ? 'maintenance' : 'disponible';
        seat.status = newStatus;
        await WorkstationRepository.updateWorkstationStatus(seat.id, newStatus, !isMaintenance);
        if (typeof window !== 'undefined') {
          localStorage.setItem('xfactory_workstations_v2', JSON.stringify(workstations));
          window.dispatchEvent(new CustomEvent('xfactory_workstations_changed'));
        }
      }
    }
    return workstations;
  }

  static toggleExtensionSeatVisibility(clusterId: string, seatId: string, visible: boolean): Record<string, Workstation[]> {
    const workstations = this.getSavedWorkstations();
    const clusterSeats = workstations[clusterId];
    if (clusterSeats) {
      const seat = clusterSeats.find((s) => s.id === seatId);
      if (seat) {
        seat.visibleToUsers = visible;
        if (typeof window !== 'undefined') {
          localStorage.setItem('xfactory_workstations_v2', JSON.stringify(workstations));
          window.dispatchEvent(new CustomEvent('xfactory_workstations_changed'));
        }
      }
    }
    return workstations;
  }

  static async toggleManagementClusterLock(
    clusterId: string,
    unlocked: boolean,
    actorId?: string,
    actorName?: string,
    dbClient?: SupabaseClient
  ): Promise<Record<string, Workstation[]>> {
    // Fetch live from Supabase (not the localStorage cache / synthetic-ID fallback that
    // getSavedWorkstations() can return) so the write below targets real workstation UUIDs.
    const workstations = await WorkstationRepository.getWorkstations(dbClient);
    const clusterSeats = workstations[clusterId] || workstations[clusterId.toLowerCase()];

    if (clusterSeats && clusterSeats.length > 0) {
      for (const seat of clusterSeats) {
        const newStatus: SeatStatus = unlocked ? 'disponible' : 'management_reserved';
        seat.status = newStatus;
        seat.reservable = unlocked;
        const updated = await WorkstationRepository.updateWorkstationStatus(seat.id, newStatus, unlocked, dbClient);
        if (!updated) {
          throw new Error(`Échec de mise à jour du poste ${seat.code} — le déblocage du cluster n'a pas été persisté.`);
        }
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('xfactory_workstations_v2', JSON.stringify(workstations));
        window.dispatchEvent(new CustomEvent('xfactory_workstations_changed'));
        window.dispatchEvent(new CustomEvent('xfactory_clusters_changed'));
      }

      const { AuditRepository } = await import('@/database/repositories/auditRepository');
      await AuditRepository.logEvent(
        unlocked ? 'CLUSTER_UNLOCKED_MANAGEMENT' : 'CLUSTER_LOCKED_MANAGEMENT',
        actorId || 'admin-current',
        actorName || 'Admin Direction Safi',
        'super_admin',
        clusterId,
        `Cluster Management ${clusterId.toUpperCase()} ${unlocked ? 'débloqué pour les utilisateurs' : 'verrouillé réservé Direction'}.`
      );
    }
    return workstations;
  }
}

export const fetchClustersWithOverlays = WorkspaceService.fetchClustersWithOverlays.bind(WorkspaceService);
export const getSavedWorkstations = WorkspaceService.getSavedWorkstations.bind(WorkspaceService);
export const setSeatMaintenanceStatus = WorkspaceService.setSeatMaintenanceStatus.bind(WorkspaceService);
export const toggleExtensionSeatVisibility = WorkspaceService.toggleExtensionSeatVisibility.bind(WorkspaceService);
export const toggleManagementClusterLock = WorkspaceService.toggleManagementClusterLock.bind(WorkspaceService);
