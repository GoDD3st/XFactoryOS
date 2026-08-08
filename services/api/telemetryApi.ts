import { supabase } from '@/database/client';
import { isDemoMode } from '@/frontend/src/modules/auth/utils/demoMode';
import { DailyReservationTrend } from '@/services/telemetry/telemetryService';

export async function apiFetchReservationTrends(days = 14): Promise<DailyReservationTrend[]> {
  const headers: Record<string, string> = {};

  if (!isDemoMode()) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return [];
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`/api/telemetry/trends?days=${days}`, { headers });
  if (!response.ok) return [];
  const body = await response.json();
  return body.data || [];
}
