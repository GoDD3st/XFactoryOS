# Supabase Changelog — XFactory OS (project `ygoqiipvarlqtvpuhrbo`)

Running log of every schema/RLS/data change applied directly to the live Supabase project during this session. Newest entries at the bottom. Each entry names the migration, what it touched, and why.

---

## 2026-08-06 — `fix_missing_rls_policies_and_hardening`

**Why:** 8 tables had Row Level Security *enabled* but **zero policies**, which means Postgres denies all access by default — these features were silently broken at the database layer for anyone not using the service-role key.

- **Added** SELECT (public read) policies: `buildings`, `floors`, `permissions`, `role_permissions`
- **Added** admin-only write (ALL) policies: `permissions`, `role_permissions`
- **Added** `check_events`: SELECT (owner or ops roles), INSERT (owner or admin/reception)
- **Added** `cluster_authorizations`: SELECT (requester or GCI/Building Manager/Admin), INSERT (requester), UPDATE/decide (GCI/Building Manager/Admin)
- **Added** `waiting_list_entries`: SELECT (owner or ops roles), INSERT (owner or admin/reception), UPDATE (owner or admin/reception)
- **Added** `ai_interactions`: SELECT (owner or Admin/IT Admin), INSERT (owner)
- **Deleted** policy `super_admin_full_access` on `settings_change_requests` — it compared role codes against lowercase `'super_admin'`, but real role codes are uppercase (`'SUPER_ADMIN'`), so it never matched anyone and silently blocked the OTP settings-change flow entirely. **Replaced** with `p_settings_change_requests_admin` (correct uppercase check via `has_role()`).
- **Edited** view `v_occupancy_current`: set `security_invoker = true` (was `SECURITY DEFINER`, flagged as an advisor ERROR). No behavior change — both underlying tables already have public SELECT policies.
- **Edited** functions `set_updated_at`, `has_role`, `restrict_signup_domain`, `handle_new_auth_user`: pinned `search_path = public` (closes a "mutable search_path" advisor WARN).
- **Edited** grants: revoked `SELECT` on materialized view `mv_reservation_daily_stats` from the `anon` role (was publicly readable without auth).

## 2026-08-06 — `add_workstation_cluster_write_policies`

**Why:** `workstations`/`clusters` only had a public SELECT policy — no write policy existed at all, so any write path other than the true service-role client (e.g. `SUPABASE_SERVICE_ROLE_KEY` unset) silently updated zero rows.

- **Added** `workstations`: UPDATE/INSERT/DELETE policies (Super Admin/Admin = full CRUD, Building/GCI Manager = UPDATE only), matching SRS §13 matrix.
- **Added** `clusters`: same shape as above.

## 2026-08-06 — `add_notifications_write_policies`

**Why:** `notifications` only had a SELECT (owner) policy — no INSERT/UPDATE policy existed, so every notification (booking confirmations, reminders, approval requests, no-show alerts — SRS FR-75–79) silently failed to write.

- **Added** INSERT policy: self, or any role that legitimately notifies other users (Super Admin/Admin/EA/Director/GCI/Building Manager/Receptionist/IT Admin).
- **Added** UPDATE policy (mark-as-read): owner or Admin/Super Admin.

## 2026-08-06 — `fix_approval_requests_schema_and_policy`

**Why:** the app was inserting a `reason`/`objective` field into `approval_requests` that **did not exist as a column** — every approval-request insert was failing outright (PostgREST rejects unknown columns). Separately, there was no INSERT policy for the table at all.

- **Added column** `approval_requests.objective` (text, nullable) — stores the requester's free-text justification for a long-duration reservation (BR-05/06, BPMN D2).
- **Added** INSERT policy: requester (self) or approver/ops roles acting on someone's behalf (Super Admin/Admin/EA/Director/GCI/Building Manager/Receptionist).

## 2026-08-06 — `add_users_read_policy_for_ops_roles`

**Why:** SRS §13 RBAC matrix grants "Gérer utilisateurs" = **R** (read) to Building Manager, GCI Manager, and IT Admin, in addition to Super Admin/Admin's CRUD — but only Super Admin/Admin and self-read were covered by policy. (The backend route was also missing `it_admin` from its role check — fixed in code, see main changelog/conversation.)

- **Added** `users`: SELECT policy for Building Manager/GCI Manager/IT Admin.

## 2026-08-06 — `add_waiting_list_notes_column`

**Why:** `WaitingListRepository` was reading/writing `user_name`, `user_department`, `notes`, and `preferred_cluster_code` on `waiting_list_entries` — none of those exist as columns (name/department are joinable via `user_id` → `users`; cluster code via `preferred_cluster_id` → `clusters`). `notes` had no equivalent anywhere, so every waiting-list entry silently lost its notes field and always displayed a generic placeholder name/department instead of the real requester.

- **Added column** `waiting_list_entries.notes` (text, nullable).

## 2026-08-06 — `fix_settings_raw_config_column`

**Why:** This is the big one. `SettingsRepository` (read/write for all system settings — booking window, quotas, holidays, the new lockdown feature, etc.) was written against a `raw_config` jsonb column, plus columns like `booking_window_days`, `bypass_roles`, `allow_weekend_booking`, `config_version`, that **never existed** on `public.settings` (confirmed by reading the live column list — the table only ever had `max_duration_hours_no_approval`, `no_show_window_minutes`, `business_days`, `business_hours_start/end`, `waiting_list_offer_expiry_minutes`, `updated_by`, `updated_at`). Consequence: **every settings write, ever, including through the OTP-confirmed Super Admin flow, has silently failed** (PostgREST rejects unknown columns), and every read silently fell back to hardcoded defaults. This was not specific to holidays/lockdown — it affected the entire settings system from the start.

- **Added column** `settings.raw_config` (jsonb, `NOT NULL DEFAULT '{}'`) — holds every settings field that doesn't have its own typed column (this was always the design intent based on the existing code; the column itself was just missing).
- **Added** INSERT policy for `settings` (Super Admin/Admin/IT Admin) — only a SELECT + UPDATE policy existed before, so the (rare) insert-a-fresh-row code path had no policy at all.
- Also fixed in code (not a DB change, see main changelog/conversation): `SettingsRepository.updateSettings()` was rewritten to only send columns that actually exist, and to use the service-role client server-side (same RLS-bypass pattern applied everywhere else this session) since real-session-based RLS can't be satisfied in demo mode.

---

## 2026-08-07 — `backfill_missing_management_cluster_workstations`

**Why:** `CL-F` and `CL-G` (the two management-reserved/VIP clusters — exactly what the previous session's "VIP cluster seat selection" feature targeted) had **zero workstation rows** in the database, for every day the app has existed. Root cause: `database/seeder.ts` wrote `status: 'MANAGEMENT_RESERVED'` for these clusters' 4 seats each, but `'MANAGEMENT_RESERVED'` was never a valid `workstation_status` enum value (the real values are `AVAILABLE, RESERVED, OCCUPIED, NO_SHOW, DISABLED, MAINTENANCE`) — so all 8 inserts failed silently on every seed run, and the seeder's `if (clusters.length === 0)` guard meant it never ran again once the other 5 clusters existed. The app appeared to work because the frontend's `generateDefaultWorkstations()` localStorage/client-side fallback synthesized placeholder CL-F/CL-G seats, masking the missing DB rows. Any real reservation attempt on those seats would have failed at `WorkstationRepository.resolveWorkstationId()` ("Poste introuvable dans Supabase").

- **Data**: inserted the missing 8 workstation rows (`CL-F-W1..W4`, `CL-G-W1..W4`) with `status: 'AVAILABLE'`, `reservable: false`, matching the shape the seeder now produces.
- Also fixed in code (not a DB change): [database/seeder.ts](../database/seeder.ts) and `WorkstationRepository.mapDomainStatusToDb()` in [database/repositories/workstationRepository.ts](../database/repositories/workstationRepository.ts) both wrote the invalid `'MANAGEMENT_RESERVED'` literal — changed to `'AVAILABLE'` (the `reservable: false` flag alone already round-trips correctly back to the domain `'management_reserved'` status via `mapDbStatusToDomain`).

---

## 2026-08-07 — `add_cluster_vip_members_and_extend_vip_roles`

**Why:** New feature — Super Admin/Admin/Director/Executive Assistant can now mark *any* cluster VIP (not just the seeded CL-F/CL-G), assign specific users to a VIP-locked cluster, and add extension seats up to 8/cluster. Needed schema support that didn't exist: a VIP-member allowlist table, and Director/EA weren't in the write policies for `clusters`/`workstations` at all (only Building/GCI Manager and Admin were).

- **Added table** `cluster_vip_members` (`cluster_id`, `user_id`, `assigned_by`, `assigned_at`, unique per cluster+user) — explicit per-user allowlist for a VIP-locked cluster. RLS: read = self or Super Admin/Admin/Director/EA/Building/GCI Manager; write = Super Admin/Admin/Director/EA only.
- **Edited** `clusters` UPDATE policy (`p_clusters_admin_write`): added `DIRECTOR`, `EXECUTIVE_ASSISTANT` alongside the existing Super Admin/Admin/Building/GCI Manager.
- **Edited** `workstations` INSERT policy (`p_workstations_admin_insert_delete`): added `DIRECTOR`, `EXECUTIVE_ASSISTANT` so they can add extension seats (DELETE stays Super Admin/Admin only).
- Also fixed in code (not a DB change): the new `WorkspaceService.addClusterVipMember()` initially inserted `req.user.id` as `assigned_by` unguarded — in demo mode that's a human-readable placeholder like `'usr-dir-1'`, not a real UUID, which fails the `uuid` FK type check outright. Now guarded with the same `isValidUuid()` fallback-to-null pattern already used in `AuditRepository.logEvent()`.

---

## No data was deleted in any of the above — only policies, one view's security mode, function search_path settings, one grant revocation, two new nullable/defaulted columns, 8 backfilled workstation rows, and one new table were added/edited.
