import { Router } from 'express';
import { UserRepository } from '@/database/repositories/userRepository';
import { requireRole } from '../middleware/rbacMiddleware';

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
