import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@/frontend/src/types';
import { PermissionService, PermissionAction } from '@/services/rbac/permissionService';

/**
 * RBAC Middleware - Role-Based Access Control
 * 
 * Must be used AFTER authenticateJWT middleware.
 * Checks req.user.role against allowed roles.
 */

// Role hierarchy: higher index = more privileged
const ROLE_HIERARCHY: Record<UserRole, number> = {
  collaborator: 1,
  receptionist: 2,
  security_guard: 2,
  it_admin: 3,
  building_manager: 4,
  gci_manager: 4,
  executive_assistant: 5,
  director: 6,
  admin: 7,
  super_admin: 8,
};

/**
 * Middleware that requires the user to have one of the specified roles.
 * Returns 403 Forbidden if the user's role is not in the allowed list.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        code: 'AUTH_REQUIRED',
        message: 'Authentification requise.',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        status: 'error',
        code: 'RBAC_DENIED',
        message: `Accès refusé. Rôle requis: ${allowedRoles.join(', ')}. Votre rôle: ${req.user.role}.`,
        required_roles: allowedRoles,
        current_role: req.user.role,
      });
      return;
    }

    return next();
  };
}

/**
 * Permission-driven guard: the `role_permissions` policy table decides, so a toggle in the
 * Roles & Permissions screen actually changes what a role can do.
 *
 * `fallbackRoles` is the hardcoded list this route used before, and it is deliberately kept:
 *  - if the policy table can't be read (outage, unseeded install), the route behaves exactly as
 *    it did before rather than denying everyone - a DB blip must never brick the whole app;
 *  - once the policy IS readable, it is authoritative and the fallback is ignored, including
 *    when it denies a role the fallback would have allowed.
 *
 * Super Admin always keeps `manage_roles`, regardless of the table. Without that, toggling one
 * cell would remove the only route capable of toggling it back - an unrecoverable lockout.
 */
export function requirePermission(
  permissionCode: string,
  action: PermissionAction,
  fallbackRoles: readonly UserRole[]
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'Authentification requise.' });
      return;
    }

    const role = req.user.role;

    if (permissionCode === 'manage_roles' && role === 'super_admin') {
      return next();
    }

    const allowed = await PermissionService.can(role, permissionCode, action);

    if (allowed === null) {
      if (fallbackRoles.includes(role)) return next();
      res.status(403).json({
        status: 'error',
        code: 'RBAC_DENIED',
        message: `Accès refusé. Permission requise : ${permissionCode}.${action}.`,
        permission: `${permissionCode}.${action}`,
        current_role: role,
      });
      return;
    }

    if (!allowed) {
      res.status(403).json({
        status: 'error',
        code: 'RBAC_DENIED',
        message: `Accès refusé. Permission requise : ${permissionCode}.${action}.`,
        permission: `${permissionCode}.${action}`,
        current_role: role,
      });
      return;
    }

    return next();
  };
}

/**
 * Middleware that requires the user to have a role at or above a minimum level.
 * Uses the role hierarchy for comparison.
 */
export function requireMinRole(minRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        code: 'AUTH_REQUIRED',
        message: 'Authentification requise.',
      });
      return;
    }

    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const minLevel = ROLE_HIERARCHY[minRole] || 0;

    if (userLevel < minLevel) {
      res.status(403).json({
        status: 'error',
        code: 'RBAC_INSUFFICIENT',
        message: `Niveau d'accès insuffisant. Minimum requis: ${minRole}.`,
      });
      return;
    }

    return next();
  };
}

/**
 * Checks if the authenticated user is the owner of a resource, or has admin override.
 * The `extractOwnerId` function receives the request and returns the owner's user ID.
 * If it returns null, the check is skipped (resource not found yet - let the handler deal with it).
 */
export function requireOwnerOrAdmin(extractOwnerId: (req: Request) => string | null | Promise<string | null>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        code: 'AUTH_REQUIRED',
        message: 'Authentification requise.',
      });
      return;
    }

    // Admins and super admins always pass ownership checks
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (isAdmin) {
      return next();
    }

    try {
      const ownerId = await extractOwnerId(req);

      // If owner ID couldn't be determined, let the handler deal with it
      if (ownerId === null) {
        return next();
      }

      if (ownerId !== req.user.id) {
        res.status(403).json({
          status: 'error',
          code: 'OWNERSHIP_DENIED',
          message: 'Accès refusé. Vous ne pouvez modifier que vos propres ressources.',
        });
        return;
      }

      return next();
    } catch (err) {
      console.error('[RBAC] Ownership check error:', err);
      res.status(500).json({
        status: 'error',
        code: 'RBAC_ERROR',
        message: 'Erreur lors de la vérification des droits.',
      });
      return;
    }
  };
}
