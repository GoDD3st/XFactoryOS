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

// SRS §28.10 / FR-11 - bulk import. Call with dryRun:true to preview, then dryRun:false to apply.
export interface ImportRowResult {
  line: number;
  email: string;
  full_name: string;
  role: UserRole;
  status: 'ready' | 'created' | 'duplicate' | 'exists' | 'failed';
  message?: string;
  tempPassword?: string;
}

export interface ImportReport {
  dryRun: boolean;
  total: number;
  ready: number;
  created: number;
  skipped: number;
  failed: number;
  rows: ImportRowResult[];
}

export async function apiBulkImportUsers(
  rows: { email: string; full_name: string; department: string; role: UserRole }[],
  dryRun: boolean
): Promise<ImportReport> {
  const response = await fetch('/api/users/bulk-import', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ rows, dryRun }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || "Échec de l'import des utilisateurs.");
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

/**
 * Admin sets a SPECIFIC password for a user, as part of user CRUD.
 *
 * The value goes up and nothing comes back - the response carries no echo of the password, and
 * it is never stored client-side beyond the form field that submitted it.
 */
export async function apiSetUserPassword(userId: string, password: string): Promise<void> {
  const response = await fetch(`/api/users/${userId}/password`, {
    method: 'PUT',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ password }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || 'Échec de la modification du mot de passe.');
  }
}

/**
 * The signed-in user changes their own password. Clears the forced-rotation flag server-side.
 *
 * The current password is required and verified by the server - a valid session is not on its own
 * proof that the person at the keyboard is the account owner.
 */
export async function apiChangeOwnPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const response = await fetch('/api/users/me/password', {
    method: 'PUT',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ current_password: currentPassword, password: newPassword }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || 'Échec de la définition du mot de passe.');
  }
}

/** Whether the signed-in account is still on an admin-issued temporary password. */
export async function apiGetPasswordStatus(): Promise<{ mustChangePassword: boolean }> {
  const response = await fetch('/api/users/me/password-status', { headers: await authHeaders() });
  if (!response.ok) return { mustChangePassword: false };
  const result = await response.json().catch(() => ({}));
  return result.data || { mustChangePassword: false };
}

/** Notifies the administrators that this user wants their password changed. */
export async function apiRequestPasswordChange(message?: string): Promise<{ notified: number }> {
  const response = await fetch('/api/users/me/request-password-change', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(message ? { message } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || "Échec de l'envoi de la demande.");
  }
  return result.data;
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
