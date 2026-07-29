import { Cluster, Workstation, SeatStatus, Reservation } from '@/frontend/src/types';
import { getLocalReservations } from '@/services/reservations/reservationService';
import { LOCAL_STORAGE_WORKSTATIONS_KEY } from '@/services/supabase/supabaseClient';

export const INITIAL_CLUSTERS: Omit<Cluster, 'workstations'>[] = [
  {
    id: 'cl-A',
    code: 'CL-A',
    name: 'Innovation & Design',
    description: 'Espace créatif, double écran 4K, proximité tableau blanc & visioconférence.',
    is_management_only: false,
    enabled: true,
    desk_count: 8,
    location_zone: 'Aile Nord - Zone A1',
    icon_name: 'Sparkles'
  },
  {
    id: 'cl-B',
    code: 'CL-B',
    name: 'Digital Factory',
    description: 'Pôle Ingénierie logicielle & Data Analytics, stations réseau haute vitesse.',
    is_management_only: false,
    enabled: true,
    desk_count: 8,
    location_zone: 'Aile Nord - Zone A2',
    icon_name: 'Cpu'
  },
  {
    id: 'cl-C',
    code: 'CL-C',
    name: 'Facility Management',
    description: 'Gestion Bâtiment & Infrastructure Safi, accès rapide PMR & supervision IoT.',
    is_management_only: false,
    enabled: true,
    desk_count: 8,
    location_zone: 'Zone Centrale - Bâtiment C',
    icon_name: 'Building'
  },
  {
    id: 'cl-D',
    code: 'CL-D',
    name: 'Security & Access',
    description: 'Centre de contrôle sécurité site OCP Safi, badges & accréditations.',
    is_management_only: false,
    enabled: true,
    desk_count: 8,
    location_zone: 'Entrée Principale - Zone D',
    icon_name: 'ShieldCheck'
  },
  {
    id: 'cl-E',
    code: 'CL-E',
    name: 'GCI Governance',
    description: 'Gouvernance Chimie & Intégration Industrielle, bureaux insonorisés.',
    is_management_only: false,
    enabled: true,
    desk_count: 8,
    location_zone: 'Aile Est - Zone E',
    icon_name: 'Briefcase'
  },
  {
    id: 'cl-F',
    code: 'CL-F',
    name: 'Management Restricted 1',
    description: 'Cluster réservé Comité Direction & Managers OCP SA (Confidentialité haute).',
    is_management_only: true,
    enabled: true,
    desk_count: 8,
    location_zone: 'Étage Direction - VIP F',
    icon_name: 'Lock'
  },
  {
    id: 'cl-G',
    code: 'CL-G',
    name: 'Management Restricted 2',
    description: 'Espace Réunion Stratégique & Invités VIP OCP Safi.',
    is_management_only: true,
    enabled: true,
    desk_count: 8,
    location_zone: 'Étage Direction - VIP G',
    icon_name: 'Award'
  }
];

function generateWorkstationsForCluster(clusterCode: string, clusterId: string): Workstation[] {
  const workstations: Workstation[] = [];
  for (let seatNum = 1; seatNum <= 8; seatNum++) {
    const isExtension = seatNum >= 5;
    const seatCode = `${clusterCode}-0${seatNum}`;
    
    const metadata = {
      has_double_screen: seatNum % 2 === 1,
      near_window: seatNum === 1 || seatNum === 2 || seatNum === 8,
      is_pmr: seatNum === 1 || seatNum === 4,
      is_quiet_zone: clusterCode === 'CL-E' || clusterCode === 'CL-F' || seatNum >= 7,
      power_outlet: true,
      docking_station: 'USB-C Dual 4K Dock',
      monitor_size: seatNum % 2 === 1 ? '2x 27" Dell UltraSharp' : '1x 34" Curved WQHD',
      network_port: `ETH-SAF-${clusterCode}-${seatNum}`,
      notes: isExtension ? 'Poste Extension Admin OCP' : 'Poste Standard Ouvert'
    };

    workstations.push({
      id: `ws-${clusterCode.replace('CL-', '')}-0${seatNum}`,
      cluster_id: clusterId,
      code: seatCode,
      seat_number: seatNum,
      status: isExtension ? 'extension' : 'disponible',
      reservable: true,
      is_extension: isExtension,
      visibleToUsers: false,
      metadata
    });
  }
  return workstations;
}

export function generateAllWorkstations(): Record<string, Workstation[]> {
  const map: Record<string, Workstation[]> = {};
  INITIAL_CLUSTERS.forEach((cl) => {
    map[cl.id] = generateWorkstationsForCluster(cl.code, cl.id);
  });
  return map;
}

export function getSavedWorkstations(): Record<string, Workstation[]> {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_STORAGE_WORKSTATIONS_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    }
  } catch (err) {
    console.error('Error loading workstations:', err);
  }
  const generated = generateAllWorkstations();
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_STORAGE_WORKSTATIONS_KEY, JSON.stringify(generated));
  }
  return generated;
}

export function saveWorkstations(wsMap: Record<string, Workstation[]>): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_WORKSTATIONS_KEY, JSON.stringify(wsMap));
      window.dispatchEvent(new CustomEvent('xfactory_workstations_changed', { detail: wsMap }));
    }
  } catch (err) {
    console.error('Error saving workstations:', err);
  }
}

export async function fetchClustersWithOverlays(
  todayDate: string = new Date().toISOString().split('T')[0]
): Promise<Cluster[]> {
  const wsMap = getSavedWorkstations();
  const reservations = getLocalReservations();

  const activeResMap = new Map<string, Reservation>();
  reservations.forEach((res) => {
    if (
      res.reservation_date === todayDate &&
      (res.status === 'confirmée' || res.status === 'check-in' || res.status === 'en attente')
    ) {
      activeResMap.set(res.workstation_code, res);
      if (res.workstation_id) activeResMap.set(res.workstation_id, res);
    }
  });

  const clusters: Cluster[] = INITIAL_CLUSTERS.map((cl) => {
    const workstationsForCl = wsMap[cl.id] || generateWorkstationsForCluster(cl.code, cl.id);

    const mappedWorkstations: Workstation[] = workstationsForCl.map((ws) => {
      const res = activeResMap.get(ws.code) || activeResMap.get(ws.id);
      
      let computedStatus: SeatStatus = ws.status;

      if (ws.status === 'maintenance') {
        computedStatus = 'maintenance';
      } else if (res) {
        if (res.status === 'check-in') {
          computedStatus = 'occupé';
        } else if (res.status === 'confirmée' || res.status === 'en attente') {
          computedStatus = 'réservé';
        }
      } else if (ws.is_extension && !ws.visibleToUsers) {
        computedStatus = 'extension';
      } else {
        computedStatus = 'disponible';
      }

      return {
        ...ws,
        status: computedStatus,
      };
    });

    return {
      ...cl,
      workstations: mappedWorkstations,
    };
  });

  return clusters;
}

export async function toggleExtensionSeatVisibility(
  clusterId: string,
  seatId: string,
  visibleToUsers: boolean
): Promise<void> {
  const wsMap = getSavedWorkstations();
  if (wsMap[clusterId]) {
    const wsList = wsMap[clusterId];
    const targetIndex = wsList.findIndex((w) => w.id === seatId || w.code === seatId);
    if (targetIndex !== -1) {
      wsList[targetIndex].visibleToUsers = visibleToUsers;
      saveWorkstations(wsMap);
    }
  }
}

export async function setSeatMaintenanceStatus(
  clusterId: string,
  seatId: string,
  isMaintenance: boolean
): Promise<void> {
  const wsMap = getSavedWorkstations();
  if (wsMap[clusterId]) {
    const wsList = wsMap[clusterId];
    const targetIndex = wsList.findIndex((w) => w.id === seatId || w.code === seatId);
    if (targetIndex !== -1) {
      wsList[targetIndex].status = isMaintenance ? 'maintenance' : 'disponible';
      saveWorkstations(wsMap);
    }
  }
}

export class WorkspaceService {
  static getSavedWorkstations = getSavedWorkstations;
  static saveWorkstations = saveWorkstations;
  static fetchClustersWithOverlays = fetchClustersWithOverlays;
  static toggleExtensionSeatVisibility = toggleExtensionSeatVisibility;
  static setSeatMaintenanceStatus = setSeatMaintenanceStatus;
}
