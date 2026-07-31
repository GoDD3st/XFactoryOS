import { Cluster } from '@/frontend/src/types';
import { fetchClustersWithOverlays } from '@/services/workspaces/workspaceService';

export interface ClusterTelemetry {
  clusterId: string;
  clusterCode: string;
  clusterName: string;
  totalDesks: number;
  occupiedDesks: number;
  reservedDesks: number;
  availableDesks: number;
  maintenanceDesks: number;
  occupancyRate: number;
}

export interface SiteTelemetrySummary {
  siteName: string;
  totalCapacity: number;
  activeOccupancy: number;
  overallOccupancyRate: number;
  peakHourWindow: string;
  clusters: ClusterTelemetry[];
  timestamp: string;
}

export async function getRealTimeTelemetry(): Promise<SiteTelemetrySummary> {
  const clusters: Cluster[] = await fetchClustersWithOverlays();
  
  let totalCapacity = 0;
  let totalOccupied = 0;

  const clusterTelemetry: ClusterTelemetry[] = clusters.map((cluster) => {
    const totalDesks = cluster.workstations.length;
    const occupiedDesks = cluster.workstations.filter(
      (w) => w.status === 'occupé'
    ).length;
    const reservedDesks = cluster.workstations.filter(
      (w) => w.status === 'réservé'
    ).length;
    const availableDesks = cluster.workstations.filter(
      (w) => w.status === 'disponible'
    ).length;
    const maintenanceDesks = cluster.workstations.filter(
      (w) => w.status === 'maintenance'
    ).length;

    const occupancyRate = totalDesks > 0 
      ? Math.round(((occupiedDesks + reservedDesks) / totalDesks) * 100) 
      : 0;

    totalCapacity += totalDesks;
    totalOccupied += (occupiedDesks + reservedDesks);

    return {
      clusterId: cluster.id,
      clusterCode: cluster.code,
      clusterName: cluster.name,
      totalDesks,
      occupiedDesks,
      reservedDesks,
      availableDesks,
      maintenanceDesks,
      occupancyRate,
    };
  });

  const overallOccupancyRate = totalCapacity > 0 
    ? Math.round((totalOccupied / totalCapacity) * 100) 
    : 0;

  return {
    siteName: 'OCP SA - Safi Site Smart Open Space',
    totalCapacity,
    activeOccupancy: totalOccupied,
    overallOccupancyRate,
    peakHourWindow: '09:30 - 11:30',
    clusters: clusterTelemetry,
    timestamp: new Date().toISOString(),
  };
}

export class TelemetryService {
  static getRealTimeTelemetry = getRealTimeTelemetry;
}
