import { RoleWithCount, RolePermissionRow } from '@/frontend/src/types';
import { RoleGrants } from '@/services/rbac/permissionCodes';
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

/**
 * Broadcast after a policy write so anything rendered from the policy can re-read it.
 *
 * Same pattern as `xfactory_settings_changed`: the Roles & Permissions screen and the navigation
 * menu are mounted at the same time in the same tab, and without this a Super Admin toggling
 * their own role's grants would keep the old menu until a reload - which looks exactly like the
 * bug this whole feature exists to fix.
 */
export const PERMISSIONS_CHANGED_EVENT = 'xfactory_permissions_changed';

/**
 * The signed-in user's OWN effective permissions, straight from the policy table.
 *
 * Returns `null` for "unknown", never for "denied", and every failure path lands there: a network
 * error, a non-2xx response, an unparseable body, or the server itself reporting that it could
 * not read `role_permissions`. Callers must treat `null` as "fall back to previous behaviour" -
 * the navigation resolver falls back to the hardcoded tab list, mirroring what requirePermission
 * does with its hardcoded role list when the same table is unreadable. Failing to an empty menu
 * on a database blip would be far worse than failing to a slightly generous one, because every
 * screen behind that menu is still guarded server-side.
 *
 * Deliberately does not reuse apiFetchPermissionsMatrix(): that endpoint needs manage_roles.read,
 * which seven of the ten roles do not have, and it returns every role's grid when one role's is
 * the only thing anyone needs here.
 */
export async function apiFetchMyPermissions(): Promise<RoleGrants | null> {
  try {
    const response = await fetch('/api/roles/me/permissions', { headers: await authHeaders() });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.data?.permissions ?? null;
  } catch {
    return null;
  }
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

  // Only after the server confirmed the write - the anti-lockout guard in the repository rejects
  // some edits, and announcing a change that did not happen would make the menu disagree with the
  // policy in the one direction that matters.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PERMISSIONS_CHANGED_EVENT));
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
