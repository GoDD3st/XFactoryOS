import { Cluster } from '@/frontend/src/types';
import { fetchClustersWithOverlays } from '@/services/workspaces/workspaceService';
import { ReservationRepository } from '@/database/repositories/reservationRepository';

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
    peakHourWindow: await computePeakHourWindow(),
    clusters: clusterTelemetry,
    timestamp: new Date().toISOString(),
  };
}

/** FR-82 "Peak Hours" — real bucketing of the last 7 days' reservation start times, replacing
 * what used to be a hardcoded '09:30 - 11:30' string shown to every user regardless of actual usage. */
async function computePeakHourWindow(): Promise<string> {
  try {
    const reservations = await ReservationRepository.getAllReservations();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const buckets: Record<number, number> = {};
    reservations
      .filter((r) => r.reservation_date >= weekAgo && ['confirmée', 'check-in', 'terminée'].includes(r.status))
      .forEach((r) => {
        const hour = parseInt((r.start_time || '08:00').split(':')[0], 10);
        buckets[hour] = (buckets[hour] || 0) + 1;
      });

    const topHour = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topHour === undefined) return 'Données insuffisantes';

    const h = Number(topHour);
    return `${String(h).padStart(2, '0')}:00 - ${String(h + 1).padStart(2, '0')}:00`;
  } catch {
    return 'Données insuffisantes';
  }
}

export interface DailyReservationTrend {
  date: string;
  count: number;
  noShows: number;
}

/** FR-86 "Reservation Trends" — daily reservation volume over the last N days. */
export async function getReservationTrends(days = 14): Promise<DailyReservationTrend[]> {
  const reservations = await ReservationRepository.getAllReservations();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (days - 1));

  const byDate = new Map<string, DailyReservationTrend>();
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split('T')[0];
    byDate.set(key, { date: key, count: 0, noShows: 0 });
  }

  reservations.forEach((r) => {
    const bucket = byDate.get(r.reservation_date);
    if (!bucket) return;
    bucket.count++;
    if (r.status === 'no-show') bucket.noShows++;
  });

  return Array.from(byDate.values());
}

export class TelemetryService {
  static getRealTimeTelemetry = getRealTimeTelemetry;
  static getReservationTrends = getReservationTrends;
}
