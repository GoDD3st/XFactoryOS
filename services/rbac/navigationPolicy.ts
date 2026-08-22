import { UserRole } from '@/frontend/src/types';
import { PermissionAction, PermissionCode, RoleGrants } from './permissionCodes';

/**
 * Which menu tabs a role sees, given the live `role_permissions` policy.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THIS IS NAVIGATION VISIBILITY ONLY. IT IS NOT AN AUTHORIZATION MECHANISM.
 *
 * Every route keeps its `requirePermission(...)` guard and its hardcoded fallback role list, and
 * nothing here relaxes either. Hiding a tab hides a link; it does not close a door. A user who
 * types the endpoint by hand still meets the same server-side check they met before, and a user
 * who reaches a screen this file chose to show still gets a 403 from the API if the policy says
 * no. The server remains the control - this only stops the menu from lying about what the server
 * will accept.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * The problem this solves: `ROLE_TABS` in RoleShell.tsx read no permission at all. A Super Admin
 * could grant `analytics` to a role in the Roles & Permissions screen, the API would start
 * answering immediately (requirePermission treats the policy table as authoritative), and the
 * Dashboard tab still never appeared - the grant was only reachable by calling the endpoint
 * directly.
 *
 * ## How the baseline and the policy combine
 *
 * The per-role arrays in RoleShell.tsx are a *curated* menu, not a mechanical rendering of the
 * §13 matrix. Several tabs are deliberately absent even though the role holds the underlying
 * permission, each with a reason written at the point of the decision. Rendering "every tab the
 * permissions technically allow" would throw all of that away, so the rule is:
 *
 *   visible = baseline
 *           − tabs whose backing permission is now explicitly revoked
 *           + tabs whose backing permission is now explicitly granted and that this role has not
 *             deliberately curated out
 *
 * The baseline is the default. The policy table moves it, in both directions, one tab at a time.
 * It never regenerates it.
 *
 * ## Why CURATED_OUT_TABS is so short
 *
 * Ideally we would compare the live policy against a checked-in snapshot of the seeded default
 * and only act on the *difference* - that is what makes a grant "explicit" rather than "shipped".
 * `role_permissions` carries no `updated_at`, so the database cannot tell us which cells a human
 * touched, and adding one would be a schema change for a navigation feature.
 *
 * But a full snapshot would be ~150 booleans duplicating the seed migration, and it would agree
 * with the baseline everywhere except a handful of cells. So we encode only the disagreements:
 * the (role, tab) pairs where the seeded policy DOES grant the permission and the curation still
 * chose to leave the tab out. Everywhere else, "baseline contains the tab" and "the default
 * policy grants it" say the same thing, and the delta falls out of the comparison for free.
 * CURATED_OUT_TABS is therefore exactly that snapshot, minus the ~145 rows that carry no
 * information.
 *
 * Consequence, stated plainly: a tab listed in CURATED_OUT_TABS cannot be turned on from the RBAC
 * screen. Its role keeps the permission and the API keeps honouring it; only the menu entry is
 * pinned off. Turning one on is a one-line edit here, next to the reason it was turned off.
 */

export type TabKey =
  | 'home'
  | 'digital-twin'
  | 'reserve'
  | 'reservations'
  | 'calendar'
  | 'waiting-list'
  | 'dashboard-exec'
  | 'workstations'
  | 'clusters'
  | 'users'
  | 'roles'
  | 'settings'
  | 'audit'
  | 'approvals'
  | 'cluster-auth'
  | 'late-checkin'
  | 'notifications';

export interface TabPermission {
  code: PermissionCode;
  action: PermissionAction;
}

/**
 * Tab → the permission its screen actually needs.
 *
 * Every code and action here was read off the route guards that back the screen, not off the
 * permissions table. Where the two disagree, the guard wins, because the guard is what will 403.
 * The notes below are the cases where that mattered.
 *
 * `null` means "no permission-gated route stands behind this tab". Those tabs are baseline-only:
 * the policy table can neither add nor remove them, because there is no cell that would mean
 * anything if it did. Inventing a mapping for them would let a Super Admin hide a screen that
 * would then still answer every request - a menu that lies in the other direction.
 */
export const TAB_PERMISSION: Record<TabKey, TabPermission | null> = {
  // Each role's landing console. Never policy-driven: a role whose menu resolved to zero tabs
  // would have no way back, and 'home' is the one entry that guarantees that cannot happen.
  home: null,

  // Legacy key, kept because TabKey is part of the shell's state type. No role lists it.
  'digital-twin': null,

  // reservations.routes.ts POST / → requirePermission('reserve_standard', 'create', ...).
  reserve: { code: 'reserve_standard', action: 'create' },

  // MyReservationsView shows the caller's own bookings. Every authenticated user has those and no
  // route gates the list on a permission, so there is nothing to follow. `edit_own_reservation`
  // exists in the table but no guard reads it, and viewing is not editing either way.
  reservations: null,

  // CalendarView is a read-only view over the same reservations. Ungated server-side.
  calendar: null,

  // waitinglist.routes.ts carries no requirePermission at all.
  'waiting-list': null,

  // ExecutiveDashboard's KPIs come from /api/telemetry/*, every one of which is
  // requirePermission('analytics', 'read', ANALYTICS_ROLES). NOT the seeded `dashboard_exec`
  // code, which reads like the obvious choice and is checked by precisely nothing - mapping the
  // tab to it would produce a toggle that changes the menu while the API keeps its own answer.
  'dashboard-exec': { code: 'analytics', action: 'read' },

  // WorkstationsAdminView is a management screen - create, enable/disable, seat visibility - and
  // every one of those calls is requirePermission('manage_workstations', 'update' | 'create' |
  // 'delete', ...). Mapped to `update` rather than `read` on purpose: the seed grants
  // manage_workstations.read to all ten roles, so keying on read would hand a Postes tab to
  // collaborators and security guards whose every button 403s. `update` is the weakest action
  // that makes the screen worth opening.
  workstations: { code: 'manage_workstations', action: 'update' },

  // Same reasoning as workstations. ClustersAdminView mutates clusters (VIP flag, members,
  // extension seats, lock, enable) and manage_clusters.read is likewise granted to everyone.
  clusters: { code: 'manage_clusters', action: 'update' },

  // users.routes.ts GET / → requirePermission('manage_users', 'read', ...). `read` is right here,
  // unlike the two above: UsersAdminView is genuinely useful read-only (application support), and
  // the seed reserves manage_users.read for the roles meant to have it.
  users: { code: 'manage_users', action: 'read' },

  // roles.routes.ts GET / and GET /permissions-matrix → requirePermission('manage_roles', 'read').
  // The write toggles need 'update', which only Super Admin holds; a role with read alone gets
  // the screen as a policy document, which is what the §13 matrix grants Admin and IT Admin.
  roles: { code: 'manage_roles', action: 'read' },

  // settings.routes.ts PUT / → requirePermission('reservation_settings', 'update', ...).
  // `update`, not `read`: SettingsView exists to change settings, and Building Manager, GCI
  // Manager and IT Admin all hold reservation_settings.read - a read-keyed tab would give three
  // more roles a Paramètres screen whose Save button 403s.
  settings: { code: 'reservation_settings', action: 'update' },

  // audit.routes.ts GET / → requirePermission('audit_logs', 'read', ...).
  audit: { code: 'audit_logs', action: 'read' },

  // approval.routes.ts → requirePermission('approve_long_duration', 'approve', APPROVER_ROLES).
  approvals: { code: 'approve_long_duration', action: 'approve' },

  // workspaces.routes.ts cluster-authorization endpoints →
  // requirePermission('authorize_cluster_management', 'approve', CLUSTER_AUTH_DECIDER_ROLES).
  'cluster-auth': { code: 'authorize_cluster_management', action: 'approve' },

  // checkinout.routes.ts gates the late check-in review endpoints with requireRole(...
  // LATE_CHECKIN_REVIEWER_ROLES), not requirePermission - there is no policy cell behind them, so
  // this tab cannot follow the table. If those guards are ever migrated to requirePermission, map
  // the tab here at the same time.
  'late-checkin': null,

  // Reached from the bell, never listed in a role's tabs. Everyone has their own notifications.
  notifications: null,
};

/**
 * Order used to place tabs the policy ADDS to a baseline.
 *
 * Only permission-backed tabs can ever be added, so only those appear here. Additions are
 * appended after the curated list rather than woven into it: the baseline's ordering is itself a
 * curation decision (each role's most-used screens first), and a newly granted tab has no claim
 * to a position inside it.
 */
const POLICY_TAB_ORDER: readonly TabKey[] = [
  'dashboard-exec',
  'reserve',
  'approvals',
  'cluster-auth',
  'workstations',
  'clusters',
  'users',
  'roles',
  'settings',
  'audit',
];

/**
 * Tabs the policy may never remove, per role.
 *
 * This mirrors requirePermission's `manage_roles` + `super_admin` special case, for the same
 * reason: the Roles & Permissions screen is the only way to undo a policy edit, so a Super Admin
 * must never be able to toggle their way out of reaching it. RoleRepository.updateRolePermission
 * already refuses to revoke that specific cell, but the menu should not depend on a write-path
 * guard for its own recoverability - a role row added later with no manage_roles cell, or a
 * partial policy read, would resolve to "denied" here without any revoke having happened.
 *
 * Nothing else is pinned. Every other tab is either permission-backed (and therefore revocable on
 * purpose) or unmapped (and therefore untouchable already).
 */
const POLICY_PINNED_TABS: Partial<Record<UserRole, readonly TabKey[]>> = {
  super_admin: ['roles'],
};

/**
 * Deliberate omissions: the role holds the permission, and the tab still stays out of its menu.
 *
 * Every entry is a curation decision that predates this file, restated here so the policy overlay
 * cannot quietly undo it. Removing an entry is how you let the RBAC screen surface that tab.
 */
const CURATED_OUT_TABS: Partial<Record<UserRole, readonly TabKey[]>> = {
  // EMPLOYEE holds reserve_standard.create - obviously, it is the role that books desks. But its
  // 'home' tab already IS the booking surface (EndUserDashboard, Digital Twin then form), and
  // 'reserve' renders that exact same component. Adding it would give collaborators two tabs
  // pointing at one screen. The other roles need 'reserve' precisely because their 'home' is
  // something else.
  collaborator: ['reserve'],

  // IT Admin's §13 column is "CRUD on Administration technique, R on everything else", so the
  // seed grants analytics.read and manage_roles.read. Both tabs are still deliberately absent:
  // the executive KPI view is the business roles' surface, not technical operations, and the
  // Rôles screen is read-only for this role (it cannot toggle anything, only read a matrix the
  // policy already documents elsewhere). telemetry.routes.ts says the same thing about analytics
  // from the server side - the permission is not dead, it is just not a menu entry.
  it_admin: ['dashboard-exec', 'roles'],

  // Security holds analytics.read for the same "R on governance" reason and gets the same
  // treatment: a guard supervises the floor through the Sécurité console and the audit journal,
  // not through occupancy forecasts and department shares.
  security_guard: ['dashboard-exec'],
};

/**
 * Is `tab` reachable for this role under `grants`?
 *
 * `null` = the question does not apply (no permission backs this tab), which callers must treat
 * as "leave it alone", never as a denial.
 */
function isTabGranted(tab: TabKey, grants: RoleGrants): boolean | null {
  const required = TAB_PERMISSION[tab];
  if (!required) return null;

  const cell = grants[required.code];
  // A role whose policy carries no row for this permission has no grant. This mirrors
  // PermissionService.can(), which returns false for a missing cell on a *known* role - the
  // "unknown, fall back" case is a null `grants` object, handled by the caller below.
  if (!cell) return false;

  return !!cell[required.action];
}

/**
 * Resolves the tabs a role should see.
 *
 * @param role     the signed-in user's role
 * @param baseline the curated tab list for that role, in its curated order
 * @param grants   the role's live policy, or `null` when it could not be read
 *
 * A `null` `grants` returns the baseline unchanged. That is the same philosophy the server
 * applies in requirePermission: an unreadable policy table degrades to the previous behaviour
 * rather than locking anyone out. An empty nav on a database blip would be strictly worse than a
 * slightly-too-generous one, since every screen behind it is still guarded.
 */
export function resolveVisibleTabs(
  role: UserRole,
  baseline: readonly TabKey[],
  grants: RoleGrants | null
): TabKey[] {
  if (!grants) return [...baseline];

  const pinned = POLICY_PINNED_TABS[role] ?? [];
  const curatedOut = CURATED_OUT_TABS[role] ?? [];

  const kept = baseline.filter((tab) => {
    if (pinned.includes(tab)) return true;
    const granted = isTabGranted(tab, grants);
    return granted === null ? true : granted;
  });

  const added = POLICY_TAB_ORDER.filter(
    (tab) => !baseline.includes(tab) && !curatedOut.includes(tab) && isTabGranted(tab, grants) === true
  );

  return [...kept, ...added];
}
