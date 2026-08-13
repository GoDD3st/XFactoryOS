import { Router } from 'express';
import { UserRepository } from '@/database/repositories/userRepository';
// SRS §13 "Gérer utilisateurs" — enforcement now reads the role_permissions policy table; the
// role list on each guard is the fallback used only if that table can't be read.
// Deactivating a user is the closest thing to a delete, so it maps to the D column.
import { requirePermission } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import { CreateUserByAdminSchema, UpdateUserStatusSchema, UpdateUserSchema, BulkUserImportSchema } from '../validators';
import { UserImportService } from '@/services/users/userImportService';

export const usersRouter = Router();

// GET /api/users — matrix RBAC §13 "Gérer utilisateurs": CRUD = Super Admin/Admin, R = Building Manager/GCI Manager/IT Admin
usersRouter.get('/', requirePermission('manage_users', 'read', ['admin', 'super_admin', 'building_manager', 'gci_manager', 'it_admin']), async (req, res) => {
  try {
    const data = await UserRepository.getUsers();
    res.json({ status: 'success', data });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/users — FR-11: Super Admin/Admin create a user account
usersRouter.post('/', requirePermission('manage_users', 'create', ['admin', 'super_admin']), validateBody(CreateUserByAdminSchema), async (req, res) => {
  try {
    const result = await UserRepository.createUser(req.body);
    res.status(201).json({ status: 'success', data: result });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

// POST /api/users/bulk-import — SRS §28.10 / FR-11 "import massif d'utilisateurs".
// Send `dryRun: true` first to preview; the same payload with `dryRun: false` performs the import.
usersRouter.post(
  '/bulk-import',
  requirePermission('manage_users', 'create', ['admin', 'super_admin']),
  validateBody(BulkUserImportSchema),
  async (req, res) => {
    try {
      const report = await UserImportService.run(req.body.rows, {
        dryRun: req.body.dryRun === true,
        actorId: req.user!.id,
        actorName: req.user!.full_name,
        actorRole: req.user!.role,
      });
      res.json({ status: 'success', data: report });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);

// PATCH /api/users/:id/status — FR-14: Super Admin/Admin activate/deactivate a user
usersRouter.patch('/:id/status', requirePermission('manage_users', 'delete', ['admin', 'super_admin']), validateBody(UpdateUserStatusSchema), async (req, res) => {
  try {
    const success = await UserRepository.updateUserStatus(req.params.id, req.body.status);
    if (!success) {
      res.status(500).json({ status: 'error', message: 'Échec de la mise à jour du statut.' });
      return;
    }
    res.json({ status: 'success' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// PATCH /api/users/:id — FR-11: Super Admin/Admin edit name/department/role
usersRouter.patch('/:id', requirePermission('manage_users', 'update', ['admin', 'super_admin']), validateBody(UpdateUserSchema), async (req, res) => {
  try {
    await UserRepository.updateUser(req.params.id, req.body, req.user!.id);
    res.json({ status: 'success' });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

// POST /api/users/:id/reset-password — FR-14/§25.1: Super Admin/Admin reset a user's password
usersRouter.post('/:id/reset-password', requirePermission('manage_users', 'update', ['admin', 'super_admin']), async (req, res) => {
  try {
    const result = await UserRepository.resetPassword(req.params.id, req.user!.id);
    res.json({ status: 'success', data: result });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});
