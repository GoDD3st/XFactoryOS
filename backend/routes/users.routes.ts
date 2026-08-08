import { Router } from 'express';
import { UserRepository } from '@/database/repositories/userRepository';
import { requireRole } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import { CreateUserByAdminSchema, UpdateUserStatusSchema, UpdateUserSchema } from '../validators';

export const usersRouter = Router();

// GET /api/users — matrix RBAC §13 "Gérer utilisateurs": CRUD = Super Admin/Admin, R = Building Manager/GCI Manager/IT Admin
usersRouter.get('/', requireRole('admin', 'super_admin', 'building_manager', 'gci_manager', 'it_admin'), async (req, res) => {
  try {
    const data = await UserRepository.getUsers();
    res.json({ status: 'success', data });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/users — FR-11: Super Admin/Admin create a user account
usersRouter.post('/', requireRole('admin', 'super_admin'), validateBody(CreateUserByAdminSchema), async (req, res) => {
  try {
    const result = await UserRepository.createUser(req.body);
    res.status(201).json({ status: 'success', data: result });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

// PATCH /api/users/:id/status — FR-14: Super Admin/Admin activate/deactivate a user
usersRouter.patch('/:id/status', requireRole('admin', 'super_admin'), validateBody(UpdateUserStatusSchema), async (req, res) => {
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
usersRouter.patch('/:id', requireRole('admin', 'super_admin'), validateBody(UpdateUserSchema), async (req, res) => {
  try {
    await UserRepository.updateUser(req.params.id, req.body, req.user!.id);
    res.json({ status: 'success' });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

// POST /api/users/:id/reset-password — FR-14/§25.1: Super Admin/Admin reset a user's password
usersRouter.post('/:id/reset-password', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const result = await UserRepository.resetPassword(req.params.id, req.user!.id);
    res.json({ status: 'success', data: result });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});
