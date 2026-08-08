import { UserProfile, UserRole } from '@/frontend/src/types';
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

  return headers;
}

export async function apiFetchUsers(): Promise<UserProfile[]> {
  const headers: Record<string, string> = {};

  if (!isDemoMode()) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) return [];

    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch('/api/users', { headers, cache: 'no-store' });

  if (!response.ok) return [];

  const body = await response.json();
  return body.data || [];
}

export async function apiCreateUser(payload: {
  email: string;
  full_name: string;
  department: string;
  role: UserRole;
}): Promise<{ id: string; tempPassword: string }> {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || "Échec de la création de l'utilisateur.");
  }
  return result.data;
}

export async function apiSetUserStatus(userId: string, status: 'active' | 'inactive'): Promise<void> {
  const response = await fetch(`/api/users/${userId}/status`, {
    method: 'PATCH',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || 'Échec de la mise à jour du statut.');
  }
}

export async function apiUpdateUser(
  userId: string,
  payload: { full_name?: string; department?: string; role?: UserRole }
): Promise<void> {
  const response = await fetch(`/api/users/${userId}`, {
    method: 'PATCH',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || 'Échec de la mise à jour du profil.');
  }
}

export async function apiResetUserPassword(userId: string): Promise<{ tempPassword: string }> {
  const response = await fetch(`/api/users/${userId}/reset-password`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || 'Échec de la réinitialisation du mot de passe.');
  }
  return result.data;
}
