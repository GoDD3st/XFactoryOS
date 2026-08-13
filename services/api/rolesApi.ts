import { RoleWithCount, RolePermissionRow } from '@/frontend/src/types';
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

export async function apiFetchRoles(): Promise<RoleWithCount[]> {
  const response = await fetch('/api/roles', { headers: await authHeaders() });
  if (!response.ok) return [];
  const body = await response.json();
  return body.data || [];
}

export async function apiFetchPermissionsMatrix(): Promise<RolePermissionRow[]> {
  const response = await fetch('/api/roles/permissions-matrix', { headers: await authHeaders() });
  if (!response.ok) return [];
  const body = await response.json();
  return body.data || [];
}

export async function apiCreateRole(code: string, name: string, description: string): Promise<RoleWithCount> {
  const response = await fetch('/api/roles', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ code, name, description }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || 'Échec de la création du rôle.');
  }
  return body.data;
}

export async function apiUpdateRolePermission(
  roleId: string,
  permissionId: string,
  flags: Partial<{ can_read: boolean; can_create: boolean; can_update: boolean; can_delete: boolean; can_approve: boolean }>
): Promise<void> {
  const response = await fetch(`/api/roles/${roleId}/permissions/${permissionId}`, {
    method: 'PATCH',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(flags),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || 'Échec de la mise à jour de la permission.');
  }
}

export async function apiDeleteRole(roleId: string, masterKey: string): Promise<void> {
  const response = await fetch(`/api/roles/${roleId}`, {
    method: 'DELETE',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ masterKey }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || 'Échec de la suppression du rôle.');
  }
}
