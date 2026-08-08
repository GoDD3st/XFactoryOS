import { supabase } from '@/database/client';
import { isDemoMode } from '@/frontend/src/modules/auth/utils/demoMode';

export interface NoShowStats {
  today: number;
  thisWeek: number;
  perCluster: Record<string, number>;
}

export async function apiFetchNoShowStats(): Promise<NoShowStats> {
  const headers: Record<string, string> = {};

  if (!isDemoMode()) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return { today: 0, thisWeek: 0, perCluster: {} };
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch('/api/noshow/stats', { headers });
  if (!response.ok) return { today: 0, thisWeek: 0, perCluster: {} };
  return response.json();
}
