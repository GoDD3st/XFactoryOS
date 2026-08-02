import { Router } from 'express';
import { AuthService, ROLE_CONFIGS, DEFAULT_USERS_BY_ROLE } from '@/services/auth/authService';
import { supabase } from '@/database/client';
import { UserRole } from '@/frontend/src/types';
import { validateBody } from '../middleware/validateBody';
import { LoginSchema, RegisterSchema } from '../validators';
import { requireRole } from '../middleware/rbacMiddleware';

export const authRouter = Router();

// GET /api/auth/roles — Public role configs
authRouter.get('/roles', (req, res) => {
  res.json({
    status: 'success',
    roles: ROLE_CONFIGS,
  });
});

// GET /api/auth/me — Return authenticated user profile from JWT session
authRouter.get('/me', (req, res) => {
  if (!req.user) {
    res.status(401).json({ status: 'error', message: 'Non authentifié' });
    return;
  }
  res.json({
    status: 'success',
    user: req.user,
    roleConfig: ROLE_CONFIGS[req.user.role] || null,
  });
});

// POST /api/auth/login — Supabase Password Authentication
authRouter.post('/login', validateBody(LoginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      res.status(401).json({
        status: 'error',
        code: 'INVALID_CREDENTIALS',
        message: 'Email ou mot de passe incorrect.',
      });
      return;
    }

    res.json({
      status: 'success',
      session: {
        access_token: data.session.access_token,
        expires_at: data.session.expires_at,
        user: data.user,
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// POST /api/auth/register — Secure registration
authRouter.post('/register', validateBody(RegisterSchema), async (req, res) => {
  try {
    const { email, password, full_name, department } = req.body;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name, department },
      },
    });

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    res.status(201).json({
      status: 'success',
      message: 'Compte créé avec succès. Vérifiez vos emails si nécessaire.',
      user: data.user,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /api/auth/user/:role — Admin diagnostic role lookup
authRouter.get('/user/:role', requireRole('admin', 'super_admin'), (req, res) => {
  const role = req.params.role as UserRole;
  const user = AuthService.getUserForRole(role);
  res.json({
    status: 'success',
    user,
    config: ROLE_CONFIGS[role] || null,
  });
});

// GET /api/auth/users — Admin diagnostic user list
authRouter.get('/users', requireRole('admin', 'super_admin'), (req, res) => {
  res.json({
    status: 'success',
    users: DEFAULT_USERS_BY_ROLE,
  });
});
