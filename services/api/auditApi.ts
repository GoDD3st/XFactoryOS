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

/** FR-96 / §26.1 "Export de données" - logs a data export from the client (dashboard/audit CSV
 * & Excel exports have no other server round-trip to hang the audit call off of). */
/**
 * Records an audit event from the browser.
 *
 * Browser code must never write audit_logs directly. It used to, via AuditRepository, and the
 * table's INSERT policy allowed `public` - so the anon key shipped in this bundle could forge
 * entries attributed to anyone, with no account and no session. That policy is gone (migration
 * 20260818090000_restrict_audit_log_inserts_to_server); the server now derives actor_id,
 * actor_name and actor_role from the verified JWT and ignores whatever the body claims.
 *
 * Best-effort by design: a failed audit write must never block the action being recorded.
 */
export async function apiLogAuditEvent(
  action: string,
  target_resource: string,
  details: string
): Promise<void> {
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
      body: JSON.stringify({ action, target_resource, details }),
    });
  } catch {
    // Non-blocking - a failed audit call must never prevent the action itself.
  }
}

/** FR-87 export trace. Thin wrapper so there is one browser->audit path, not two. */
export async function apiLogExport(target_resource: string, details: string): Promise<void> {
  return apiLogAuditEvent('EXPORT', target_resource, details);
}
