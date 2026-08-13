import crypto from 'crypto';
import { Router } from 'express';
import { RoleRepository } from '@/database/repositories/roleRepository';
import { AuditRepository } from '@/database/repositories/auditRepository';
import { requirePermission } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import { CreateRoleSchema, UpdateRolePermissionSchema, DeleteRoleSchema } from '../validators';

export const rolesRouter = Router();

/**
 * SRS §13 "Gérer rôles": Super Admin = CRUD, Admin = R, IT Admin = R, everyone else = X.
 *
 * This table is now LIVE: route guards call requirePermission(), which reads `role_permissions`
 * through PermissionService, so editing a cell here changes what a role can actually do (cache
 * is invalidated on write, no restart needed).
 *
 * Two safety properties, both deliberate:
 *  - each guard still carries its original hardcoded role list as a *fallback*, used only when
 *    the policy table can't be read, so a DB outage degrades to the old behaviour instead of
 *    locking every user out;
 *  - Super Admin's read/update on `manage_roles` cannot be revoked (enforced in
 *    requirePermission and again in RoleRepository.updateRolePermission) — without that, one
 *    toggle would remove the only route able to undo it.
 */
const ROLE_READERS = ['super_admin', 'admin', 'it_admin'] as const;

// GET /api/roles — role list with live user counts
rolesRouter.get('/', requirePermission('manage_roles', 'read', ROLE_READERS), async (req, res) => {
  try {
    const roles = await RoleRepository.getRolesWithUserCounts();
    res.json({ status: 'success', data: roles });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET /api/roles/permissions-matrix — full role x permission grid
rolesRouter.get('/permissions-matrix', requirePermission('manage_roles', 'read', ROLE_READERS), async (req, res) => {
  try {
    const matrix = await RoleRepository.getPermissionsMatrix();
    res.json({ status: 'success', data: matrix });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/roles — create a new role (Super Admin only per matrix; Admin is R-only)
rolesRouter.post('/', requirePermission('manage_roles', 'create', ['super_admin']), validateBody(CreateRoleSchema), async (req, res) => {
  try {
    const { code, name, description } = req.body;
    const role = await RoleRepository.createRole(code, name, description || '');

    await AuditRepository.logEvent(
      'ROLE_CHANGE',
      req.user!.id,
      req.user!.full_name,
      req.user!.role,
      role.name,
      `Nouveau rôle créé : ${role.name} (${role.code})`
    );

    res.status(201).json({ status: 'success', data: role });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

// PATCH /api/roles/:roleId/permissions/:permissionId — update one policy cell
rolesRouter.patch(
  '/:roleId/permissions/:permissionId',
  requirePermission('manage_roles', 'update', ['super_admin']),
  validateBody(UpdateRolePermissionSchema),
  async (req, res) => {
    try {
      const { roleId, permissionId } = req.params;
      const ok = await RoleRepository.updateRolePermission(roleId, permissionId, req.body);
      if (!ok) {
        res.status(404).json({ status: 'error', message: 'Association rôle/permission introuvable.' });
        return;
      }

      await AuditRepository.logEvent(
        'ROLE_CHANGE',
        req.user!.id,
        req.user!.full_name,
        req.user!.role,
        `${roleId}:${permissionId}`,
        `Permission modifiée : ${JSON.stringify(req.body)}`
      );

      res.json({ status: 'success' });
    } catch (error: any) {
      // The anti-lockout guard in the repository rejects with a message meant for the admin —
      // that's a bad request, not a server fault.
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);

// DELETE /api/roles/:roleId — requires a server-side master key (never shipped to the
// frontend), on top of the repository's critical-role/still-assigned guards. Fails closed if
// ROLE_DELETION_MASTER_KEY isn't configured — no default key committed to source.
rolesRouter.delete('/:roleId', requirePermission('manage_roles', 'delete', ['super_admin']), validateBody(DeleteRoleSchema), async (req, res) => {
  try {
    const configuredKey = process.env.ROLE_DELETION_MASTER_KEY;
    if (!configuredKey) {
      res.status(403).json({
        status: 'error',
        message: "Suppression désactivée : ROLE_DELETION_MASTER_KEY n'est pas configurée côté serveur.",
      });
      return;
    }

    const { masterKey } = req.body;
    const providedBuffer = Buffer.from(masterKey);
    const configuredBuffer = Buffer.from(configuredKey);
    const matches =
      providedBuffer.length === configuredBuffer.length && crypto.timingSafeEqual(providedBuffer, configuredBuffer);

    if (!matches) {
      res.status(403).json({ status: 'error', message: 'Clé de suppression invalide.' });
      return;
    }

    await RoleRepository.deleteRole(req.params.roleId);

    await AuditRepository.logEvent(
      'ROLE_CHANGE',
      req.user!.id,
      req.user!.full_name,
      req.user!.role,
      req.params.roleId,
      'Rôle supprimé (clé maître vérifiée)'
    );

    res.json({ status: 'success' });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});
