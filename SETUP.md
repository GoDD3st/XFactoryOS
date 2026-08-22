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

### Building a database from empty

Supabase's recorded history begins at a *correction* (`20260806160035`), not a schema creation.
Nothing in the recorded history issues a `CREATE TABLE`, defines the `has_role()` helper, or
declares the enum types - the first file assumes all of it exists.

`00000000000000_baseline_schema.sql` supplies the missing first step. It holds the schema as of
just before `20260806160035`, so the recorded migrations still replay meaningfully on top of it,
and every statement in it is guarded so re-running it against an existing database is a no-op.
`00000000000001_seed_roles.sql` then creates the ten `roles` rows, which are not optional: both
`handle_new_auth_user()` and the RBAC matrix migration are written against `roles.code`, and a
database missing them comes up serving every request on the route guards' hardcoded fallback
lists, with one `[RBAC]` warning as the only signal that the matrix never loaded.

Order for a fresh project: baseline, seed roles, the remaining migrations in filename order, then
`database/seeder.ts`.

The baseline has been executed, not merely reviewed - built in full against an empty schema and
rolled back - so the order above is known to work rather than assumed to.
`database/migrations/README.md` carries the detail, including the one ordering constraint inside
the file that is load-bearing.

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
- **`xlsx@0.18.5` carries two high-severity advisories** with no fix on npm. Kept deliberately -
  see the security notes below for why they are not reachable, and what it would cost to remove
  them.
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
| `CRON_SECRET` | required - see Background jobs | optional |

Both build from the same commit. The only difference is environment variables.

### If every route returns 500

That is a boot failure, not a route bug. The signature is a request that touches nothing -
`/api/branding`, `/api/health` - failing exactly like one that queries the database.
`api/index.ts` builds the app at module scope, so anything that throws there kills the function on
cold start and every path answers identically. The reason is in the Vercel function log; the two
that have actually happened:

**1. The backend was never bundled into the function.**

```
ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/backend/server'
  imported from /var/task/api/index.js
```

This package is `"type": "module"`, so Vercel transpiles the entry to ESM and runs it as ESM.
`api/index.ts` used to `import { createExpressApp } from '../backend/server'` - an extensionless
relative specifier, which Node's ESM resolver rejects, pointing at a path that did not exist in the
lambda anyway because nothing had compiled `backend/` to JavaScript. `tsc --noEmit` never
complained: tsconfig sets `moduleResolution: "bundler"`, which allows extensionless specifiers on
the assumption that a bundler resolves them, and no bundler was involved for this entry.

Fixed by bundling explicitly. `npm run build:server` (esbuild) resolves both the extensionless
imports and the `@/*` aliases used throughout `backend/`, emitting one self-contained
`server-dist/server.cjs`; `api/index.ts` imports that by its real extension. `vercel.json` runs it
as part of `buildCommand` and pins the output into the lambda with `functions.includeFiles`, rather
than trusting dependency tracing to follow an import into a file that did not exist when the source
was uploaded. If you change how the server is built, keep those three in step.

**2. `DEMO_MODE=true` on a deployment the guard reads as production.**

`assertDemoModeIsSafe()` refuses to start rather than serve an app whose authentication is
bypassable by an `X-Demo-Role` header. It used to treat `NODE_ENV === 'production'` as proof of
production, and Vercel sets that on *every* deployment, previews included - so the dev
configuration this document prescribes could not boot. It now reads `VERCEL_ENV` when present and
falls back to `NODE_ENV` only when it is absent. Production is still refused; a preview is not.

Since both fixes, a refusal answers `503 BOOT_FAILED` with a message and logs `[BOOT] ...`, instead
of a bare 500 with no body. A bare 500 across every route means you are on a build from before
this.

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
- **`xlsx@0.18.5` advisories are not reachable here, and the dependency is kept on purpose.**
  Both require *parsing* attacker-controlled input; this codebase only writes (`book_new` /
  `json_to_sheet` / `writeFile`) and never calls `XLSX.read`. There is no fix on npm, so removing
  the finding means either the SheetJS CDN build or rewriting the Excel export against a different
  library - and the export was rebuilt on this API in the same breath as this decision, so the
  swap would carry more regression risk than the vulnerability it retires. `npm audit` will keep
  reporting 1 high; that is expected, not an oversight. Revisit if the app ever gains a path that
  *reads* a spreadsheet - an upload, an import - because that is the day the advisories start to
  apply.
