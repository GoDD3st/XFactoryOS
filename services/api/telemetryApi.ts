import { supabase } from '@/database/client';
import { isDemoMode } from '@/frontend/src/modules/auth/utils/demoMode';
import {
  DailyReservationTrend,
  OccupancyPrediction,
  SiteTelemetrySummary,
  UserDepartmentStats,
} from '@/services/telemetry/telemetryService';

/**
 * BPMN D6 routes the Executive Dashboard's KPIs through the API layer rather than computing them
 * in the browser, and that is not only an architecture preference - it is the only way the
 * numbers come out right.
 *
 * The telemetry functions aggregate ReservationRepository.getAllReservations(). Called from the
 * browser that read goes through the anon/user client and is filtered by RLS, and
 * `p_reservations_owner_read` only grants table-wide read to SUPER_ADMIN, ADMIN,
 * BUILDING_MANAGER, GCI_MANAGER and RECEPTIONIST. Director, Executive Assistant, IT Admin and
 * Security Guard all pass the `analytics` permission check and all fall outside that policy, so
 * for them the aggregate silently collapsed to their own reservations - a Director opened the
 * executive dashboard and saw department shares, peak hours and the occupancy forecast computed
 * from their personal bookings, with no error to indicate it.
 *
 * Server-side the same repository resolves the service-role client, so these endpoints aggregate
 * the whole table. Access is gated by requirePermission('analytics', 'read') instead of by RLS.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};

  if (!isDemoMode()) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return headers;
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Returns `fallback` on any failure - a 403 for a role without analytics access is an expected
 * outcome here, not an error worth tearing the dashboard down over. Callers render their own
 * empty state.
 */
async function fetchTelemetry<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`/api/telemetry/${path}`, { headers: await authHeaders() });
    if (!response.ok) return fallback;
    const body = await response.json();
    return (body.data as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function apiFetchReservationTrends(days = 14): Promise<DailyReservationTrend[]> {
  return fetchTelemetry<DailyReservationTrend[]>(`trends?days=${days}`, []);
}

/** Live occupancy per cluster + site totals. Null when unavailable, so views can keep their
 * "Chargement..." state rather than rendering a site with zero capacity. */
export async function apiFetchOccupancy(): Promise<SiteTelemetrySummary | null> {
  return fetchTelemetry<SiteTelemetrySummary | null>('occupancy', null);
}

export async function apiFetchDepartmentStats(): Promise<UserDepartmentStats | null> {
  return fetchTelemetry<UserDepartmentStats | null>('departments', null);
}

export async function apiFetchOccupancyPrediction(): Promise<OccupancyPrediction | null> {
  return fetchTelemetry<OccupancyPrediction | null>('prediction', null);
}
