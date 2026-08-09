import { AuditLogEntry } from '@/frontend/src/types';
import { supabase } from '@/database/client';
import { isDemoMode } from '@/frontend/src/modules/auth/utils/demoMode';

export async function apiFetchAuditLogs(showAll: boolean = false): Promise<{ data: AuditLogEntry[]; canSeeAll: boolean }> {
  const headers: Record<string, string> = {};

  if (!isDemoMode()) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return { data: [], canSeeAll: false };
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`/api/audit${showAll ? '?all=true' : ''}`, { headers });
  if (!response.ok) return { data: [], canSeeAll: false };
  const body = await response.json();
  return { data: body.data || [], canSeeAll: !!body.canSeeAll };
}

/** FR-96 / §26.1 "Export de données" — logs a data export from the client (dashboard/audit CSV
 * & Excel exports have no other server round-trip to hang the audit call off of). */
export async function apiLogExport(target_resource: string, details: string): Promise<void> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!isDemoMode()) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;
      headers.Authorization = `Bearer ${token}`;
    }
    await fetch('/api/audit', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'EXPORT', target_resource, details }),
    });
  } catch {
    // Non-blocking — a failed audit call must never prevent the export itself.
  }
}
