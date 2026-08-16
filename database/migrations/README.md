# Migrations

Timestamped files in this directory (`<version>_<name>.sql`) mirror Supabase's applied migration
history one-for-one. `version` is the value in `supabase_migrations.schema_migrations`, so the
filename and the recorded migration always agree, and applying them in filename order replays that
history exactly.

These were backfilled out of Supabase on 2026-08-14. Until then the history existed only in the
hosted project: every migration had been applied through the API and none had a counterpart in
git.

## The sequence does not yet build a database from empty

Supabase's recorded history begins at `20260806160035_fix_missing_rls_policies_and_hardening`a
*correction*, not a schema creation. Everything it corrects was created before migrations were used
at all, directly against the hosted project. Nothing in this directory issues a `CREATE TABLE`,
defines the `has_role()` helper every policy calls, or declares the enum types; the first file
assumes all of it already exists.

So these 19 files replay the history faithfully but cannot bootstrap a new environment. Standing up
a second database (staging, CI, a local stack) still requires cloning the schema out of the hosted
project first. Closing this needs a baseline file capturing the pre-migration schema, ordered ahead
of `20260806160035`.

## Why that mattered

`20260811132256_seed_permissions_and_role_permissions_matrix.sql` populates `role_permissions`,
the table every route guard reads through `PermissionService`. When that table is empty,
`PermissionService.can()` returns `null` rather than `false`a deliberate choice so a database
outage degrades to previous behaviour instead of locking everyone out (see
`services/rbac/permissionService.ts`). A database built without this migration therefore serves
every request on `requirePermission`'s hardcoded fallback lists: the app comes up and works, with
the pre-RBAC role lists in force and different 403/200 behaviour than the matrix defines. The only
signal is one `[RBAC]` warning on boot.

## Conventions

- **Never edit an applied migration.** `20260811132256` re-applies every cell via
  `on conflict do update`, so it is authoritative for the whole matrix on replay. Corrections go
  in a later file`20260814134906_align_approver_pools_with_business_rules.sql` is the worked
  example, narrowing three governance rows that replay would otherwise restore.
- **Fallback lists must mirror the granted cells.** A role dropped from a permission in SQL but
  left in a route's `fallbackRoles` regains the permission the moment the policy table cannot be
  read.
- New migrations applied via the API get their version assigned at apply time; name the file to
  match what lands in `schema_migrations`.

## Removed legacy files

`fix_supabase_permissions.sql`, `update_settings_schema.sql` and `user_and_reservation_policies.sql`
were deleted on 2026-08-16. They predated the convention, had no `schema_migrations` entry, and
checking each against the live database showed none of them had ever been applied. They were not
merely unsequenced - they contradicted the schema that exists:

- **`fix_supabase_permissions.sql`** creates `reservations_select_all` and
  `users_select_all_authenticated`, both `FOR SELECT ... USING (true)`. Permissive policies OR
  together, so running this against the current database would have granted every authenticated
  user read access to every reservation and every user row, on top of the narrower
  `p_reservations_owner_read` / `p_users_self` / `p_users_ops_read` policies that replaced them. The
  file's header read `Run this ONCE in Supabase → SQL Editor`.
- **`update_settings_schema.sql`** added `booking_window_days`, `bypass_roles`, `config_version` and
  six other columns to `public.settings`. None exist. This file is the origin of the phantom columns
  that `20260806165150_fix_settings_raw_config_column.sql` was written to clean up after - those
  fields now ride in `raw_config` (see `database/repositories/settingsRepository.ts`). Keeping the
  script invited the same bug back.
- **`user_and_reservation_policies.sql`** used `CREATE POLICY IF NOT EXISTS`, which PostgreSQL does
  not support. It could never have run. Its contents were a subset of `fix_supabase_permissions.sql`
  anyway.

Recover them from git history if a question about pre-migration state ever comes up; do not run
them.
