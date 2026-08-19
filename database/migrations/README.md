# Migrations

Timestamped files in this directory (`<version>_<name>.sql`) mirror Supabase's applied migration
history one-for-one. `version` is the value in `supabase_migrations.schema_migrations`, so the
filename and the recorded migration always agree, and applying them in filename order replays that
history exactly.

These were backfilled out of Supabase on 2026-08-14. Until then the history existed only in the
hosted project: every migration had been applied through the API and none had a counterpart in
git.

## Bootstrapping a database from empty

Supabase's recorded history begins at `20260806160035_fix_missing_rls_policies_and_hardening`a
*correction*, not a schema creation. Everything it corrects was created before migrations were used
at all, directly against the hosted project, so none of it was ever captured: no file in the
recorded history issues a `CREATE TABLE`, defines the `has_role()` helper every policy calls, or
declares the enum types. The first file assumes all of it already exists.

`00000000000000_baseline_schema.sql` is that missing first step, written on 2026-08-19 by reading
the live project's catalogs and subtracting what the recorded migrations add. Its version is
all-zeroes so it sorts ahead of every real migration, and it carries no `schema_migrations` entry
because it never ran against the hosted project - it describes what that project already had.

It captures the schema **as of just before `20260806160035`**, not the schema as it stands today,
and that is deliberate. The migrations that follow have to stay meaningful when they replay, and
several are not re-runnable: `20260807121205`, `20260814131641` and `20260815122426` issue bare
`create table` / `create type`, and most of the early files issue bare `create policy`. A baseline
holding today's schema would make all three fail on a fresh database. So the later additions are
absent on purpose - `waiting_list_entries.notes`, `reservations.check_in_at`,
`users.must_change_password`, the `LOGOUT` audit action, `cluster_vip_members`,
`late_check_in_requests`, `ai_provider_config` - and `settings_change_requests` is present even
though `20260818083753` drops it, because `20260806160035` writes a policy on it first.

Security fixes are the one exception. Where a later migration's statement is idempotent, the
baseline already reflects its outcome: pinned `search_path`, `security_invoker` on the view,
narrowed EXECUTE on the auth trigger functions, no INSERT grant or policy on `audit_logs`, and
`mv_reservation_daily_stats` granted to `service_role` alone. The migration re-applies each as a
no-op. A fresh project should not spend a migration run with a forgeable audit trail.

### Order

1. `00000000000000_baseline_schema.sql`
2. The ten `roles` rows - **see below, this is not automated**
3. Every remaining file in filename order
4. `database/seeder.ts` (idempotent: it seeds only when `clusters` is empty)

### Still missing: the `roles` rows

The ten role rows exist only in the hosted project. Nothing in this repository creates them -
not the baseline (which is schema-only by design), not `seeder.ts`, not any migration. Two things
depend on them:

- `handle_new_auth_user()` looks up `code = 'EMPLOYEE'` to give each new account its default role.
  Without that row a new sign-up lands with no roles at all.
- `20260811132256` joins every matrix cell against `roles.code`. Against an empty `roles` it
  inserts zero rows and the RBAC matrix comes up empty - which fails the way described in the next
  section, quietly.

The codes are `SUPER_ADMIN`, `ADMIN`, `BUILDING_MANAGER`, `GCI_MANAGER`, `RECEPTIONIST`,
`DIRECTOR`, `EXECUTIVE_ASSISTANT`, `IT_ADMIN`, `SECURITY`, `EMPLOYEE`; `SUPER_ADMIN` and `ADMIN`
carry `is_critical = true`. Insert them between steps 1 and 3. Folding this into a proper seed
migration is the remaining piece of work.

## Why an empty matrix is worse than a crash

`20260811132256_seed_permissions_and_role_permissions_matrix.sql` populates `role_permissions`,
the table every route guard reads through `PermissionService`. When that table is empty,
`PermissionService.can()` returns `null` rather than `false`a deliberate choice so a database
outage degrades to previous behaviour instead of locking everyone out (see
`services/rbac/permissionService.ts`). A database built without this migration therefore serves
every request on `requirePermission`'s hardcoded fallback lists: the app comes up and works, with
the pre-RBAC role lists in force and different 403/200 behaviour than the matrix defines. The only
signal is one `[RBAC]` warning on boot.

## Conventions

- **The baseline is not a place to add things.** It states what the hosted project already had.
  A change to the schema is a new timestamped migration, even when the baseline is where the
  object it touches is defined. Edit the baseline only to correct a mis-transcription of the
  pre-migration schema - and check the change against the live catalogs first.
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
