# Walkthrough — Supabase Integration Fixes

## Problems Fixed

### 1. Settings 406 Error (PGRST116)
**Root cause**: The `settings` table had RLS enabled but **zero policies**, so any query via the anon key was blocked with a `406 Not Acceptable` (PostgREST error PGRST116).

Additionally, the frontend was using `.single()` which throws PGRST116 when the result count ≠ 1.

**Fixes applied**:
- **Database**: Added `p_settings_read` RLS policy (`FOR SELECT USING (true)`) so everyone can read settings
- **Database**: Added `p_settings_admin_write` RLS policy (`FOR UPDATE`) restricted to `SUPER_ADMIN`, `ADMIN`, `IT_ADMIN`
- **Frontend**: Created [`settings.ts`](file:///c:/Users/marou/Desktop/Projects/ocp-dash-forge/frontend/src/services/api/settings.ts) API service using `.maybeSingle()` instead of `.single()`
- **Frontend**: Updated [`SettingsPanel.tsx`](file:///c:/Users/marou/Desktop/Projects/ocp-dash-forge/frontend/src/shared/components/SettingsPanel.tsx) to self-load settings from the API when no props are passed (every dashboard renders `<SettingsPanel />` without props)

---

### 2. Users All Showing as "Collaborateur"
**Root cause**: The `users` table has **no `role` column**. Roles are stored in a normalized join structure:
- `users` → `user_roles` (user_id, role_id) → `roles` (id, code, name)

The frontend was querying `supabase.from('users').select('*')` and mapping `u.role` → always `undefined` → fallback to `"Collaborateur"`.

**Fixes applied** in [`users.ts`](file:///c:/Users/marou/Desktop/Projects/ocp-dash-forge/frontend/src/services/api/users.ts):
- `fetchUsers()` now uses `select('*, user_roles(role_id, roles(code, name))')` and maps `u.user_roles?.[0]?.roles?.name`
- `createUser()` now inserts into `users` (without `role`), then inserts into `user_roles` with the correct `role_id`
- `updateUserRole()` now deletes from `user_roles` and inserts the new role assignment
- Added `ROLE_NAME_TO_CODE` mapping to translate display names (e.g., "Building Manager") to DB codes (e.g., "BUILDING_MANAGER")

---

### 3. Missing RLS Policies
**Database policies added**:
| Table | Policy | Action | Condition |
|-------|--------|--------|-----------|
| `settings` | `p_settings_read` | SELECT | Everyone |
| `settings` | `p_settings_admin_write` | UPDATE | SUPER_ADMIN, ADMIN, IT_ADMIN |
| `audit_logs` | `p_audit_insert` | INSERT | Everyone |
| `user_roles` | `p_user_roles_admin_manage` | ALL | SUPER_ADMIN, ADMIN |
| `reservations` | `p_reservations_delete` | DELETE | SUPER_ADMIN, ADMIN, BUILDING_MANAGER |

---

### 4. TypeScript Compilation Fixes
- Added `variant?: string` prop to [`ExecutiveKpis.tsx`](file:///c:/Users/marou/Desktop/Projects/ocp-dash-forge/frontend/src/shared/components/ExecutiveKpis.tsx)
- Added `useEffect` to React imports in [`EndUserDashboard.tsx`](file:///c:/Users/marou/Desktop/Projects/ocp-dash-forge/frontend/src/modules/dashboard/components/EndUserDashboard.tsx)
- Fixed stale import path in [`AuthContext.tsx`](file:///c:/Users/marou/Desktop/Projects/ocp-dash-forge/frontend/src/modules/auth/context/AuthContext.tsx): `@/components/xfactory/shared/roles` → `@frontend/shared/components/roles`

## Verification
- **TypeScript**: `npx tsc --noEmit` passes with **zero errors** ✅
- **Git**: All changes committed to `main` branch ✅
