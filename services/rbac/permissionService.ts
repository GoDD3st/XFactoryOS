import { UserRole } from '@/frontend/src/types';

/**
 * Route-level enforcement backed by the `role_permissions` policy table.
 *
 * Before this, the Roles & Permissions screen was a documented policy record only — every route
 * gated on a hardcoded `requireRole(...)` list, so toggling a cell changed nothing. This service
 * makes the table authoritative.
 *
 * Design constraints that matter:
 *  - **Never brick the app.** If the policy cannot be loaded (DB outage, empty table, migration
 *    half-applied), `can()` returns `null` = "unknown", and the middleware falls back to the
 *    hardcoded role list it was given. A database blip must not lock every user out.
 *  - **Never allow permanent lockout.** Super Admin's grip on `manage_roles` is enforced
 *    separately (see requirePermission and RoleRepository.updateRolePermission) so a single
 *    toggle can't remove the only way to undo it.
 *  - Cached in memory because this runs on every gated request; invalidated on policy writes.
 */

export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'approve';

const ACTION_COLUMN: Record<PermissionAction, string> = {
  read: 'can_read',
  create: 'can_create',
  update: 'can_update',
  delete: 'can_delete',
  approve: 'can_approve',
};

// App-facing UserRole -> public.roles.code, mirroring ROLE_TO_DB_CODE in userRepository.ts.
const ROLE_TO_DB_CODE: Record<UserRole, string> = {
  collaborator: 'EMPLOYEE',
  receptionist: 'RECEPTIONIST',
  building_manager: 'BUILDING_MANAGER',
  gci_manager: 'GCI_MANAGER',
  executive_assistant: 'EXECUTIVE_ASSISTANT',
  director: 'DIRECTOR',
  admin: 'ADMIN',
  super_admin: 'SUPER_ADMIN',
  it_admin: 'IT_ADMIN',
  security_guard: 'SECURITY',
};

type PolicyMap = Map<string, Map<string, Record<string, boolean>>>;

let cache: PolicyMap | null = null;
let loadingPromise: Promise<PolicyMap | null> | null = null;
let lastLoadFailed = false;

async function fetchPolicy(): Promise<PolicyMap | null> {
  try {
    const { getAdminClient } = await import('@/database/serverClient');
    const admin = getAdminClient();
    if (!admin) return null;

    const { data, error } = await admin
      .from('role_permissions')
      .select('can_read, can_create, can_update, can_delete, can_approve, roles(code), permissions(code)');

    if (error || !data || data.length === 0) return null;

    const map: PolicyMap = new Map();
    for (const row of data as any[]) {
      const roleCode = row.roles?.code;
      const permCode = row.permissions?.code;
      if (!roleCode || !permCode) continue;

      if (!map.has(roleCode)) map.set(roleCode, new Map());
      map.get(roleCode)!.set(permCode, {
        can_read: !!row.can_read,
        can_create: !!row.can_create,
        can_update: !!row.can_update,
        can_delete: !!row.can_delete,
        can_approve: !!row.can_approve,
      });
    }
    return map.size > 0 ? map : null;
  } catch {
    return null;
  }
}

export class PermissionService {
  /** Loads (or reloads) the policy into memory. Safe to call concurrently. */
  static async load(): Promise<void> {
    if (loadingPromise) {
      await loadingPromise;
      return;
    }
    loadingPromise = fetchPolicy();
    const result = await loadingPromise;
    loadingPromise = null;

    if (result) {
      cache = result;
      lastLoadFailed = false;
    } else {
      // Keep any previously good cache rather than dropping to "unknown" on a transient failure.
      lastLoadFailed = true;
      if (!cache) {
        console.warn(
          '[RBAC] Policy table could not be loaded — route guards are falling back to their hardcoded role lists.'
        );
      }
    }
  }

  /** Drops the cache so the next check re-reads the table. Call after any policy write. */
  static invalidate(): void {
    cache = null;
    lastLoadFailed = false;
  }

  static isLoaded(): boolean {
    return cache !== null;
  }

  static lastLoadDidFail(): boolean {
    return lastLoadFailed;
  }

  /**
   * `true`/`false` when the policy is known, `null` when it isn't — callers must treat `null` as
   * "fall back", never as a denial.
   */
  static async can(role: UserRole, permissionCode: string, action: PermissionAction): Promise<boolean | null> {
    if (!cache) await this.load();
    if (!cache) return null;

    const roleCode = ROLE_TO_DB_CODE[role];
    if (!roleCode) return null;

    const perms = cache.get(roleCode);
    // A role with no policy rows at all is a data gap, not a deliberate deny-all.
    if (!perms) return null;

    const cell = perms.get(permissionCode);
    // A missing cell for a known role IS a deliberate absence of grant.
    if (!cell) return false;

    return !!cell[ACTION_COLUMN[action]];
  }
}
