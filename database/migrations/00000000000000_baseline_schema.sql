-- Baseline: the schema as it stood before migrations were used.
--
-- Supabase's recorded history for this project begins at
-- 20260806160035_fix_missing_rls_policies_and_hardening - a correction, not a creation.
-- Everything that file corrects (every table, the has_role() helper, the enum vocabulary, the
-- overlap exclusion constraint) was built directly against the hosted project before anyone was
-- writing migrations, so it was never captured anywhere. The consequence was that
-- database/migrations/ replayed the project's history faithfully and still could not produce a
-- working database from empty: standing up staging, CI or a local stack meant cloning the schema
-- out of production by hand first.
--
-- This file closes that. It is the missing first step, and it is deliberately dated
-- 00000000000000 so it sorts ahead of every real migration.
--
-- WHAT IT DESCRIBES
--
-- The state immediately BEFORE 20260806160035, not the state today. That distinction is the whole
-- point: the migrations that follow have to remain meaningful when they replay, and several of
-- them are not re-runnable (bare `create type`, `create table`, `create policy` with no IF NOT
-- EXISTS). So the columns, tables, enum values and policies that later migrations add are absent
-- here on purpose - `waiting_list_entries.notes`, `reservations.check_in_at`,
-- `users.must_change_password`, the LOGOUT audit action, `cluster_vip_members`,
-- `late_check_in_requests`, `ai_provider_config` and the rest arrive when their own migration runs.
-- Conversely `settings_change_requests` exists here and is dropped later, because 20260806160035
-- writes a policy on it.
--
-- Two categories are pulled FORWARD rather than left to their migrations, and both are security
-- fixes whose statements are idempotent, so the later migration re-applies them as a no-op:
--
--   * search_path is pinned on the SECURITY DEFINER functions, the view is created with
--     security_invoker, and the EXECUTE grants on the auth trigger functions are already narrowed.
--   * audit_logs gets no INSERT policy and no INSERT grant for anon/authenticated, and
--     mv_reservation_daily_stats is granted to service_role alone.
--
-- A baseline that reproduced the pre-hardening state would mean a fresh project spending the
-- length of a migration run with a forgeable audit trail and world-readable occupancy analytics.
-- Not worth the tidiness.
--
-- Generated from the live project on 2026-08-19 by reading its catalogs (pg_class, pg_constraint,
-- pg_policy, pg_proc, pg_indexes), then subtracting what the recorded migrations add. No Supabase
-- CLI and no direct Postgres connection were available to dump from.
--
-- SCHEMA ONLY. No rows. Seeding is database/seeder.ts (buildings, floors, spaces, clusters,
-- workstations) and 20260811132256 (the permissions / role_permissions matrix).
--
--   !! KNOWN GAP: the ten rows of public.roles are seeded by nothing in this repository. They
--   !! exist only in the hosted project. handle_new_auth_user() looks up code = 'EMPLOYEE' to give
--   !! a new account its default role, and 20260811132256 joins every matrix cell against
--   !! roles.code - with an empty roles table that migration inserts zero rows and the whole RBAC
--   !! matrix comes up empty, which PermissionService reports as one [RBAC] warning on boot and
--   !! otherwise degrades silently to the routes' hardcoded fallback lists. Populate roles before
--   !! running 20260811132256. See database/migrations/README.md.
--
-- HOW TO USE IT ON A FRESH PROJECT
--
--   1. Apply this file.
--   2. Insert the ten role rows (see the gap note above).
--   3. Apply every other file in this directory in filename order.
--   4. Run database/seeder.ts (it is idempotent - it seeds only when clusters is empty).
--
-- Every statement here is guarded, so applying it to a database that already has this schema -
-- production included - changes nothing. That is intentional: a baseline is the file most likely
-- to be run somewhere it was not meant to be.


-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- citext backs users.email: addresses are compared case-insensitively, and the unique index has to
-- agree with that or two accounts can differ only by capitalisation.
-- btree_gist is what lets excl_no_overlap_per_workstation mix an equality test on workstation_id
-- with a range overlap test on period inside one GiST exclusion constraint.

create extension if not exists citext with schema public;
create extension if not exists btree_gist with schema public;


-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------
-- Guarded individually: CREATE TYPE has no IF NOT EXISTS.
-- audit_action does NOT list 'LOGOUT' here - 20260808113916 adds it.

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'user_status') then
    create type public.user_status as enum ('ACTIVE', 'INACTIVE', 'SUSPENDED');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'space_type') then
    create type public.space_type as enum ('OPEN_SPACE', 'MEETING_ROOM', 'EXECUTIVE_ROOM', 'PHONE_BOX', 'LOUNGE', 'OTHER');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'workstation_status') then
    create type public.workstation_status as enum ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'NO_SHOW', 'DISABLED', 'MAINTENANCE');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'reservation_type') then
    create type public.reservation_type as enum ('HALF_DAY_AM', 'HALF_DAY_PM', 'FULL_DAY', 'MULTI_DAY', 'STANDARD');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'reservation_status') then
    create type public.reservation_status as enum ('DRAFT', 'PENDING_APPROVAL', 'CONFIRMED', 'CHECK_IN_PENDING', 'OCCUPIED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW', 'AVAILABLE_RELEASED');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'check_event_type') then
    create type public.check_event_type as enum ('CHECK_IN', 'CHECK_OUT_MANUAL', 'CHECK_OUT_AUTO', 'NO_SHOW_RELEASE');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'approval_type') then
    create type public.approval_type as enum ('LONG_DURATION', 'CLUSTER_MANAGEMENT');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'approval_status') then
    create type public.approval_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'INFO_REQUESTED');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'waiting_list_status') then
    create type public.waiting_list_status as enum ('WAITING', 'OFFERED', 'ACCEPTED', 'EXPIRED', 'CANCELLED');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'notification_channel') then
    create type public.notification_channel as enum ('IN_APP', 'EMAIL', 'PUSH');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'notification_status') then
    create type public.notification_status as enum ('PENDING', 'SENT', 'FAILED', 'READ');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'audit_action') then
    create type public.audit_action as enum ('LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'CHECK_IN', 'CHECK_OUT', 'NO_SHOW', 'CLUSTER_ACTIVATE', 'CLUSTER_DEACTIVATE', 'ROLE_CHANGE', 'SETTINGS_CHANGE', 'EXPORT', 'AI_QUERY');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'digital_twin_object_type') then
    create type public.digital_twin_object_type as enum ('WALL', 'CIRCULATION', 'ENTRANCE', 'WORKSTATION', 'CLUSTER_ZONE', 'COLLAB_ZONE', 'EQUIPMENT', 'PRINTER', 'DISPLAY', 'DISABLED_ZONE');
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- The backbone of this schema's RLS. Every role check in every policy goes through it, and it is
-- SECURITY DEFINER so that a caller who cannot read user_roles can still be judged against it.
-- It answers only about the caller's own roles (ur.user_id = auth.uid()), which is why it is safe
-- to leave callable by anon - see the closing note in 20260819122112.
create or replace function public.has_role(role_codes text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.code = any(role_codes)
  );
$function$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- Sign-up is limited to the corporate domain at the database level, so it holds regardless of
-- which client or admin API the account is created through.
create or replace function public.restrict_signup_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.email !~* '@ocpgroup\.ma$' then
    raise exception 'Sign-up restricted to @ocpgroup.ma email addresses';
  end if;
  return new;
end;
$function$;

-- Mirrors a new auth.users row into public.users and gives it the default EMPLOYEE role.
-- Depends on a roles row with code = 'EMPLOYEE' existing; see the KNOWN GAP note at the top.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.users (id, email, full_name, status)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'ACTIVE');

  insert into public.user_roles (user_id, role_id)
  select new.id, id from public.roles where code = 'EMPLOYEE';

  return new;
end;
$function$;


-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
-- Primary keys, unique constraints and check constraints are inline; foreign keys are declared
-- further down so that the order tables appear in here cannot matter.

-- Identity mirror of auth.users. The application never reads auth.users directly.
create table if not exists public.users (
  id             uuid primary key,
  email          citext not null unique,
  full_name      text not null,
  department     text,
  employee_code  text unique,
  status         user_status not null default 'ACTIVE',
  avatar_url     text,
  locale         text default 'fr',
  theme          text default 'light',
  last_login_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.roles (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  description  text,
  -- Marks the roles whose assignment is itself a governed act (SUPER_ADMIN, ADMIN).
  is_critical  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.permissions (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  domain       text not null,
  description  text,
  created_at   timestamptz not null default now()
);

-- One row per (role, permission) cell of the SRS section 13 matrix. Empty until 20260811132256.
create table if not exists public.role_permissions (
  role_id        uuid not null,
  permission_id  uuid not null,
  can_read       boolean not null default false,
  can_create     boolean not null default false,
  can_update     boolean not null default false,
  can_delete     boolean not null default false,
  can_approve    boolean not null default false,
  primary key (role_id, permission_id)
);

create table if not exists public.user_roles (
  user_id     uuid not null,
  role_id     uuid not null,
  granted_by  uuid,
  granted_at  timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table if not exists public.buildings (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.floors (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null,
  name         text not null,
  level        integer not null,
  created_at   timestamptz not null default now(),
  unique (building_id, level)
);

create table if not exists public.spaces (
  id          uuid primary key default gen_random_uuid(),
  floor_id    uuid not null,
  name        text not null,
  type        space_type not null default 'OPEN_SPACE',
  active      boolean not null default true,
  capacity    integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.clusters (
  id                   uuid primary key default gen_random_uuid(),
  space_id             uuid not null,
  code                 text not null,
  name                 text not null,
  -- CL-F / CL-G: booking one needs an approved cluster_authorizations row (BR-09).
  management_reserved  boolean not null default false,
  enabled              boolean not null default true,
  desk_count           integer not null default 4,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (space_id, code)
);

create table if not exists public.workstations (
  id            uuid primary key default gen_random_uuid(),
  cluster_id    uuid not null,
  code          text not null,
  status        workstation_status not null default 'AVAILABLE',
  reservable    boolean not null default true,
  svg_position  jsonb,
  -- near_window / is_pmr / is_quiet_zone - the vocabulary WorkstationSearchQuery filters on.
  metadata      jsonb default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (cluster_id, code)
);

-- SRS section 19/20: the mapping between SVG elements and rows. Specified but not yet wired up -
-- the Twin still reads workstations.svg_position. Kept empty rather than dropped; see the
-- reasoning recorded in 20260818083753.
create table if not exists public.digital_twin_objects (
  id              uuid primary key default gen_random_uuid(),
  space_id        uuid not null,
  object_type     digital_twin_object_type not null,
  workstation_id  uuid,
  svg_element_id  text not null,
  label           text,
  geometry        jsonb not null,
  interactive     boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (space_id, svg_element_id)
);

-- `period` is generated rather than written by the application so that the exclusion constraint
-- below can never be fooled by a caller that sets the range and the endpoints inconsistently.
create table if not exists public.reservations (
  id                 uuid primary key default gen_random_uuid(),
  workstation_id     uuid not null,
  user_id            uuid not null,
  type               reservation_type not null,
  start_at           timestamptz not null,
  end_at             timestamptz not null,
  status             reservation_status not null default 'CONFIRMED',
  requires_approval  boolean not null default false,
  purpose            text,
  check_in_deadline  timestamptz,
  cancelled_at       timestamptz,
  cancelled_by       uuid,
  cancel_reason      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  period             tstzrange generated always as (tstzrange(start_at, end_at, '[)'::text)) stored,
  constraint chk_reservation_period check (end_at > start_at)
);

create table if not exists public.check_events (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null,
  event_type      check_event_type not null,
  actor_id        uuid,
  occurred_at     timestamptz not null default now(),
  metadata        jsonb default '{}'::jsonb
);

-- A request targets exactly one thing: a long reservation (BR-05/06) or a management cluster
-- unlock (BR-09). chk_one_target is what keeps the two workflows from blurring into one row.
create table if not exists public.approval_requests (
  id                        uuid primary key default gen_random_uuid(),
  approval_type             approval_type not null,
  reservation_id            uuid,
  cluster_authorization_id  uuid,
  requested_by              uuid not null,
  status                    approval_status not null default 'PENDING',
  decided_by                uuid,
  decision_reason           text,
  decided_at                timestamptz,
  created_at                timestamptz not null default now(),
  constraint chk_one_target check (
    (reservation_id is not null and cluster_authorization_id is null)
    or (reservation_id is null and cluster_authorization_id is not null)
  )
);

create table if not exists public.cluster_authorizations (
  id             uuid primary key default gen_random_uuid(),
  cluster_id     uuid not null,
  requested_by   uuid not null,
  reason         text not null,
  decided_by     uuid,
  status         approval_status not null default 'PENDING',
  starts_at      timestamptz,
  ends_at        timestamptz,
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz not null default now()
);

-- fifo_rank is GENERATED ALWAYS: queue position is assigned by the database, so it cannot be
-- edited into a better place by any caller.
create table if not exists public.waiting_list_entries (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null,
  space_id                uuid not null,
  preferred_cluster_id    uuid,
  requested_start_at      timestamptz not null,
  requested_end_at        timestamptz not null,
  status                  waiting_list_status not null default 'WAITING',
  offered_workstation_id  uuid,
  offer_expires_at        timestamptz,
  fifo_rank               bigint generated always as identity not null,
  created_at              timestamptz not null default now(),
  resolved_at             timestamptz
);

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  reservation_id  uuid,
  event_code      text not null,
  channel         notification_channel not null,
  status          notification_status not null default 'PENDING',
  title           text not null,
  body            text,
  sent_at         timestamptz,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- Append-only trail behind SRS section 26. Writes are server-side only; see the grants at the
-- bottom of this file and the reasoning in 20260818084619.
create table if not exists public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid,
  action       audit_action not null,
  entity_type  text not null,
  entity_id    uuid,
  before       jsonb,
  after        jsonb,
  ip_address   inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create table if not exists public.ai_interactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  prompt         text not null,
  response       text,
  context_scope  jsonb,
  confidence     numeric,
  created_at     timestamptz not null default now()
);

-- Booking rules. One row in practice; space_id is nullable so that row is the global default.
create table if not exists public.settings (
  id                                 uuid primary key default gen_random_uuid(),
  space_id                           uuid,
  max_duration_hours_no_approval     numeric not null default 24,
  no_show_window_minutes             integer not null default 30,
  business_days                      integer[] not null default '{1,2,3,4,5}'::integer[],
  business_hours_start               time without time zone not null default '08:00:00',
  business_hours_end                 time without time zone not null default '18:00:00',
  waiting_list_offer_expiry_minutes  integer not null default 15,
  updated_by                         uuid,
  updated_at                         timestamptz not null default now()
);

-- An early sketch of an OTP-gated approval workflow for settings changes. It was never used and
-- 20260818083753 drops it - but 20260806160035 replaces a policy on it first, so replaying the
-- history from empty requires it to be here. Do not build anything on it.
create table if not exists public.settings_change_requests (
  id            uuid primary key default gen_random_uuid(),
  challenge_id  text not null unique,
  admin_id      uuid not null,
  admin_name    text,
  new_settings  jsonb not null,
  otp_code      text not null,
  status        text not null,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- Foreign keys and the overlap exclusion constraint
-- ---------------------------------------------------------------------------
-- Declared after every table so the order above is irrelevant, and guarded by name because
-- ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS. The names match what the live project
-- carries, so a later migration that drops one by name still finds it.

do $$
declare r record;
begin
  for r in
    select * from (values
      ('users', 'users_id_fkey', 'foreign key (id) references auth.users(id) on delete cascade'),

      ('role_permissions', 'role_permissions_role_id_fkey', 'foreign key (role_id) references public.roles(id) on delete cascade'),
      ('role_permissions', 'role_permissions_permission_id_fkey', 'foreign key (permission_id) references public.permissions(id) on delete cascade'),

      ('user_roles', 'user_roles_user_id_fkey', 'foreign key (user_id) references public.users(id) on delete cascade'),
      ('user_roles', 'user_roles_role_id_fkey', 'foreign key (role_id) references public.roles(id) on delete cascade'),
      ('user_roles', 'user_roles_granted_by_fkey', 'foreign key (granted_by) references public.users(id)'),

      ('floors', 'floors_building_id_fkey', 'foreign key (building_id) references public.buildings(id) on delete cascade'),
      ('spaces', 'spaces_floor_id_fkey', 'foreign key (floor_id) references public.floors(id) on delete cascade'),
      ('clusters', 'clusters_space_id_fkey', 'foreign key (space_id) references public.spaces(id) on delete cascade'),
      ('workstations', 'workstations_cluster_id_fkey', 'foreign key (cluster_id) references public.clusters(id) on delete cascade'),

      ('digital_twin_objects', 'digital_twin_objects_space_id_fkey', 'foreign key (space_id) references public.spaces(id) on delete cascade'),
      ('digital_twin_objects', 'digital_twin_objects_workstation_id_fkey', 'foreign key (workstation_id) references public.workstations(id) on delete cascade'),

      -- No cascade from workstations: a desk cannot be deleted out from under a booking history.
      ('reservations', 'reservations_workstation_id_fkey', 'foreign key (workstation_id) references public.workstations(id)'),
      ('reservations', 'reservations_user_id_fkey', 'foreign key (user_id) references public.users(id)'),
      ('reservations', 'reservations_cancelled_by_fkey', 'foreign key (cancelled_by) references public.users(id)'),

      ('check_events', 'check_events_reservation_id_fkey', 'foreign key (reservation_id) references public.reservations(id) on delete cascade'),
      ('check_events', 'check_events_actor_id_fkey', 'foreign key (actor_id) references public.users(id)'),

      ('approval_requests', 'approval_requests_reservation_id_fkey', 'foreign key (reservation_id) references public.reservations(id) on delete cascade'),
      ('approval_requests', 'approval_requests_cluster_authorization_id_fkey', 'foreign key (cluster_authorization_id) references public.cluster_authorizations(id) on delete cascade'),
      ('approval_requests', 'approval_requests_requested_by_fkey', 'foreign key (requested_by) references public.users(id)'),
      ('approval_requests', 'approval_requests_decided_by_fkey', 'foreign key (decided_by) references public.users(id)'),

      ('cluster_authorizations', 'cluster_authorizations_cluster_id_fkey', 'foreign key (cluster_id) references public.clusters(id) on delete cascade'),
      ('cluster_authorizations', 'cluster_authorizations_requested_by_fkey', 'foreign key (requested_by) references public.users(id)'),
      ('cluster_authorizations', 'cluster_authorizations_decided_by_fkey', 'foreign key (decided_by) references public.users(id)'),

      ('waiting_list_entries', 'waiting_list_entries_user_id_fkey', 'foreign key (user_id) references public.users(id)'),
      ('waiting_list_entries', 'waiting_list_entries_space_id_fkey', 'foreign key (space_id) references public.spaces(id)'),
      ('waiting_list_entries', 'waiting_list_entries_preferred_cluster_id_fkey', 'foreign key (preferred_cluster_id) references public.clusters(id)'),
      ('waiting_list_entries', 'waiting_list_entries_offered_workstation_id_fkey', 'foreign key (offered_workstation_id) references public.workstations(id)'),

      ('notifications', 'notifications_user_id_fkey', 'foreign key (user_id) references public.users(id)'),
      -- The notification survives the booking it referred to; the trail is the point.
      ('notifications', 'notifications_reservation_id_fkey', 'foreign key (reservation_id) references public.reservations(id) on delete set null'),

      ('audit_logs', 'audit_logs_actor_id_fkey', 'foreign key (actor_id) references public.users(id)'),
      ('ai_interactions', 'ai_interactions_user_id_fkey', 'foreign key (user_id) references public.users(id)'),

      ('settings', 'settings_space_id_fkey', 'foreign key (space_id) references public.spaces(id) on delete cascade'),
      ('settings', 'settings_updated_by_fkey', 'foreign key (updated_by) references public.users(id)'),

      -- The double-booking rule, enforced by the database rather than by a read-then-write check
      -- in application code: two live reservations cannot overlap on the same desk. Statuses that
      -- no longer hold the desk (CANCELLED, COMPLETED, NO_SHOW, ...) are outside the predicate.
      ('reservations', 'excl_no_overlap_per_workstation',
       'exclude using gist (workstation_id with =, period with &&) where (status = any (array[''CONFIRMED''::reservation_status, ''PENDING_APPROVAL''::reservation_status, ''CHECK_IN_PENDING''::reservation_status, ''OCCUPIED''::reservation_status]))')
    ) as t(tbl, con, def)
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = r.con and conrelid = format('public.%I', r.tbl)::regclass
    ) then
      execute format('alter table public.%I add constraint %I %s', r.tbl, r.con, r.def);
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- Only the non-constraint indexes; primary keys, unique constraints and the exclusion constraint
-- bring their own.

create index if not exists idx_reservations_user on public.reservations (user_id);
create index if not exists idx_reservations_status on public.reservations (status);
-- Availability lookups ask "is this desk free over this window", which is the same shape as the
-- exclusion constraint but unfiltered by status.
create index if not exists idx_reservations_workstation_period on public.reservations using gist (workstation_id, period);

create index if not exists idx_workstations_status on public.workstations (status);
create index if not exists idx_check_events_reservation on public.check_events (reservation_id);
create index if not exists idx_approval_status on public.approval_requests (status);
create index if not exists idx_notifications_user on public.notifications (user_id, status);
-- The FIFO sweep reads the queue in rank order within a status.
create index if not exists idx_waitinglist_status on public.waiting_list_entries (status, fifo_rank);
create index if not exists idx_audit_logs_actor on public.audit_logs (actor_id, created_at desc);
create index if not exists idx_audit_logs_entity on public.audit_logs (entity_type, entity_id);


-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
-- Dropped by name first because CREATE TRIGGER has no IF NOT EXISTS.

drop trigger if exists trg_set_updated_at on public.users;
create trigger trg_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.roles;
create trigger trg_set_updated_at before update on public.roles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.buildings;
create trigger trg_set_updated_at before update on public.buildings
  for each row execute function public.set_updated_at();

-- NOTE: public.floors has no updated_at column, so this trigger raises on any UPDATE of a floor.
-- Reproduced because it is what the live project carries, and a baseline whose job is to state
-- what already exists is the wrong place to quietly change behaviour. It is a real defect and
-- deserves its own migration.
drop trigger if exists trg_set_updated_at on public.floors;
create trigger trg_set_updated_at before update on public.floors
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.spaces;
create trigger trg_set_updated_at before update on public.spaces
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.clusters;
create trigger trg_set_updated_at before update on public.clusters
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.workstations;
create trigger trg_set_updated_at before update on public.workstations
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.reservations;
create trigger trg_set_updated_at before update on public.reservations
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.settings;
create trigger trg_set_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- The two auth-side triggers. Without them a new sign-up gets an auth.users row and no
-- public.users row, and the account is invisible to the entire application.
do $$ begin
  if to_regclass('auth.users') is not null then
    drop trigger if exists enforce_email_domain on auth.users;
    create trigger enforce_email_domain before insert on auth.users
      for each row execute function public.restrict_signup_domain();

    drop trigger if exists on_auth_user_created on auth.users;
    create trigger on_auth_user_created after insert on auth.users
      for each row execute function public.handle_new_auth_user();
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- View and materialized view
-- ---------------------------------------------------------------------------

-- security_invoker is set at creation rather than left to 20260806160035's ALTER VIEW, so the view
-- is never briefly SECURITY DEFINER on a fresh database. Both underlying tables have public SELECT
-- policies, so this changes no results - it just stops the view from bypassing the caller's RLS.
create or replace view public.v_occupancy_current
with (security_invoker = true) as
  select w.id as workstation_id,
         w.code,
         c.id as cluster_id,
         c.name as cluster_name,
         w.status
  from public.workstations w
  join public.clusters c on c.id = w.cluster_id;

-- Materialized views ignore RLS entirely, which is why the grants at the end of this file give
-- this one to service_role alone. See 20260819122112 for the full reasoning.
do $$ begin
  if to_regclass('public.mv_reservation_daily_stats') is null then
    create materialized view public.mv_reservation_daily_stats as
      select date_trunc('day'::text, r.start_at) as day,
             w.cluster_id,
             count(*) filter (where r.status = 'COMPLETED'::reservation_status)  as completed_count,
             count(*) filter (where r.status = 'NO_SHOW'::reservation_status)    as no_show_count,
             count(*) filter (where r.status = 'CANCELLED'::reservation_status)  as cancelled_count,
             count(*) as total_count
      from public.reservations r
      join public.workstations w on w.id = r.workstation_id
      group by (date_trunc('day'::text, r.start_at)), w.cluster_id;
  end if;
end $$;

create index if not exists idx_mv_reservation_daily_stats
  on public.mv_reservation_daily_stats (day, cluster_id);

comment on materialized view public.mv_reservation_daily_stats is
  'Aggregate occupancy/no-show/cancellation stats. Materialized views ignore RLS, so access is controlled by GRANT alone: service_role only. Do not grant to anon or authenticated - reads belong behind the `analytics` permission on /api/telemetry/*.';


-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Every table in this schema is RLS-enabled. Enabling it with no matching policy is a deny, which
-- is the state several tables were in until 20260806160035 - that is what that migration fixes,
-- and why the policy set below is smaller than the one production carries today.

alter table public.users                    enable row level security;
alter table public.roles                    enable row level security;
alter table public.permissions              enable row level security;
alter table public.role_permissions         enable row level security;
alter table public.user_roles               enable row level security;
alter table public.buildings                enable row level security;
alter table public.floors                   enable row level security;
alter table public.spaces                   enable row level security;
alter table public.clusters                 enable row level security;
alter table public.workstations             enable row level security;
alter table public.digital_twin_objects     enable row level security;
alter table public.reservations             enable row level security;
alter table public.check_events             enable row level security;
alter table public.approval_requests        enable row level security;
alter table public.cluster_authorizations   enable row level security;
alter table public.waiting_list_entries     enable row level security;
alter table public.notifications            enable row level security;
alter table public.audit_logs               enable row level security;
alter table public.ai_interactions          enable row level security;
alter table public.settings                 enable row level security;
alter table public.settings_change_requests enable row level security;


-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- All are PERMISSIVE and TO public; the role distinction is made inside has_role(), not by
-- granting to a database role. Dropped by name first because CREATE POLICY has no IF NOT EXISTS.

-- users
drop policy if exists p_users_self on public.users;
create policy p_users_self on public.users
  for select using (id = auth.uid());

drop policy if exists p_users_admin_all on public.users;
create policy p_users_admin_all on public.users
  for all using (has_role(array['SUPER_ADMIN', 'ADMIN']));

-- roles / user_roles
drop policy if exists p_roles_read on public.roles;
create policy p_roles_read on public.roles
  for select using (true);

drop policy if exists p_user_roles_self on public.user_roles;
create policy p_user_roles_self on public.user_roles
  for select using (user_id = auth.uid() or has_role(array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists p_user_roles_admin_manage on public.user_roles;
create policy p_user_roles_admin_manage on public.user_roles
  for all
  using (has_role(array['SUPER_ADMIN', 'ADMIN']))
  with check (has_role(array['SUPER_ADMIN', 'ADMIN']));

-- Referential geography: readable by everyone, written through the service role only.
drop policy if exists p_spaces_read on public.spaces;
create policy p_spaces_read on public.spaces
  for select using (true);

drop policy if exists p_clusters_read on public.clusters;
create policy p_clusters_read on public.clusters
  for select using (true);

drop policy if exists p_workstations_read on public.workstations;
create policy p_workstations_read on public.workstations
  for select using (true);

drop policy if exists p_dt_objects_read on public.digital_twin_objects;
create policy p_dt_objects_read on public.digital_twin_objects
  for select using (true);

-- reservations: a booking is the owner's, plus the operational roles that have to see the floor.
drop policy if exists p_reservations_owner_read on public.reservations;
create policy p_reservations_owner_read on public.reservations
  for select using (
    user_id = auth.uid()
    or has_role(array['SUPER_ADMIN', 'ADMIN', 'BUILDING_MANAGER', 'GCI_MANAGER', 'RECEPTIONIST'])
  );

drop policy if exists p_reservations_owner_insert on public.reservations;
create policy p_reservations_owner_insert on public.reservations
  for insert with check (
    user_id = auth.uid()
    or has_role(array['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'])
  );

drop policy if exists p_reservations_owner_update on public.reservations;
create policy p_reservations_owner_update on public.reservations
  for update using (
    user_id = auth.uid()
    or has_role(array['SUPER_ADMIN', 'ADMIN', 'BUILDING_MANAGER', 'GCI_MANAGER'])
  );

-- Deleting a booking outright is not the cancellation path - cancellation is a status change.
drop policy if exists p_reservations_delete on public.reservations;
create policy p_reservations_delete on public.reservations
  for delete using (has_role(array['SUPER_ADMIN', 'ADMIN', 'BUILDING_MANAGER']));

-- approvals
drop policy if exists p_approvals_read on public.approval_requests;
create policy p_approvals_read on public.approval_requests
  for select using (
    requested_by = auth.uid()
    or has_role(array['SUPER_ADMIN', 'ADMIN', 'EXECUTIVE_ASSISTANT', 'DIRECTOR', 'GCI_MANAGER', 'BUILDING_MANAGER'])
  );

drop policy if exists p_approvals_decide on public.approval_requests;
create policy p_approvals_decide on public.approval_requests
  for update using (
    has_role(array['SUPER_ADMIN', 'ADMIN', 'EXECUTIVE_ASSISTANT', 'DIRECTOR', 'GCI_MANAGER', 'BUILDING_MANAGER'])
  );

-- notifications
drop policy if exists p_notifications_owner on public.notifications;
create policy p_notifications_owner on public.notifications
  for select using (user_id = auth.uid());

-- settings
drop policy if exists p_settings_read on public.settings;
create policy p_settings_read on public.settings
  for select using (true);

drop policy if exists p_settings_admin_write on public.settings;
create policy p_settings_admin_write on public.settings
  for update using (has_role(array['SUPER_ADMIN', 'ADMIN', 'IT_ADMIN']));

-- audit_logs: read is narrow and there is deliberately NO insert policy. With RLS on and no
-- matching policy, anon and authenticated are denied by default and service_role bypasses RLS,
-- which is exactly the end state 20260818084619 arrives at. A fresh database should never pass
-- through the forgeable-trail state that migration was written to undo.
drop policy if exists p_audit_read on public.audit_logs;
create policy p_audit_read on public.audit_logs
  for select using (has_role(array['SUPER_ADMIN', 'SECURITY', 'IT_ADMIN']));

-- settings_change_requests: this is the broken policy 20260806160035 replaces. It compares against
-- a lowercase role code while every seeded code is uppercase, so it matches nobody. Recreated here
-- only so that migration has something to drop; its exact expression could not be recovered from
-- the live project - the policy was replaced before this baseline was written - and is
-- reconstructed from that migration's description of it.
drop policy if exists super_admin_full_access on public.settings_change_requests;
create policy super_admin_full_access on public.settings_change_requests
  for all
  using (has_role(array['super_admin']))
  with check (has_role(array['super_admin']));


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Supabase's default privileges hand anon/authenticated/service_role full table access and let RLS
-- do the real work. Restated explicitly so this file also stands up a plain PostgreSQL instance,
-- and guarded because those roles do not exist outside Supabase.

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated')
     and exists (select 1 from pg_roles where rolname = 'service_role') then

    grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables in schema public to anon, authenticated, service_role;

    -- Two carve-outs from that blanket grant, both load-bearing.

    -- The audit trail is written by the server alone. RLS already denies it (no insert policy
    -- above), but the grant is the layer that does not depend on a policy being present.
    revoke insert on public.audit_logs from anon, authenticated;

    -- A materialized view cannot have RLS, so the grant IS the access control. GRANT ON ALL TABLES
    -- does not reach a matview, so service_role is named explicitly and the other two are revoked
    -- rather than merely left out - ALL rather than SELECT, because MAINTAIN would otherwise leave
    -- REFRESH MATERIALIZED VIEW reachable as an on-demand re-aggregation of the whole history.
    grant all on public.mv_reservation_daily_stats to service_role;
    revoke all privileges on public.mv_reservation_daily_stats from anon, authenticated;
  end if;
end $$;

comment on table public.audit_logs is
  'Append-only audit trail. Writes are server-side only (service_role); browser code must use POST /api/audit, which takes the actor from the JWT. Do not add a permissive INSERT policy for anon/authenticated.';

-- The two auth trigger functions are SECURITY DEFINER and would otherwise carry the default PUBLIC
-- EXECUTE grant, which is what makes them show up as anon-callable RPCs. PostgreSQL checks EXECUTE
-- at CREATE TRIGGER time, not on each fire, so narrowing this costs the triggers nothing.
--
-- has_role() and set_updated_at() keep their default grants on purpose: has_role() is evaluated as
-- the calling role inside every policy in this schema, so revoking it would turn every RLS check
-- into a permission error. 20260819122112 records that reasoning at length.
revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.restrict_signup_domain() from public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.handle_new_auth_user() to service_role;
    grant execute on function public.restrict_signup_domain() to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_auth_user() to supabase_auth_admin;
    grant execute on function public.restrict_signup_domain() to supabase_auth_admin;
  end if;
end $$;
