import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../client';

// role_permissions/permissions are the documented, editable RBAC policy record — see
// roles.routes.ts header comment for the important distinction between this and actual
// route-level enforcement (which stays on the existing hardcoded requireRole() guards).
export interface RoleWithCount {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_critical: boolean;
  user_count: number;
  created_at: string;
}

export interface PermissionCell {
  permission_id: string;
  permission_code: string;
  domain: string;
  description: string | null;
  can_read: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_approve: boolean;
}

export interface RolePermissionRow {
  role_id: string;
  role_code: string;
  role_name: string;
  permissions: PermissionCell[];
}

async function resolveClient(): Promise<SupabaseClient> {
  if (typeof window === 'undefined') {
    const { getAdminClient } = await import('../serverClient');
    const admin = getAdminClient();
    if (admin) return admin;
  }
  return supabase;
}

export class RoleRepository {
  static async getRolesWithUserCounts(dbClient?: SupabaseClient): Promise<RoleWithCount[]> {
    const db = dbClient || (await resolveClient());
    const { data: roles, error } = await db.from('roles').select('*').order('name');
    if (error || !roles) return [];

    const { data: userRoles } = await db.from('user_roles').select('role_id');
    const counts = new Map<string, number>();
    (userRoles || []).forEach((ur: any) => counts.set(ur.role_id, (counts.get(ur.role_id) || 0) + 1));

    return roles.map((r: any) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      is_critical: r.is_critical,
      user_count: counts.get(r.id) || 0,
      created_at: r.created_at,
    }));
  }

  /** Full role x permission grid, grouped by role, for the Roles & Permissions matrix UI. */
  static async getPermissionsMatrix(dbClient?: SupabaseClient): Promise<RolePermissionRow[]> {
    const db = dbClient || (await resolveClient());
    const { data: roles, error: rolesError } = await db.from('roles').select('id, code, name').order('name');
    if (rolesError || !roles) return [];

    const { data: rows, error: rpError } = await db
      .from('role_permissions')
      .select('role_id, can_read, can_create, can_update, can_delete, can_approve, permissions(id, code, domain, description)');
    if (rpError || !rows) return [];

    const byRole = new Map<string, PermissionCell[]>();
    rows.forEach((row: any) => {
      const perm = row.permissions;
      if (!perm) return;
      const cell: PermissionCell = {
        permission_id: perm.id,
        permission_code: perm.code,
        domain: perm.domain,
        description: perm.description,
        can_read: row.can_read,
        can_create: row.can_create,
        can_update: row.can_update,
        can_delete: row.can_delete,
        can_approve: row.can_approve,
      };
      if (!byRole.has(row.role_id)) byRole.set(row.role_id, []);
      byRole.get(row.role_id)!.push(cell);
    });

    return roles.map((r: any) => ({
      role_id: r.id,
      role_code: r.code,
      role_name: r.name,
      permissions: byRole.get(r.id) || [],
    }));
  }

  /**
   * These cells are now enforced at the route level, so revoking the wrong one is not a
   * documentation change — it removes real access. Super Admin's read/update on `manage_roles`
   * is the one combination that must never be revocable: it is the only way back, so losing it
   * would permanently freeze the whole policy table in whatever state it was left in.
   */
  static async updateRolePermission(
    roleId: string,
    permissionId: string,
    flags: { can_read?: boolean; can_create?: boolean; can_update?: boolean; can_delete?: boolean; can_approve?: boolean },
    dbClient?: SupabaseClient
  ): Promise<boolean> {
    const db = dbClient || (await resolveClient());

    const [{ data: role }, { data: permission }] = await Promise.all([
      db.from('roles').select('code').eq('id', roleId).maybeSingle(),
      db.from('permissions').select('code').eq('id', permissionId).maybeSingle(),
    ]);

    if (role?.code === 'SUPER_ADMIN' && permission?.code === 'manage_roles') {
      if (flags.can_read === false || flags.can_update === false) {
        throw new Error(
          "Impossible de retirer au Super Administrateur la lecture ou la modification de « Gérer rôles & permissions » : ce serait un verrouillage définitif de la politique RBAC."
        );
      }
    }

    const { error } = await db
      .from('role_permissions')
      .update(flags)
      .eq('role_id', roleId)
      .eq('permission_id', permissionId);

    if (error) return false;

    // The guards read from an in-memory cache — without this the change wouldn't take effect
    // until the next server restart.
    const { PermissionService } = await import('@/services/rbac/permissionService');
    PermissionService.invalidate();

    return true;
  }

  static async createRole(
    code: string,
    name: string,
    description: string,
    dbClient?: SupabaseClient
  ): Promise<RoleWithCount> {
    const db = dbClient || (await resolveClient());

    const { data: role, error } = await db
      .from('roles')
      .insert({ code, name, description, is_critical: false })
      .select()
      .single();

    if (error || !role) {
      throw new Error(error?.message || 'Échec de la création du rôle.');
    }

    // Every existing permission gets an explicit no-access row for the new role — matches the
    // shape getPermissionsMatrix() expects (one row per role x permission, not sparse).
    const { data: permissions } = await db.from('permissions').select('id');
    if (permissions && permissions.length > 0) {
      await db.from('role_permissions').insert(
        permissions.map((p: any) => ({
          role_id: role.id,
          permission_id: p.id,
          can_read: false,
          can_create: false,
          can_update: false,
          can_delete: false,
          can_approve: false,
        }))
      );
    }

    const { PermissionService } = await import('@/services/rbac/permissionService');
    PermissionService.invalidate();

    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      is_critical: role.is_critical,
      user_count: 0,
      created_at: role.created_at,
    };
  }

  /**
   * Refuses to delete a role that's critical (Admin/Super Admin — deleting Super Admin itself
   * would be catastrophic) or that still has users assigned (would silently strand their
   * access). The master-key check happens in the route, before this is ever called.
   */
  static async deleteRole(roleId: string, dbClient?: SupabaseClient): Promise<void> {
    const db = dbClient || (await resolveClient());

    const { data: role } = await db.from('roles').select('is_critical, name').eq('id', roleId).maybeSingle();
    if (!role) throw new Error('Rôle introuvable.');
    if (role.is_critical) throw new Error(`Le rôle "${role.name}" est critique et ne peut pas être supprimé.`);

    const { count } = await db.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role_id', roleId);
    if (count && count > 0) {
      throw new Error(`Le rôle "${role.name}" est encore assigné à ${count} utilisateur(s) — retirez-les avant suppression.`);
    }

    await db.from('role_permissions').delete().eq('role_id', roleId);
    const { error } = await db.from('roles').delete().eq('id', roleId);
    if (error) throw new Error(error.message || 'Échec de la suppression du rôle.');

    const { PermissionService } = await import('@/services/rbac/permissionService');
    PermissionService.invalidate();
  }
}
