import { Cluster } from '@/frontend/src/types';
import { supabase } from '@/database/client';
import { isDemoMode } from '@/frontend/src/modules/auth/utils/demoMode';

async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extra };

  if (!isDemoMode()) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Vous devez être connecté pour effectuer cette action.');
    headers.Authorization = `Bearer ${token}`;
  }
  // Demo mode: no Authorization header — AuthContext's global fetch interceptor
  // injects X-Demo-Role, which authMiddleware.ts's DEMO_MODE branch honors.

  return headers;
}

export async function apiFetchClusters(): Promise<Cluster[]> {
  const response = await fetch('/api/workspaces/clusters', { headers: await authHeaders() });
  if (!response.ok) return [];
  const body = await response.json();
  return body.data || [];
}

export async function apiToggleClusterLock(clusterId: string, unlocked: boolean): Promise<void> {
  const response = await fetch(`/api/workspaces/clusters/${clusterId}/management-lock`, {
    method: 'PATCH',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ unlocked }),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || 'Échec du changement de statut du cluster.');
  }
}

async function patchJson(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || 'Échec de la requête.');
  }
}

export async function apiToggleSeatVisibility(clusterId: string, seatId: string, visibleToUsers: boolean): Promise<void> {
  await patchJson(`/api/workspaces/clusters/${clusterId}/seats/${seatId}/visibility`, { visibleToUsers });
}

export async function apiToggleSeatMaintenance(clusterId: string, seatId: string, isMaintenance: boolean): Promise<void> {
  await patchJson(`/api/workspaces/clusters/${clusterId}/seats/${seatId}/maintenance`, { isMaintenance });
}

export async function apiUpdateWorkstation(
  seatId: string,
  updates: {
    status?: string;
    reservable?: boolean;
    metadataPatch?: Record<string, unknown>;
  }
): Promise<void> {
  await patchJson(`/api/workspaces/seats/${seatId}`, updates);
}

export async function apiSetClusterVip(clusterId: string, isVip: boolean): Promise<void> {
  await patchJson(`/api/workspaces/clusters/${clusterId}/vip`, { isVip });
}

export async function apiGetClusterVipMembers(
  clusterId: string
): Promise<{ id: string; user_id: string; full_name: string; email: string; assigned_at: string }[]> {
  const response = await fetch(`/api/workspaces/clusters/${clusterId}/members`, { headers: await authHeaders() });
  if (!response.ok) return [];
  const body = await response.json();
  return body.data || [];
}

export async function apiAddClusterVipMember(clusterId: string, userId: string): Promise<void> {
  const response = await fetch(`/api/workspaces/clusters/${clusterId}/members`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ userId }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || "Échec de l'assignation.");
  }
}

export async function apiRemoveClusterVipMember(clusterId: string, userId: string): Promise<void> {
  const response = await fetch(`/api/workspaces/clusters/${clusterId}/members/${userId}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || 'Échec du retrait.');
  }
}

export async function apiLookupUsers(): Promise<{ id: string; full_name: string; email: string; department: string }[]> {
  const response = await fetch('/api/workspaces/users/lookup', { headers: await authHeaders() });
  if (!response.ok) return [];
  const body = await response.json();
  return body.data || [];
}

export interface AddExtensionSeatPayload {
  reason: string;
  isPublic: boolean;
  isTemporary: boolean;
  startAt?: string; // ISO 8601
  endAt?: string; // ISO 8601
}

export async function apiAddExtensionSeat(clusterId: string, payload: AddExtensionSeatPayload): Promise<void> {
  const response = await fetch(`/api/workspaces/clusters/${clusterId}/seats`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const detail =
      Array.isArray(result.errors) && result.errors.length > 0
        ? result.errors.map((e: { field: string; message: string }) => e.message).join(' · ')
        : null;
    throw new Error(detail || result.message || "Échec de l'ajout du poste.");
  }
}
