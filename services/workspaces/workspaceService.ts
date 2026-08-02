import { Cluster, Workstation, SeatStatus } from '@/frontend/src/types';
import { WorkstationRepository } from '@/database/repositories/workstationRepository';

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
        workstations: seats,
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
            monitor_size: '27" 4K Dual Dock',
            docking_station: 'USB-C Thunderbolt 4',
            has_double_screen: seatNum % 2 === 0,
            near_window: seatNum === 1,
            is_pmr: seatNum === 1,
            is_quiet_zone: cluster.id === 'cl-e',
            notes: 'Équipement OCP Safi',
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
}

export const fetchClustersWithOverlays = WorkspaceService.fetchClustersWithOverlays.bind(WorkspaceService);
export const getSavedWorkstations = WorkspaceService.getSavedWorkstations.bind(WorkspaceService);
export const setSeatMaintenanceStatus = WorkspaceService.setSeatMaintenanceStatus.bind(WorkspaceService);
export const toggleExtensionSeatVisibility = WorkspaceService.toggleExtensionSeatVisibility.bind(WorkspaceService);
