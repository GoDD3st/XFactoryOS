/**
 * Every number on every dashboard is produced here.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS RUNS ON THE SERVER
 *
 * These functions used to be called from the browser. The reservation list a browser can read is
 * RLS-filtered to that user, so a Director opening the executive dashboard was computing the whole
 * building's occupancy FROM THEIR OWN BOOKINGS - a plausible-looking figure that was simply wrong,
 * and wrong in a way nothing on screen revealed.
 *
 * They now run behind /api/telemetry/*, which is gated by the `analytics` permission and reads
 * through the service-role client. The browser fetches finished numbers and does not aggregate.
 *
 * CONSEQUENCE: a new KPI belongs in this file, not in a component summing rows. If you find
 * yourself reducing over reservations inside a view, you are rebuilding the bug above.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Statuses: every figure counts REAL_USAGE_STATUSES only - a cancelled or rejected booking never
 * occupied a desk and must not appear in occupancy, department share or the forecast.
 */

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

/**
 * Live occupancy of the whole site, per cluster and in total.
 *
 * Business rule - what "occupied" means here:
 *   occupancyRate = (occupé + réservé) / totalDesks
 *
 * A RESERVED desk counts as occupied even though nobody is sitting at it yet. That is deliberate:
 * this figure answers "how much of the Open Space can still be given to someone today", and a
 * reserved desk cannot. It is NOT a presence measurement - for who is physically in the building,
 * use the check-in data (securityService's evacuation roster), not this.
 *
 * Maintenance desks stay in totalDesks. Capacity is a property of the room, and hiding a broken
 * desk would quietly flatter the occupancy rate.
 *
 * Reads through fetchClustersWithOverlays, so the seat statuses are the same ones the Digital Twin
 * paints - the dashboard and the floor plan cannot disagree about what is free.
 */
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
    siteName: 'Site Safi - Smart Open Space',
    totalCapacity,
    activeOccupancy: totalOccupied,
    overallOccupancyRate,
    peakHourWindow: await computePeakHourWindow(),
    clusters: clusterTelemetry,
    timestamp: new Date().toISOString(),
  };
}

/** FR-82 "Peak Hours" - real bucketing of the last 7 days' reservation start times, replacing
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

/** FR-86 "Reservation Trends" - daily reservation volume over the last N days. */
/**
 * FR-86 - daily reservation volume and no-shows over the last N days.
 *
 * Always answers in DAYS, whatever the window. The chart re-buckets to months from a year up
 * (services/telemetry/trendBuckets.ts); that is a rendering decision and does not belong here,
 * and the exports want the daily rows regardless of what the chart chose to draw.
 *
 * The window is clamped by the route, not here - see telemetry.routes.ts. An earlier version
 * clamped silently to 7..60, so asking for a year returned two months with nothing to indicate it.
 */
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

/** SRS "User Statistics" / "Department Statistics" - distinct active users per period, and
 * reservation share by department over the last 30 days. Both derived from real reservation
 * data already loaded elsewhere in this module (reservation_date, status, user_department). */
/**
 * Distinct active users per period, and the share of reservations by department.
 *
 * "Active" counts DISTINCT user ids, not reservations: a person who books three days this week is
 * one active user, not three. The department split is the opposite - it counts reservations,
 * because the question there is which department consumes the space, and a department booking
 * three desks consumes three.
 *
 * Both windows are rolling (last 7 / last 30 days from now), not calendar week or month. A
 * calendar month would make the figure collapse every 1st of the month and recover over the
 * following weeks, which reads as a drop in usage that never happened.
 *
 * Reservations with no department fall into 'Non renseigné' rather than being dropped, so the
 * percentages always sum to 100 and a data-quality gap stays visible instead of silently
 * shrinking the denominator.
 */
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
 * SRS "AI Predictions" - a genuine statistical forecast (same-weekday historical average over
 * the last 8 weeks), not a hardcoded or LLM-fabricated number. Deliberately simple: with only a
 * few months of reservation history available, a weekday-seasonal average is honest about what
 * this data can actually support, rather than dressing up a guess as machine learning.
 */
/**
 * SRS D6 "prédictions IA" - tomorrow's expected occupancy.
 *
 * THIS IS A STATISTICAL AVERAGE, NOT MACHINE LEARNING. It is the mean number of reservations on
 * the same weekday over the last 8 weeks, expressed against capacity. Deliberately so: with this
 * much history a fitted model would be fitting noise, and a simple average that everyone can
 * verify by hand is worth more than a black box that cannot be checked.
 *
 * Why same-weekday: desk demand is weekly, not daily. Averaging Monday-to-Sunday together would
 * predict a Saturday from Tuesday attendance.
 *
 * Flow:
 *   1. Keep only real usage (REAL_USAGE_STATUSES) strictly BEFORE tomorrow and within 8 weeks.
 *   2. Group by date and average the per-date counts - so a weekday that occurred 8 times is
 *      averaged over 8 days, not over the number of reservations.
 *   3. Express as a percentage of capacity, capped at 100.
 *   4. Derive the likely peak hour from the same rows.
 *
 * `sampleSize` is returned so the UI can be honest about a thin basis - a prediction from two
 * past Mondays should not be presented like one from eight. Do not drop it from the payload.
 *
 * Known limitation: it does not know about holidays or closures, so a public holiday tomorrow is
 * still predicted from ordinary weekdays. See README §22.
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

/**
 * The prediction with its own capacity figure, so callers don't have to supply one.
 *
 * The route uses this rather than taking totalCapacity from the request: capacity is the
 * denominator of the predicted rate, so accepting it from the client would let any caller with
 * analytics access dictate the number the dashboard displays.
 */
export async function getOccupancyPrediction(): Promise<OccupancyPrediction> {
  const telemetry = await getRealTimeTelemetry();
  return predictTomorrowOccupancy(telemetry.totalCapacity);
}

export class TelemetryService {
  static getRealTimeTelemetry = getRealTimeTelemetry;
  static getReservationTrends = getReservationTrends;
  static getUserDepartmentStats = getUserDepartmentStats;
  static predictTomorrowOccupancy = predictTomorrowOccupancy;
  static getOccupancyPrediction = getOccupancyPrediction;
}
