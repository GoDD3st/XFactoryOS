/**
 * The permission codes that exist in `public.permissions`, as a compile-time type.
 *
 * These are not invented here: they are the rows seeded by
 * `20260811132256_seed_permissions_and_role_permissions_matrix.sql` (fourteen codes) plus
 * `20260815123624_add_ai_configuration_permission.sql` (one more). The Roles & Permissions screen
 * can create *roles*, never *permissions*, so this list only changes when a migration adds a row.
 *
 * It exists so two things cannot silently drift apart:
 *  - the route guards, which name a code in `requirePermission('analytics', 'read', ...)`;
 *  - the navigation policy in `navigationPolicy.ts`, which decides which menu tab a code backs.
 *
 * Both are typed against this union, so a typo or a renamed permission is a `tsc` failure in
 * every place that referenced it rather than a guard that quietly never matches a policy row and
 * falls through to its hardcoded fallback forever.
 *
 * This module is deliberately dependency-free: it is imported by the Express middleware AND by
 * the browser bundle, so it must not pull in the Supabase server client.
 */
export const PERMISSION_CODES = [
  'dashboard_exec',
  'reserve_standard',
  'edit_own_reservation',
  'edit_others_reservation',
  'approve_long_duration',
  'authorize_cluster_management',
  'manage_workstations',
  'manage_clusters',
  'manage_users',
  'manage_roles',
  'reservation_settings',
  'audit_logs',
  'analytics',
  'technical_administration',
  'ai_configuration',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

/** The five boolean columns of `role_permissions`, named the way callers think about them. */
export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'approve';

/** One policy cell: what a role may do with one permission. */
export type PermissionFlags = Record<PermissionAction, boolean>;

/**
 * A role's effective policy, keyed by permission code. Keyed by `string` rather than
 * `PermissionCode` on purpose: this shape is also built from rows read out of the database, and a
 * migration that adds a permission before this file is updated must not make the whole payload
 * untypeable. Lookups go through the typed map in `navigationPolicy.ts`.
 */
export type RoleGrants = Record<string, PermissionFlags>;
