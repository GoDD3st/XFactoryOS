import { ApprovalRequest } from '@/frontend/src/types';
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

export async function apiFetchPendingApprovals(): Promise<ApprovalRequest[]> {
  const response = await fetch('/api/approvals/pending', { headers: await authHeaders() });
  if (!response.ok) return [];
  return response.json();
}

export async function apiDecideApproval(
  id: string,
  decision: 'approved' | 'rejected' | 'needs_info',
  decisionNote: string
): Promise<boolean> {
  const response = await fetch(`/api/approvals/${id}/decide`, {
    method: 'PUT',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ decision, decisionNote }),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || "Échec de la décision d'approbation.");
  }

  const result = await response.json();
  return !!result.success;
}
