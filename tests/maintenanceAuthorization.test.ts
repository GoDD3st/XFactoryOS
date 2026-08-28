import test from 'node:test';
import assert from 'node:assert/strict';
import { requireRole } from '@/backend/middleware/rbacMiddleware';
import { UserRole } from '@/frontend/src/types';

/**
 * Site-wide maintenance operations are not self-service.
 *
 * /api/checkinout/auto-checkout closes every expired reservation on the site and /reminders
 * enumerates who is about to start; both used to accept any authenticated caller, so any
 * collaborator holding a valid token could sweep the whole building or read the day's schedule.
 * They are now behind the same operational-roles guard asserted here.
 *
 * The roles below mirror MAINTENANCE_ROLES in backend/routes/checkinout.routes.ts. If that list
 * changes, this test should be updated deliberately - never loosened to make it pass.
 */
const MAINTENANCE_ROLES: UserRole[] = ['admin', 'super_admin', 'building_manager', 'gci_manager'];

function run(role?: UserRole) {
  const guard = requireRole(...MAINTENANCE_ROLES);
  const result: { status?: number; body?: any; passed: boolean } = { passed: false };

  const res: any = {
    status(code: number) {
      result.status = code;
      return res;
    },
    json(body: any) {
      result.body = body;
      return res;
    },
  };

  guard({ user: role ? { id: 'u', role } : undefined } as any, res, () => {
    result.passed = true;
  });

  return result;
}

test('ordinary authenticated users cannot trigger site-wide maintenance', () => {
  for (const role of ['collaborator', 'receptionist', 'director', 'executive_assistant'] as UserRole[]) {
    const outcome = run(role);
    assert.equal(outcome.passed, false, `${role} must not pass the guard`);
    assert.equal(outcome.status, 403, `${role} must be refused with 403`);
    assert.equal(outcome.body.code, 'RBAC_DENIED');
  }
});

test('operational roles may run a sweep by hand', () => {
  for (const role of MAINTENANCE_ROLES) {
    assert.equal(run(role).passed, true, `${role} should be allowed`);
  }
});

test('an unauthenticated caller is refused before any role check', () => {
  const outcome = run(undefined);
  assert.equal(outcome.passed, false);
  assert.equal(outcome.status, 401);
});
