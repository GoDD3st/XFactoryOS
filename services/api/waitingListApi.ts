import { WaitingListEntry, WaitingListPreferences } from '@/frontend/src/types';
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

export async function apiFetchWaitingList(): Promise<WaitingListEntry[]> {
  const response = await fetch('/api/waiting-list', { headers: await authHeaders() });
  if (!response.ok) return [];
  const body = await response.json();
  return body.data || [];
}

export async function apiJoinWaitingList(payload: {
  cluster_preference?: string;
  /** Queue for one specific desk. Omit to queue for any desk in the cluster. */
  requested_workstation_id?: string;
  requested_workstation_code?: string;
  reservation_date: string;
  time_slot?: string;
  notes?: string;
  /** Attributes the desk must have for the offer to be made. Omit for no attribute constraints. */
  preferences?: WaitingListPreferences;
}): Promise<WaitingListEntry> {
  const response = await fetch('/api/waiting-list', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "Échec de l'inscription en liste d'attente.");
  }

  const result = await response.json();
  return result.data;
}

export async function apiCancelWaitingListEntry(id: string): Promise<boolean> {
  const response = await fetch(`/api/waiting-list/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  return response.ok;
}

export async function apiAcceptWaitingListOffer(id: string): Promise<void> {
  const response = await fetch(`/api/waiting-list/${id}/accept`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "Échec de l'acceptation de l'offre.");
  }
}

export async function apiDeclineWaitingListOffer(id: string): Promise<void> {
  const response = await fetch(`/api/waiting-list/${id}/decline`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "Échec du refus de l'offre.");
  }
}
