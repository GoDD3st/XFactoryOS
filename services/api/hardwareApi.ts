import { HardwareDiagnosticsInfo } from '@/frontend/src/types';
import { supabase } from '@/database/client';
import { isDemoMode } from '@/frontend/src/modules/auth/utils/demoMode';

async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extra };
  if (!isDemoMode()) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return headers;
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function apiFetchHardwareDiagnostics(): Promise<HardwareDiagnosticsInfo[]> {
  const response = await fetch('/api/hardware/diagnostics', { headers: await authHeaders() });
  if (!response.ok) return [];
  const body = await response.json();
  return body.data || [];
}

export async function apiResetHardwarePort(workstationCode: string): Promise<void> {
  await fetch('/api/hardware/reset-port', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ workstation_code: workstationCode }),
  });
}
