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
    siteName: 'Site Safi — Smart Open Space',
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

export interface UserDepartmentStats {
  activeToday: number;
  activeThisWeek: number;
  activeThisMonth: number;
  departmentUsage: { department: string; count: number; percentage: number }[];
}

const REAL_USAGE_STATUSES = ['confirmée', 'check-in', 'terminée'];

/** SRS "User Statistics" / "Department Statistics" — distinct active users per period, and
 * reservation share by department over the last 30 days. Both derived from real reservation
 * data already loaded elsewhere in this module (reservation_date, status, user_department). */
export async function getUserDepartmentStats(): Promise<UserDepartmentStats> {
  const reservations = await ReservationRepository.getAllReservations();
  const real = reservations.filter((r) => REAL_USAGE_STATUSES.includes(r.status));

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const distinctUsersSince = (sinceDate: string) =>
    new Set(real.filter((r) => r.reservation_date >= sinceDate).map((r) => r.user_id)).size;

  const departmentCounts = new Map<string, number>();
  real
    .filter((r) => r.reservation_date >= monthAgo)
    .forEach((r) => {
      const dept = r.user_department || 'Non renseigné';
      departmentCounts.set(dept, (departmentCounts.get(dept) || 0) + 1);
    });

  const totalDeptReservations = Array.from(departmentCounts.values()).reduce((a, b) => a + b, 0);
  const departmentUsage = Array.from(departmentCounts.entries())
    .map(([department, count]) => ({
      department,
      count,
      percentage: totalDeptReservations > 0 ? Math.round((count / totalDeptReservations) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    activeToday: distinctUsersSince(today),
    activeThisWeek: distinctUsersSince(weekAgo),
    activeThisMonth: distinctUsersSince(monthAgo),
    departmentUsage,
  };
}

export interface OccupancyPrediction {
  predictedDate: string;
  predictedOccupancyRate: number;
  isHighDemand: boolean;
  peakWindow?: string;
  sampleSize: number;
}

const HIGH_DEMAND_THRESHOLD = 80;

/**
 * SRS "AI Predictions" — a genuine statistical forecast (same-weekday historical average over
 * the last 8 weeks), not a hardcoded or LLM-fabricated number. Deliberately simple: with only a
 * few months of reservation history available, a weekday-seasonal average is honest about what
 * this data can actually support, rather than dressing up a guess as machine learning.
 */
export async function predictTomorrowOccupancy(totalCapacity: number): Promise<OccupancyPrediction> {
  const reservations = await ReservationRepository.getAllReservations();
  const real = reservations.filter((r) => REAL_USAGE_STATUSES.includes(r.status));

  const tomorrow = new Date(Date.now() + 86400000);
  const tomorrowWeekday = tomorrow.getDay();
  const tomorrowDateStr = tomorrow.toISOString().split('T')[0];
  const cutoff = new Date(Date.now() - 56 * 86400000).toISOString().split('T')[0];

  const sameWeekdayPast = real.filter((r) => {
    if (r.reservation_date >= tomorrowDateStr || r.reservation_date < cutoff) return false;
    return new Date(`${r.reservation_date}T00:00:00`).getDay() === tomorrowWeekday;
  });

  const byDate = new Map<string, number>();
  sameWeekdayPast.forEach((r) => byDate.set(r.reservation_date, (byDate.get(r.reservation_date) || 0) + 1));
  const dailyCounts = Array.from(byDate.values());
  const avgCount = dailyCounts.length > 0 ? dailyCounts.reduce((a, b) => a + b, 0) / dailyCounts.length : 0;
  const predictedOccupancyRate = totalCapacity > 0 ? Math.min(100, Math.round((avgCount / totalCapacity) * 100)) : 0;

  const hourBuckets: Record<number, number> = {};
  sameWeekdayPast.forEach((r) => {
    const hour = parseInt((r.start_time || '08:00').split(':')[0], 10);
    hourBuckets[hour] = (hourBuckets[hour] || 0) + 1;
  });
  const topHour = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1])[0]?.[0];
  const peakWindow = topHour !== undefined ? `${String(Number(topHour)).padStart(2, '0')}:00 - ${String(Number(topHour) + 1).padStart(2, '0')}:00` : undefined;

  return {
    predictedDate: tomorrowDateStr,
    predictedOccupancyRate,
    isHighDemand: predictedOccupancyRate >= HIGH_DEMAND_THRESHOLD,
    peakWindow,
    sampleSize: dailyCounts.length,
  };
}

export class TelemetryService {
  static getRealTimeTelemetry = getRealTimeTelemetry;
  static getReservationTrends = getReservationTrends;
  static getUserDepartmentStats = getUserDepartmentStats;
  static predictTomorrowOccupancy = predictTomorrowOccupancy;
}
