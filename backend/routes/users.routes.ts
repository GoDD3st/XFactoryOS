import { Router } from 'express';
import { UserRepository } from '@/database/repositories/userRepository';
import { createVerificationClient } from '@/database/serverClient';
// SRS §13 "Gérer utilisateurs"enforcement now reads the role_permissions policy table; the
// role list on each guard is the fallback used only if that table can't be read.
// Deactivating a user is the closest thing to a delete, so it maps to the D column.
import { requirePermission } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import {
  CreateUserByAdminSchema,
  UpdateUserStatusSchema,
  UpdateUserSchema,
  BulkUserImportSchema,
  SetUserPasswordSchema,
  ChangeOwnPasswordSchema,
  RequestPasswordChangeSchema,
} from '../validators';
import { UserImportService } from '@/services/users/userImportService';

export const usersRouter = Router();

// GET /api/users - matrix RBAC §13 "Gérer utilisateurs": CRUD = Super Admin/Admin, R = Building Manager/GCI Manager/IT Admin
usersRouter.get('/', requirePermission('manage_users', 'read', ['admin', 'super_admin', 'building_manager', 'gci_manager', 'it_admin']), async (req, res) => {
  try {
    const data = await UserRepository.getUsers();
    res.json({ status: 'success', data });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/users - FR-11: Super Admin/Admin create a user account
usersRouter.post('/', requirePermission('manage_users', 'create', ['admin', 'super_admin']), validateBody(CreateUserByAdminSchema), async (req, res) => {
  try {
    const result = await UserRepository.createUser(req.body);
    res.status(201).json({ status: 'success', data: result });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

// POST /api/users/bulk-import - SRS §28.10 / FR-11 "import massif d'utilisateurs".
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

// ── /me routes ──────────────────────────────────────────────────────────────────
// Declared BEFORE the parameterised /:id routes on purpose. Express matches in declaration
// order, so with /:id/password first the literal "me" was captured as an id and the request
// hit the admin-gated handler - a user could never change their own password (403).

// PUT /api/users/me/password - the account holder sets their own password.
//
// The target id comes from the session, never the URL or body, so this cannot be pointed at
// another account. Clears the forced-rotation flag.
usersRouter.put('/me/password', validateBody(ChangeOwnPasswordSchema), async (req, res) => {
  // Refused in demo mode. There, "who am I" is a role switcher, not an authenticated identity:
  // each demo role resolves onto a different REAL account, so this endpoint would rotate the
  // credentials of whichever account backs the currently selected role. Switching roles a few
  // times silently changes several real passwords, and the next genuine sign-in then fails.
  if (process.env.DEMO_MODE === 'true') {
    return res.status(409).json({
      status: 'error',
      message:
        "Changement de mot de passe indisponible en mode démonstration : la session ne correspond pas à un compte authentifié.",
    });
  }

  try {
    // Prove the caller still holds the current credential before replacing it. Verified with a
    // throwaway client so the caller's own session is never touched or replaced - the same
    // step-up pattern the settings screen uses.
    const verifyClient = createVerificationClient();
    const { error: authError } = await verifyClient.auth.signInWithPassword({
      email: req.user!.email,
      password: req.body.current_password,
    });

    if (authError) {
      return res.status(401).json({
        status: 'error',
        code: 'CURRENT_PASSWORD_INVALID',
        message: 'Mot de passe actuel incorrect.',
      });
    }

    if (req.body.current_password === req.body.password) {
      return res.status(400).json({
        status: 'error',
        message: 'Le nouveau mot de passe doit être différent de l’actuel.',
      });
    }

    await UserRepository.changeOwnPassword(req.user!.id, req.body.password);
    res.json({ status: 'success' });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

// GET /api/users/me/password-status - drives the forced password-creation form.
usersRouter.get('/me/password-status', async (req, res) => {
  // Never prompts in demo mode - see PUT /me/password above. The gate would appear on every role
  // switch and act on a different real account each time.
  if (process.env.DEMO_MODE === 'true') {
    return res.json({ status: 'success', data: { mustChangePassword: false } });
  }

  res.json({
    status: 'success',
    data: { mustChangePassword: await UserRepository.mustChangePassword(req.user!.id) },
  });
});

// POST /api/users/me/request-password-change - the user asks an administrator to change it.
//
// Users cannot change their own password from the profile screen by design (§ profile: "password
// must not be shown; to change it the user contacts an admin"). This turns that instruction into
// an actual notification to the admins rather than leaving the user to find one.
usersRouter.post(
  '/me/request-password-change',
  validateBody(RequestPasswordChangeSchema),
  async (req, res) => {
    try {
      const { NotificationService } = await import('@/services/notifications/notificationService');
      const admins = (await UserRepository.getUsers()).filter(
        (u) => u.role === 'admin' || u.role === 'super_admin'
      );

      await Promise.all(
        admins.map((a) =>
          NotificationService.sendNotification(
            a.id,
            'Demande de changement de mot de passe',
            `${req.user!.full_name} (${req.user!.email}) demande la modification de son mot de passe.` +
              (req.body.message ? ` Message : ${req.body.message}` : ''),
            'info'
          )
        )
      );

      res.json({ status: 'success', data: { notified: admins.length } });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// PATCH /api/users/:id/status - FR-14: Super Admin/Admin activate/deactivate a user
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

// PATCH /api/users/:id - FR-11: Super Admin/Admin edit name/department/role
usersRouter.patch('/:id', requirePermission('manage_users', 'update', ['admin', 'super_admin']), validateBody(UpdateUserSchema), async (req, res) => {
  try {
    await UserRepository.updateUser(req.params.id, req.body, req.user!.id);
    res.json({ status: 'success' });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

// Password recovery is Super Admin only.
//
// Both routes below hand the operator a working credential for somebody else's account, which is
// a different power from ordinary user administration: whoever holds it can sign in as that
// person until the forced rotation happens. Administrator was dropped from both so the capability
// sits with exactly one role, as requested. requirePermission still consults role_permissions
// first; this list is only the DB-outage fallback, so the matrix must agree with it.
const PASSWORD_RECOVERY_ROLES = ['super_admin'] as const;

// POST /api/users/me/bootstrap - ensure the signed-in user's profile row and role exist.
//
// Sign-in happens client-side against Supabase Auth directly, so nothing server-side ran for an
// existing account and the browser was calling UserRepository.ensureUserProfile itself: a database
// repository executing in the client, inserting into public.users and public.user_roles. Under RLS
// those inserts are only permitted for SUPER_ADMIN/ADMIN, so for an ordinary user they failed
// silently anyway. Identity here comes from the verified JWT, never from the body.
usersRouter.post('/me/bootstrap', async (req, res) => {
  try {
    await UserRepository.ensureUserProfile({
      id: req.user!.id,
      email: req.user!.email,
      user_metadata: { full_name: req.user!.full_name, department: req.user!.department },
    });
    res.json({ status: 'success' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/users/:id/reset-password - FR-14/§25.1: generate a temporary password.
//
// The generated value is returned exactly once, in this response, for the Super Admin to hand
// over in person. It is never stored in our tables, never logged, and cannot be read back
// afterwards - Supabase keeps only a bcrypt hash, so nothing in the system can reveal an existing
// password. Recovery is therefore replacement, not disclosure.
usersRouter.post('/:id/reset-password', requirePermission('manage_users', 'update', PASSWORD_RECOVERY_ROLES), async (req, res) => {
  try {
    const result = await UserRepository.resetPassword(req.params.id, {
      id: req.user!.id,
      name: req.user!.full_name,
      role: req.user!.role,
    });
    res.json({ status: 'success', data: result });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

// PUT /api/users/:id/password - admin sets a SPECIFIC password (part of user CRUD).
//
// Distinct from reset-password, which generates a random one. Both mark the account for forced
// rotation, because either way the administrator knows the credential.
usersRouter.put(
  '/:id/password',
  requirePermission('manage_users', 'update', PASSWORD_RECOVERY_ROLES),
  validateBody(SetUserPasswordSchema),
  async (req, res) => {
    try {
      await UserRepository.setPassword(req.params.id, req.body.password, {
        id: req.user!.id,
        name: req.user!.full_name,
        role: req.user!.role,
      });
      // Deliberately returns nothing about the password - not even an echo of its length.
      res.json({ status: 'success' });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);

