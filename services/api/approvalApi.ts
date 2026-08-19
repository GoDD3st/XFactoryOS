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

/** Decided requests (approved/refused), for the approver's counters and history view. */
/**
 * The signed-in user's own approval requests, any status.
 *
 * Owner-scoped server-side from the JWT, so it needs no approver permission - a requester is
 * entitled to see the state of their own request, including one sent back for clarification.
 */
export async function apiFetchMyApprovalRequests(): Promise<ApprovalRequest[]> {
  const response = await fetch('/api/approvals/mine', { headers: await authHeaders() });
  if (!response.ok) return [];
  return (await response.json()) || [];
}

export async function apiFetchApprovalHistory(): Promise<ApprovalRequest[]> {
  const response = await fetch('/api/approvals/history', { headers: await authHeaders() });
  if (!response.ok) return [];
  return response.json();
}

/**
 * BPMN D2 "UPDATE --> REVIEW"the requester completes a request returned with DEMANDER INFO.
 *
 * Goes through the API rather than calling the service directly from the browser: the previous
 * direct call wrote to localStorage only, so the re-submission never reached the database and the
 * approver never saw the completed request.
 */
export async function apiCompleteApprovalRequest(
  id: string,
  objective: string,
  reason: string
): Promise<void> {
  const response = await fetch(`/api/approvals/${id}/complete`, {
    method: 'PUT',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ objective, reason }),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || 'Échec de la re-soumission de la demande.');
  }
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
