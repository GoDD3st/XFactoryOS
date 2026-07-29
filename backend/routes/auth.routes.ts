import { Router } from 'express';
import { AuthService, ROLE_CONFIGS, DEFAULT_USERS_BY_ROLE } from '@/services/auth/authService';
import { UserRole } from '@/frontend/src/types';

export const authRouter = Router();

authRouter.get('/roles', (req, res) => {
  res.json({
    status: 'success',
    roles: ROLE_CONFIGS,
  });
});

authRouter.get('/user/:role', (req, res) => {
  const role = req.params.role as UserRole;
  const user = AuthService.getUserForRole(role);
  res.json({
    status: 'success',
    user,
    config: ROLE_CONFIGS[role] || null,
  });
});

authRouter.get('/users', (req, res) => {
  res.json({
    status: 'success',
    users: DEFAULT_USERS_BY_ROLE,
  });
});
