# XFactory OS - Module 1, Smart Open Space Management

Developer setup for the Safi site deployment. Read this before running anything.

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 LTS or newer | Developed on 24.x. Node 19+ is a hard floor: the temporary-password generator uses the Web Crypto API on `globalThis`. |
| npm | 10+ | Ships with Node. |
| Git | any recent | |
| A Supabase project | - | Postgres + Auth. The hosted project already exists; you only need your own for an isolated environment. |

There is **no test runner** in this project. `npm run lint` is `tsc --noEmit` and is the only automated gate.

---

## 2. Environment variables

Create `.env` in the repository root. It is gitignored (`.env*`) and must never be committed.

```bash
# Supabase - Project Settings > API
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable / anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key - SERVER ONLY, never expose>

# Encrypts the customer's AI provider credential at rest (AES-256-GCM).
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
AI_CREDENTIAL_SECRET=<64 hex characters>

# Authentication mode. See the warning below.
DEMO_MODE=false
VITE_DEMO_MODE=false
```

### DEMO_MODE - read this before you set it

With `DEMO_MODE=true`, `backend/middleware/authMiddleware.ts` trusts an `X-Demo-Role` request
header and performs **no credential check at all**. Anyone can send `X-Demo-Role: super_admin`
and obtain full administrative access.

It exists so the app can be demonstrated without accounts. It must be `false` in any environment
reachable by anyone else.

`VITE_DEMO_MODE` is a **compile-time** constant: Vite inlines it into the JavaScript bundle at
build time. Setting it in a runtime environment does nothing. It must be `false` **when the
build runs**.

### Rotating AI_CREDENTIAL_SECRET

Rotating it makes every stored AI credential undecryptable. The Super Admin must re-enter and
re-activate the provider key afterwards.

---

## 3. Install and run

```bash
npm install
npm run dev          # tsx backend/server.ts - Express + Vite middleware on :3000
```

`npm run dev` serves the API and the frontend from one process on port 3000.

**The backend does not hot-reload.** Vite handles the frontend, but any change under `backend/`,
`services/` or `database/` needs the process restarted.

| Script | Does |
|---|---|
| `npm run dev` | Dev server, API + frontend, port 3000 |
| `npm run lint` | `tsc --noEmit` - the only automated check |
| `npm run build` | `vite build` then esbuild-bundles the server to `dist/server.cjs` |
| `npm start` | Runs the built server (self-hosted path, not Vercel) |

---

## 4. Database and migrations

`database/migrations/` mirrors Supabase's applied history one-for-one; the filename version equals
the value in `supabase_migrations.schema_migrations`. Read `database/migrations/README.md` before
touching it. Two rules matter most:

- **Never edit an applied migration.** Corrections go in a new file.
- **Route guard fallback lists must mirror the granted cells** in `role_permissions`. A role
  dropped in SQL but left in a route's `fallbackRoles` regains the permission the moment the
  policy table cannot be read.

### The sequence does not build a database from empty

Supabase's recorded history begins at a *correction* (`20260806160035`), not a schema creation.
Nothing in the directory issues a `CREATE TABLE`, defines the `has_role()` helper, or declares the
enum types - the first file assumes all of it exists. Standing up a fresh environment still
requires cloning the schema out of the hosted project first. Closing this needs a baseline file
ordered ahead of `20260806160035`.

---

## 5. Test accounts

Ten accounts, one per role, all `Test@1234`:

```
employee.test@ocpgroup.ma        collaborator
reception.test@ocpgroup.ma       receptionist
buildingmanager.test@ocpgroup.ma building_manager
gcimanager.test@ocpgroup.ma      gci_manager
ea.test@ocpgroup.ma              executive_assistant
director.test@ocpgroup.ma        director
admin.test@ocpgroup.ma           admin
superadmin.test@ocpgroup.ma      super_admin
itadmin.test@ocpgroup.ma         it_admin
security.test@ocpgroup.ma        security_guard
```

Forgotten password: only a **Super Admin** can recover an account, and recovery means
**replacement**, not disclosure. Supabase stores a bcrypt hash, so no existing password can ever
be displayed. Users Admin > select user > generate a temporary password; it is shown once, and the
account is flagged for forced rotation at next sign-in.

---

## 6. Architecture

```
src/                 React entry (main.tsx, App.tsx)
frontend/src/        Components, views, auth context, shared types
backend/             Express routers, auth + RBAC middleware, Zod validators
services/            Business logic (reservations, waiting list, approvals, AI, telemetry)
database/            Supabase clients, repositories, migrations, seeder
api/index.ts         Vercel serverless entry - exports the Express app
Livrables/           SRS, BPMN diagrams, conformance reports
```

Data access goes **route -> service -> repository -> Supabase**. Two rules that cause real bugs
when ignored:

1. **Repository methods must default to `resolveClient()`, not the module-level `supabase`.**
   The anon client has no session server-side, so RLS filters reads to zero rows *without raising
   an error*. This silently disabled the no-show sweep, the auto check-out sweep, every telemetry
   aggregate and the AI assistant's context until it was fixed.
2. **Name the constraint on any PostgREST embed where two foreign keys point at the same table.**
   `reservations` (`user_id` / `cancelled_by`), `waiting_list_entries` (requested / offered
   workstation) and `user_roles` (`user_id` / `granted_by`) have all hit this. A bare
   `users!inner(...)` is ambiguous and PostgREST rejects the whole query.

RBAC resolves through `role_permissions` via `PermissionService`. `can()` returns `null`, not
`false`, when the policy table is unreadable, so routes fall back to their hardcoded role lists.

---

## 7. Known gaps

- **Background jobs are `setInterval` timers inside `startServer()`.** They do not run on
  serverless. See the deployment notes.
- **`digital_twin_objects` is specified but unimplemented.** SRS section 20 requires SVG objects to
  be mapped through it; the Twin currently hardcodes `workstations.svg_position`.
- **Rate limiting is an in-process `Map`** (`backend/middleware/rateLimiter.ts`). Per-instance, so
  it is ineffective on serverless.
- **`RoleShell.tsx` imports `database/repositories/settingsRepository`**, pulling server-side data
  access into the browser bundle.
- **The waiting-list unique index ignores the date**, so a user cannot queue for the same desk on
  two different days.
- **`xlsx@0.18.5` carries two high-severity advisories** with no fix on npm. Used only for
  dashboard exports.
- **The Digital Twin under-reports occupancy** for Director, Executive Assistant, IT Admin and
  Security Guard: its client-side path is RLS-filtered and those roles are outside
  `p_reservations_owner_read`.

---

## 8. Conventions

- UI copy is **French**; code, comments and commits are English.
- Every free-text field goes through `sanitizedString` / `sanitizedOptionalString`
  (`backend/utils/sanitize.ts`) before persistence.
- All request bodies are Zod-validated with `.strict()` to reject injected fields.
- Actor identity always comes from `req.user` (the JWT), never from the request body.

---

## 9. Two environments: production and dev

Use **one repository and two Vercel projects**, not two repos or two long-lived branches. Forked
copies diverge within weeks and every security fix then has to be applied twice - which is how a
demo-mode bypass survives in the copy nobody remembered to patch.

| | Production | Dev / testing |
|---|---|---|
| Vercel project | `xfactoryos` | `xfactoryos-dev` |
| Git branch | `main` | any feature branch |
| `DEMO_MODE` | `false` | `true` |
| `VITE_DEMO_MODE` | `false` | `true` |
| Supabase project | production ref | a separate ref - never the same database |
| `CRON_SECRET` | set | optional |

Both build from the same commit. The only difference is environment variables.

### Why production cannot accidentally become a demo

`assertDemoModeIsSafe()` runs in `createExpressApp()`, so it fires on the serverless path too, not
just on `startServer()` (which Vercel never calls). If `DEMO_MODE=true` while `VERCEL_ENV` or
`NODE_ENV` is `production`, the app **throws on boot** rather than serving an open admin API. A
deploy that is misconfigured fails visibly instead of quietly exposing everything.

In dev mode it still boots, but prints a loud banner on every start.

### What is actually stripped from the production bundle

`VITE_DEMO_MODE` is a Vite compile-time constant, so `isDemoMode()` folds to `false` and the
guarded branches are dead-code eliminated. Measured on a `VITE_DEMO_MODE=false` build:

- `X-Demo-Role` header injection: **absent** (0 occurrences)
- the demo user table and `switchRole` binding: **still present**

Those remnants are inert - `switchRole` refuses outside demo mode, and the table holds fictitious
names and emails, no credentials - but they are not *gone*. Removing them entirely means
restructuring `AuthContext` so it never references demo state when the flag is false. The
server-side bypass, which is the part that actually matters, is impossible in production
regardless.

### Never share a database between the two

Dev has authentication disabled. Pointing it at the production Supabase project would hand anyone
who finds the dev URL full admin access to real data through `X-Demo-Role`. Use a separate
Supabase project and apply `database/migrations/` to it.

---

## 10. Security posture

Verified against the live project on 2026-08-18 with the anon key that ships in the browser bundle.
All blocked: writing `audit_logs`, reading `audit_logs`, reading `users`, reading `reservations`,
reading `ai_provider_config`, self-granting a role, writing `settings`.

- **Audit writes are server-side only.** `audit_logs` had `INSERT` open to `public`, so any visitor
  could forge entries attributed to any person. Fixed in migration `20260818084619`. Browser code
  uses `POST /api/audit`, which takes the actor from the verified JWT.
- **No repository is imported by frontend code.** The server-side data layer does not ship to the
  browser. Anything sensitive goes through an authenticated API where identity comes from the JWT,
  never the request body.
- **SQL injection is not reachable.** All access is through PostgREST's parameterised client. No
  raw SQL, no `.rpc()`, no user input in filter strings; keyword search filters in memory.
- **`trust proxy` is set to 1.** Without it `req.ip` was the proxy address behind Vercel, so every
  caller shared one rate-limit bucket - one busy client could 429 everyone else, and no per-source
  limit existed. Deliberately `1`, not `true`, so clients cannot spoof `X-Forwarded-For`.
- **Sign-in has its own limiter** (10 attempts / 15 min). The general 60/min limit was 60 password
  guesses a minute.
- **Rate limiting is per-instance.** In-process counters bound abuse per serverless instance, not
  globally. For a true global limit use Vercel WAF or a shared store.
- **`xlsx@0.18.5` advisories are not reachable here.** Both require *parsing* attacker-controlled
  input; this codebase only writes (`book_new` / `json_to_sheet` / `writeFile`) and never calls
  `XLSX.read`. It will still fail `npm audit`, which has no fix on npm - upgrading means the
  SheetJS CDN build or a different library.
