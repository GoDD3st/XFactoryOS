import { AuditLogEntry } from '@/frontend/src/types';
import { supabase } from '@/database/client';
import { isDemoMode } from '@/frontend/src/modules/auth/utils/demoMode';

export async function apiFetchAuditLogs(): Promise<AuditLogEntry[]> {
  const headers: Record<string, string> = {};

  if (!isDemoMode()) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return [];
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch('/api/audit', { headers });
  if (!response.ok) return [];
  const body = await response.json();
  return body.data || [];
}
