# XFactory OS — Module 1: Smart Open Space Management

Reservation and occupancy management for the OCP Digital Factory Open Space, Site Safi.

This document is written for two readers at once. Sections 1–4 and 15 are readable without a
technical background and describe what the system does and why it exists. Everything else is
written for a developer who has to change the code safely.

> **A note on how to read this.** Where a decision could reasonably have gone another way, this
> document records **what** was decided, **why**, and **what follows from it**. Those are the parts
> worth reading before changing anything — the code tells you what it does, but not what breaks if
> you change it.

---

## 1. Project Overview

XFactory OS Module 1 manages the shared desks of a single Open Space: 28 workstations across 7
clusters of 4, with the schema built to extend to 40 desks and additional clusters.

It covers the whole life of a desk booking — finding a free desk, reserving it, being approved
where approval is required, arriving and checking in by scanning the QR badge on the desk,
checking out, and being marked absent if you never arrive — plus the governance around it: who may
book what, who approves long bookings, who can see the audit trail, and what the building's
occupancy actually looks like.

The governing specification is `Livrables/SRS_XFactory_OS_Module_1_Smart_Open_Space_Management.md`
(96 numbered requirements, FR-01…FR-96) and `Livrables/BPMN_OpenSpace_XFactoryOS_Mermaid_v1.html`
(8 process diagrams, D0–D7). Where this README cites `FR-xx`, `BR-xx` or `D5`, it refers to those
documents. **They are the contract; this codebase is one implementation of it.**

## 2. Business Context

The Open Space is shared. Before this system the failure modes were the ordinary ones:

- **Desks blocked but empty.** Someone reserves and never shows up; the desk stays unusable all
  day because nobody knows it is free. This is why check-in is mandatory and why no-show detection
  exists at all — see §10.
- **No reliable occupancy figure.** Management could not answer "how full is the Open Space" with
  anything better than a guess, which is what the telemetry layer (§15) is for.
- **Governance by convention.** Who may book the management cluster, who approves a week-long
  booking, who may read the audit log — all of it was informal. §9 makes it explicit and
  enforceable.

Understanding this matters when changing the code: nearly every constraint in the reservation
engine exists because of one of those three problems, not because of a technical requirement.

## 3. Objectives

1. Make a desk reservation take seconds and be impossible to fake.
2. Guarantee that a reserved desk is actually used, or released quickly to someone who wants it.
3. Give each role exactly the authority the SRS grants it — no more, and enforced by the server.
4. Produce occupancy data that is measured rather than asserted.
5. Leave an audit trail that the people it records cannot edit.

## 4. Main Features

| Feature | Summary |
|---|---|
| Two booking paths | Pick a desk on the Digital Twin floor plan, or fill the form and let it pick |
| Multi-day bookings | A date range; business days are counted and drive the approval requirement |
| Approval workflow | Long or multi-day bookings route to the Executive Assistant or the Director |
| QR check-in / check-out | Scan the badge on the desk, from the phone camera or in-app |
| Late check-in requests | A user who missed the window can ask for the reservation back |
| Waiting list | FIFO queue with preference matching; a freed desk is offered automatically |
| No-show release | Unclaimed desks are released and passed to the queue |
| Digital Twin | Live floor plan coloured by real availability for a chosen date and window |
| Dashboards | Occupancy, trends, departments, no-shows, and a statistical forecast |
| Administration | Users, roles and permissions, desks, clusters, settings, audit |
| Exports | CSV, Excel and a print-to-PDF report of the executive dashboard |

---

## 5. System Architecture

```
Browser (React + Vite SPA)
  │
  ├── Supabase Auth  ───────────────────►  Supabase (GoTrue)
  │     sign-in happens directly, browser → Supabase. The API is not involved.
  │
  └── fetch('/api/...')  + Bearer <supabase access token>
        │
        ▼
   Express API  (backend/)
        │  authenticateJWT      → verifies the token with Supabase, injects req.user
        │  requirePermission    → consults role_permissions; THIS is the authorization gate
        ▼
   Services  (services/)          business rules, role-agnostic
        ▼
   Repositories  (database/)      the only place that talks to Postgres
        ▼
   Supabase Postgres  + Row Level Security
```

### Decision: three tiers, with business rules in the middle

**What.** Route handlers do authentication, validation and shape; `services/` holds the business
rules; `database/repositories/` holds every query.

**Why.** The same rules have to run in two places — the Express API in production, and directly
in-process for the background sweeps. Rules living in route handlers could not be reused by a cron
job without an HTTP call to the app itself.

**Consequence.** A rule added to a route handler instead of a service silently does not apply to
the sweeps. When adding a constraint, add it to the service.

### Decision: the browser talks to Supabase for auth, and to the API for everything else

**What.** `signInWithPassword` runs in the browser against Supabase. Every data operation goes
through the Express API with the resulting token.

**Why.** Supabase Auth handles password hashing, session refresh and lockout properly, and
reimplementing that would be a liability. But data access needs the RBAC matrix, and that is
server-side — a browser holding an anon key can only be governed by RLS, which cannot express
"this role may read analytics".

**Consequence.** There are two identity checks: Supabase verifies who you are, the API decides
what you may do. A change to roles has no effect on sign-in, and a change to Supabase Auth
settings has no effect on permissions.

### Decision: the server bundle is compiled, not imported, for Vercel

**What.** `api/index.ts` imports `server-dist/server.cjs`, produced by `npm run build:server`
(esbuild). It does **not** import `backend/server.ts`.

**Why.** `package.json` sets `"type": "module"`, so Vercel compiles the entry to ESM. A
`../backend/server` specifier is extensionless — invalid in Node ESM — and `backend/` is
TypeScript that nothing had compiled. The bundle also inlines the `@/*` path aliases used
throughout `backend/`, which Node cannot resolve either.

**Consequence.** Changing an import in `backend/` requires a rebuild of the bundle to reach
production. `vercel.json` runs `build:server` in `buildCommand` and pins the output with
`functions.includeFiles`. **If you change how the server is built, those three must stay in step.**
This is documented in more detail under "If every route returns 500" in `SETUP.md`.

## 6. Technology Stack

| Layer | Choice | Version | Why this one |
|---|---|---|---|
| UI | React + TypeScript | 19.2 / 5.8 | — |
| Build | Vite | 6.2 | Dev server doubles as Express middleware, so one process serves both |
| Styling | Tailwind CSS | 4.1 | No separate stylesheet to drift from the markup |
| API | Express | 4.21 | Runs unchanged as a long-lived process *and* as a Vercel function |
| Database / Auth | Supabase (Postgres) | JS SDK 2.111 | See below |
| Validation | Zod | 4.4 | Same schema validates the request and types the handler |
| QR | `qrcode` + `html5-qrcode` | 1.5 / 2.3 | Generation server-side, scanning in-browser |
| Server bundle | esbuild | — | Produces the single self-contained file the lambda needs |

### Decision: Supabase rather than a self-managed Postgres

**What.** Supabase provides Postgres, authentication, row-level security and realtime.

**Why.** The project needed authentication, an audit-grade database and live updates, on an
internship timescale. Supabase supplies all three over standard Postgres, so the data layer stays
ordinary SQL — schema, constraints, RLS, triggers — with no proprietary query language to migrate
away from later.

**Consequence.** Two things follow. Supabase's `anon` key is public by design, so **anything
reachable with it must be safe for the whole internet** — this is why the RLS layer exists and why
grants are audited (§13). And the realtime channel means the UI can be event-driven rather than
polling; `database/realtime.ts` dispatches the `xfactory_*_changed` events the views listen to.

---

## 7. Project Structure

```
api/index.ts              Vercel entry point. Imports the compiled bundle, not the sources.
backend/
  server.ts               Express app factory + the in-process background tickers
  middleware/             authenticateJWT, requirePermission, rate limiters, validateBody
  routes/                 One router per domain. Authentication, validation, shape - not rules.
  validators/             Zod schemas, shared between routes and types
services/                 Business rules. No Express, no React - callable from both.
  reservations/           Creation guard chain, conflicts, alternatives
  checkinout/             Check-in, check-out, reminders, auto-checkout
  noshow/                 Absence detection and release
  waitinglist/            FIFO queue, preference matching, offers
  approval/               Long-duration approval decisions
  qr/                     Two token services - see §11
  rbac/                   Permission resolution and the navigation policy
  telemetry/              Occupancy, trends, department stats, forecast
database/
  client.ts               Browser (anon) Supabase client
  serverClient.ts         Service-role client. Server only.
  repositories/           Every query in the project lives here
  migrations/             Ordered schema history - see database/migrations/README.md
  rls/policies.sql        Row Level Security
frontend/src/
  modules/auth/           AuthGate, LoginScreen, session handling
  modules/dashboard/      One view per role home + the shared feature views
  shared/components/      Digital Twin, modals, tables
src/styles.css            Tailwind entry + device-agnostic base rules
```

**Why `services/` sits outside both `backend/` and `frontend/`:** it is imported by both. The
Express routes call it directly; the browser calls a thin wrapper in `services/api/`. Putting it
under `backend/` would have made the frontend import from a server directory.

## 8. Application Modules

| Module | Entry point | Responsibility |
|---|---|---|
| Reservations | `services/reservations/reservationService.ts` | The guard chain in §10 |
| Availability | `services/workspaces/seatAvailability.ts` | Turns reservations into per-seat busy/free intervals |
| Check-in/out | `services/checkinout/checkInOutService.ts` | Presence, reminders, auto check-out |
| No-show | `services/noshow/noShowService.ts` | Absence detection, release, cascade to the queue |
| Waiting list | `services/waitinglist/` | FIFO + preference matching (BPMN D5) |
| Approvals | `services/approval/approvalService.ts` | EA and Director decisions, re-clarification |
| RBAC | `services/rbac/` | Permission lookup, navigation policy |
| Telemetry | `services/telemetry/` | Every dashboard figure |
| QR | `services/qr/` | Reservation tokens and desk badge tokens |
| Audit | `services/audit/` | Append-only trail |

## 9. Roles & Permissions

Ten roles, from SRS §13: `collaborator`, `receptionist`, `building_manager`, `gci_manager`,
`executive_assistant`, `director`, `admin`, `super_admin`, `it_admin`, `security_guard`.

Authorization is enforced in **three layers, and only one of them is security**:

| Layer | Where | Is it security? |
|---|---|---|
| Navigation | `frontend/.../RoleShell.tsx` + `services/rbac/navigationPolicy.ts` | **No.** It hides links. |
| API guard | `requirePermission` in `backend/middleware/rbacMiddleware.ts` | **Yes.** This is the gate. |
| RLS | `database/rls/policies.sql` | **Yes.** Last defence if a query escapes the API. |

### Decision: the policy table decides, with the hardcoded list as a fallback

**What.** `requirePermission(code, action, fallbackRoles)` reads `role_permissions`. It uses
`fallbackRoles` **only** when the table cannot be read.

**Why.** An administrator must be able to grant a permission without a deployment. But a database
outage must not lock everyone out of an application that was working a second earlier.

**Consequence.** `PermissionService.can()` returns `null` for "unknown", distinct from `false` for
"denied" — and `null` falls through to the fallback list. **A fallback list wider than the policy
table silently re-grants access on the one path the policy cannot govern.** When you revoke a
permission, check the route's fallback list too.

### Decision: navigation follows the policy, but only as a delta

**What.** `resolveVisibleTabs` starts from the hardcoded per-role tab list and adds tabs whose
permission is granted, or removes tabs whose permission is revoked.

**Why.** The tab lists are *curated* — several roles deliberately lack a tab whose permission they
hold, because the screen is not theirs (IT Admin holds `analytics` but the executive dashboard is
a business surface). Rendering every permitted tab would discard that judgement.

**Consequence.** `CURATED_OUT_TABS` pins those exceptions off, and a pinned tab **cannot be turned
on from the RBAC screen**. That is a deliberate trade, documented beside each entry.

## 10. Reservation Lifecycle

```
                    ┌──────────────┐
   create ────────► │  en attente  │ ──approve──┐        (only if approval is required)
                    └──────────────┘            │
                           │ reject             ▼
                           ▼             ┌─────────────┐
                      ┌──────────┐       │  confirmée  │ ◄──── create (the common path)
                      │ rejetée  │       └─────────────┘
                      └──────────┘         │        │
                                 check-in  │        │ no check-in within noShowDelayMinutes
                                           ▼        ▼
                                    ┌───────────┐  ┌──────────┐
                                    │ check-in  │  │ no-show  │ ──► desk released, queue offered
                                    └───────────┘  └──────────┘
                                           │
                              check-out    │  auto check-out at slot end
                                           ▼
                                    ┌────────────┐
                                    │  terminée  │
                                    └────────────┘
      annulée: reachable from confirmée or en attente, by the owner or an administrator
```

**Statuses** (`ReservationStatus`): `en attente`, `confirmée`, `check-in`, `check-out`, `terminée`,
`annulée`, `rejetée`, `no-show`.

### The creation guard chain

`ReservationService.createReservation` applies these in order. **The order matters** — the cheap
and absolute checks come before the ones that hit the database.

1. **Workspace lockdown** — a closed date blocks everyone, *including bypass roles*. A physical
   closure is not an access-control rule; there is nothing to be privileged about.
2. **Weekend / holiday** — configurable, skipped for bypass roles.
3. **Conflict check** — `checkConflict` over the whole span. On conflict it returns
   `ReservationConflictError` carrying **alternative free desks in the same cluster**, so the UI can
   offer a way forward rather than only a refusal.
4. **BR-07 VIP/management lock** — a non-reservable desk requires a privileged role *or*
   membership in `cluster_vip_members`.
5. **Booking window** — `bookingWindowDays` minimum lead time.
6. **Quotas** — per day and per week, counted from the user's existing reservations.
7. **Approval routing** — see below.

### Decision: every rule above is enforced server-side, even though the UI checks them too

**What.** The browser runs `validateReservationConstraints` for live feedback, and the server
repeats the work.

**Why.** Client-side validation is a courtesy to the user, not a control. A direct `POST` bypasses
it entirely, and two users can pass the same client-side availability check simultaneously — the
data they validated against was already stale.

**Consequence.** The database is the authoritative source of availability. **Do not remove a
server-side check on the grounds that the UI already prevents it.** Several of the checks above
were added precisely because they existed only in the UI.

### Decision: two approver pools, not one

**What.** A booking longer than `maxReservationDaysWithoutApproval` hours routes to the
**Executive Assistant**; a *multi-day span* exceeding that many business days routes to the
**Director**, with `duration_days` recorded.

**Why.** SRS 8.6 and 8.7 describe different authorities. Previously both were hardcoded to the EA,
and the client separately created a second, duplicate `director` row for multi-day.

**Consequence.** Multi-day approval routing lives **entirely** in the service. Creating an approval
row from the client would reintroduce the duplicate.

### Check-in, check-out, absence

- **Check-in** requires status `confirmée` **and** `reservation.user_id === userId`. Any other
  status is refused — this is what stops a cancelled or already-used booking being revived.
- **Check-out** is available from `check-in`, and also happens automatically at slot end
  (`autoCheckOutExpired`).
- **No-show**: `detectNoShows` marks any `confirmée` reservation whose start is more than
  `noShowDelayMinutes` in the past, sets the desk back to `disponible`, and hands the freed slot to
  the waiting-list matcher. **The slot handed over is the whole booked slot**, because a no-show
  forfeits all of it — the matcher needs the exact hours so it does not offer them to someone who
  queued for a different part of the day.
- **Late check-in** (`late_check_in_requests`) lets a user who missed the window ask for the
  reservation back rather than rebooking.

### Waiting list (BPMN D5)

FIFO by `fifo_rank`, but filtered first: `preferenceMatching.ts` checks the requested **period**,
**zone** and **equipment** against the freed desk before making an offer. An offer expires after
`waiting_list_offer_expiry_minutes` and cascades to the next entry.

Three events free a desk into the queue: **no-show**, **check-out**, and **cancellation**. If you
add a fourth way for a desk to become free, it must call the matcher too.

**One live entry per user, per desk, per day** — enforced by
`waiting_list_entries_one_active_per_user_seat_day`. The index deliberately includes the date: an
earlier version did not, so queuing for a desk on Thursday blocked queuing for the same desk on
Friday.

## 11. QR Code System

There are **two** token services, and confusing them is the main hazard.

| | `qrTokenService.ts` | `seatQrTokenService.ts` |
|---|---|---|
| Identifies | one reservation | one desk |
| Payload | `reservationId`, `userId`, `exp`, `nonce` | `workstationId` |
| Expires | yes, 30-minute window | **no** |
| Reproducible | no (nonce) | **yes** — same desk, same token |
| Lives | in the app | printed and taped to the desk |

### Decision: the desk badge token is deterministic and never expires

**What.** `generateSeatToken` is an HMAC over the workstation id with no nonce and no expiry.

**Why.** The badge is printed and stays on the desk for months. A token with an expiry would need
reprinting; a token with a nonce could not be regenerated identically, so the system would have to
store it to be able to reprint.

**Consequence.** Nothing needs persisting, and reprinting is free. The trade is that the token is
**not a secret** — anyone who photographs the desk has it. That is acceptable *only* because the
token identifies the desk and nothing else; see the flow below.

### What happens when a badge is scanned

```
1. Phone camera reads the QR         → it encodes  <origin>/?scan=<seatToken>
2. Browser opens the site
3. AuthGate lifts ?scan= out of the URL, stores it, and strips it from the address bar
4. Not signed in?  → LoginScreen.  The scan is resumed after sign-in.
5. SeatScanScreen POSTs the token to /api/checkinout/scan-seat
6. Server verifies the HMAC                          → 401 QR_INVALID if forged or tampered
7. Server takes the USER FROM THE JWT - never the request body
8. getActiveReservationForUserAndSeat(userId, workstationId)
      no match → 404 NO_ACTIVE_RESERVATION
      status confirmée → check-in
      status check-in  → check-out
```

**Why this is safe despite the token being public.** The token proves only *which desk*. Identity
comes from the session, and the action only happens if a reservation matches **both** that user and
that desk right now. Scanning someone else's desk does nothing; scanning your own desk when you
have no booking does nothing.

**Two ways in, one endpoint.** The phone camera path above needs no app open. `SelfSeatScanModal`
does the same thing in-app for users who already have it open, and on desktops with no camera app
to leave to. `ReceptionSeatScanModal` is different: it decodes the desk *first* and then asks which
collaborator is being checked in — a question that only makes sense for a receptionist acting on
someone's behalf, which is why `/scan-seat/decode` is restricted to those roles.

## 12. Authentication & Security

**Authentication** — who you are:

1. The browser calls Supabase Auth directly (`signInWithPassword`). The API is not involved.
2. Every API call carries `Authorization: Bearer <supabase access token>`.
3. `authenticateJWT` verifies it with Supabase and injects `req.user` — id, email, role, name,
   department. **`req.user.role` is resolved server-side**; the client cannot claim a role.

**Authorization** — what you may do: §9.

Other controls, each with a reason:

- **`PUBLIC_ROUTES`** bypasses the JWT check for `/api/health`, `/api/auth/*` and `/api/cron`. It
  matches on the **full** path; matching on `req.path` fails silently because Express strips the
  mount prefix, which once made every cron sweep unreachable.
- **`CRON_SECRET`** authenticates the scheduler, which has no user session. Without it set, the
  sweep route refuses to run at all rather than being open.
- **Rate limiting** — a general limit plus a dedicated login limiter (10 attempts / 15 min).
  `trust proxy` is set to `1`, deliberately not `true`: trusting the whole `X-Forwarded-For` chain
  would let a client spoof its source address and evade the limiter.
- **Audit log** is service-role only. Browser writes go through `POST /api/audit`, which takes the
  actor from the JWT — otherwise anyone with the public anon key could forge entries attributed to
  someone else.
- **`DEMO_MODE`** bypasses authentication entirely via an `X-Demo-Role` header. Production refuses
  to boot with it on. The guard reads `VERCEL_ENV` when present and `NODE_ENV` only when it is not,
  because Vercel sets `NODE_ENV=production` on previews too.
- **Passwords are never displayed.** Recovery issues a CSPRNG temporary password shown once, with
  forced rotation.

## 13. Database Architecture

24 tables in `public`. `DB.md` carries the column-level reference; this section covers the parts
whose *reasoning* is not visible in the schema.

**Core:** `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `spaces`, `buildings`,
`floors`, `clusters`, `workstations`, `reservations`, `check_events`, `approval_requests`,
`waiting_list_entries`, `late_check_in_requests`, `cluster_authorizations`, `cluster_vip_members`,
`notifications`, `audit_logs`, `settings`, `ai_provider_config`, `ai_interactions`,
`digital_twin_objects`, plus the view `v_occupancy_current`.

### Decision: permissions are a matrix table, not a column on the role

**What.** `role_permissions(role_id, permission_id, can_read, can_create, can_update, can_delete,
can_approve)`.

**Why.** SRS §13 is a matrix of role × capability × verb. Anything less expressive would have
forced code changes to grant a permission.

**Consequence.** The Roles & Permissions screen writes to this table and the API obeys immediately.

### Decision: `has_role()` is `SECURITY DEFINER` and stays callable by `anon`

**What.** The helper every RLS policy calls to test the current user's roles.

**Why.** A caller who cannot read `user_roles` still has to be judged against it — that is the
whole point of the helper. **37 policies across 16 tables call it.**

**Consequence.** Revoking `EXECUTE` would not tighten anything; it would replace RLS with
"permission denied for function has_role" across the app. It returns only a boolean about the
caller's *own* roles (`ur.user_id = auth.uid()`), so it leaks nothing.

### Decision: the audit log is insert-only, service-role only

**What.** `p_audit_insert` was once `TO public WITH CHECK (true)`.

**Why.** That was provably forgeable: an unauthenticated client using the published anon key could
insert an `APPROVE` entry attributed to a named director.

**Consequence.** Browser code cannot write audit rows at all. Add new audit calls through
`POST /api/audit`.

### Other schema notes worth knowing

- **`v_occupancy_current`** is `security_invoker=true`, so RLS applies to the caller. A materialized
  view **cannot** carry RLS — which is why `mv_reservation_daily_stats` is granted to `service_role`
  alone. Do not grant it to `authenticated`; that bypasses the `analytics` permission.
- **`waiting_list_entries_one_active_per_user_seat_day`** indexes
  `((requested_start_at AT TIME ZONE 'UTC')::date)`. The `AT TIME ZONE` form is what makes it
  IMMUTABLE and therefore indexable; a bare `::date` cast is only STABLE and is rejected.
- **Migrations** start with `00000000000000_baseline_schema.sql` and
  `00000000000001_seed_roles.sql`. The ten `roles` rows are **not** optional seed data: an empty
  `roles` table makes the RBAC matrix migration insert nothing, and the app then runs on the
  fallback lists with a single boot warning. See `database/migrations/README.md`.

## 14. API / Server Logic

One router per domain under `backend/routes/`, all mounted under `/api`. Every route:

1. passes `authenticateJWT` (unless in `PUBLIC_ROUTES`),
2. declares its permission via `requirePermission(code, action, fallbackRoles)`,
3. validates its body with a Zod schema from `backend/validators/`,
4. delegates to a service — **handlers do not contain business rules**.

Endpoints worth knowing:

| Endpoint | Note |
|---|---|
| `GET /api/health` | Actually probes Postgres. Registered *before* the JWT middleware. |
| `GET /api/branding` | Unauthenticated, returns only site name and logo, for the login screen. |
| `POST /api/reservations` | The guard chain in §10. |
| `POST /api/checkinout/scan-seat` | The QR flow in §11. |
| `GET /api/roles/me/permissions` | The caller's **own** grants only. Enumerating everyone's stays behind `manage_roles`. |
| `GET /api/cron/sweep?job=…` | `CRON_SECRET`-authenticated. `job=all` runs every sweep. |
| `POST /api/audit` | The only write path to the audit log. |

## 15. Dashboards

Every figure comes from `/api/telemetry/*`, gated by the `analytics` permission.

### Decision: dashboard figures are computed server-side

**What.** The browser fetches finished numbers; it does not aggregate reservations itself.

**Why.** The client's reservation list is RLS-filtered. A Director computing occupancy in the
browser was deriving the whole building's figures **from their own bookings** — a plausible-looking
number that was simply wrong.

**Consequence.** Adding a KPI means adding it to `telemetryService`, not summing rows in a
component.

**Executive dashboard** (`dashboard-exec`, business roles): live occupancy rate, capacity, active
occupancy, available and reserved desks, peak window, no-shows today/this week, active users,
department split, per-cluster heatmap, reservation trends, and a next-day forecast.

**Trends** accept any window from 1 to 730 days. **At 365 days and above the series is aggregated
into months** (`services/telemetry/trendBuckets.ts`) — a year of days is 365 sub-pixel bars, which
is texture rather than a trend. The API always answers in days; only the chart re-buckets, and
summing is valid *because these are counts* — a rate or a percentage would need weighting.

**Forecast (D6)** is a same-weekday historical average over the last 8 weeks. It is genuinely
statistical, **not** machine learning, and reports its own sample size so a thin basis is visible.

**Role home views** (`SuperAdminView`, `AdminView`, `GCIView`, `DirectionView`, `ITAdminView`,
`SecurityView`, `BuildingView`, `ReceptionView`) each show that role's own scope. IT Admin's
platform health panel is the one place that reports probe results rather than reservations.

## 16. Administration

| Area | Who | Notes |
|---|---|---|
| Users | Admin, Super Admin | Create, activate/deactivate, bulk CSV import, password reset |
| Roles & permissions | Super Admin (Admin read-only) | Writes `role_permissions`; the API obeys at once |
| Desks | Admin, Super Admin (Building Manager operational) | Maintenance, visibility, extension seats |
| Clusters | Admin, Super Admin, GCI | Membership, VIP flag, management lock |
| Cluster authorisations | GCI Manager, Building Manager | BR-09 temporary access, auto re-locked |
| Settings | Admin, Super Admin | Booking rules, quotas, holidays, closures — password-confirmed |
| Audit | **Admin, Super Admin only** | Others need an explicit grant |
| Technical | IT Admin | Hardware diagnostics, port reset, platform health |

**Super Admin can never revoke its own way out of the Roles screen** — `requirePermission`
special-cases `manage_roles` for `super_admin`, and the navigation pins the tab visible. Without
that, one toggle would remove the only screen able to undo it.

## 17. Development Setup

```bash
npm install
cp .env.example .env     # then fill in the Supabase values
npm run dev              # http://localhost:3000
```

`npm run dev` starts `backend/server.ts` with `tsx`. It serves the API **and** mounts Vite as
middleware, so one process and one port serve both. The background tickers run in-process here, so
no scheduler is needed in development.

**The backend does not hot-reload.** Changes under `backend/`, `services/` or `database/` need a
restart. Several bugs in this project's history were a stale server.

| Command | Purpose |
|---|---|
| `npm run dev` | API + Vite dev server |
| `npm run lint` | `tsc --noEmit` — **the only automated check in the project** |
| `npm run build` | Frontend to `dist/` |
| `npm run build:server` | Server bundle to `server-dist/server.cjs` |
| `npm start` | Runs the built bundle |

## 18. Environment Variables

| Variable | Where | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | build + browser | Public by design |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Bypasses RLS. Never expose. |
| `DEMO_MODE` | server | `true` disables authentication. Never in production. |
| `VITE_DEMO_MODE` | **build time** | Compile-time constant — setting it at runtime does nothing |
| `CRON_SECRET` | server | You invent it. See §16 of `SETUP.md`. |
| `QR_HMAC_SECRET` | server | Signs both token families. **Rotating it invalidates every printed badge.** |

## 19. Deployment

Vercel. `dist/` is served statically; `/api/*` rewrites to the single function in `api/index.ts`.

**Before the first deploy:** set `VITE_DEMO_MODE=false` in the *build* environment, set
`CRON_SECRET`, and point the dev deployment at a **separate Supabase project** — the dev
configuration disables authentication, so aiming it at production data is an open admin back door.

**Background jobs do not run on Vercel by themselves.** The Hobby plan caps cron at one run per day
and rejects finer expressions at deploy time, so `vercel.json` declares none. Use an external
pinger against `/api/cron/sweep?job=all`, or GitHub Actions
(`.github/workflows/cron-sweep.yml`, schedule commented out until configured), or Vercel Pro. Full
comparison in `SETUP.md`.

## 20. Development Workflow

Two branches: **`dev`** for testing, **`main`** for production.

```bash
git fetch origin && git log --oneline origin/dev..dev   # what is unpushed
git add -A && git commit -m "..."
git push origin dev                                     # deploys to dev
# verify on the dev deployment - browser console AND the Vercel function log
git merge-base --is-ancestor origin/main dev && echo SAFE || echo STOP
git push origin dev:main                                # only if SAFE
```

The `merge-base` check confirms `main` is an ancestor of `dev`, i.e. the push is a fast-forward and
nothing on `main` is discarded. **A rejected push means the remote has commits you do not — merge,
never force.**

## 21. Troubleshooting

| Symptom | Likely cause |
|---|---|
| **Every** route returns 500 | Boot failure, not a route bug. See `SETUP.md` → "If every route returns 500". |
| `ERR_MODULE_NOT_FOUND: /var/task/backend/server` | The server bundle was not built or not included. §5. |
| `503 CRON_SECRET absent` on localhost | Expected. Development uses in-process tickers. |
| Sweeps return 401 | Wrong `CRON_SECRET`. `{"code":"AUTH_MISSING"}` is the JWT guard; `"Non autorisé."` is the route. |
| A permission was granted but the tab is missing | It is in `CURATED_OUT_TABS`. §9. |
| A backend change has no effect | The dev server did not restart. §17. |
| Empty RBAC matrix, `[RBAC]` boot warning | `roles` was never seeded. §13. |

## 22. Known Limitations & Technical Debt

Recorded honestly, because the cost of discovering these by accident is higher than the cost of
admitting them.

**Testing**
- **There are no automated tests.** `npm run lint` is `tsc --noEmit`. Every bug in this project's
  history was found by hand. This is the single largest risk to anyone modifying the code.
- `tsc` structurally cannot catch the failures that have actually occurred: `moduleResolution:
  "bundler"` permits extensionless specifiers that Node rejects at runtime.

**Security / operations**
- Rate limiting is **per instance**. On serverless, N instances means N × the quota. A true global
  limit needs Vercel WAF or a shared store.
- `xlsx@0.18.5` carries two high-severity advisories with no npm fix. **Not reachable here** — the
  code only writes, never parses — but `npm audit` will keep reporting it. Revisit if the app ever
  gains a path that *reads* a spreadsheet.
- Supabase Auth's leaked-password protection is **not enabled**.
- `QR_HMAC_SECRET` has a hardcoded development default. Set it explicitly in production.

**Correctness / edge cases**
- The Digital Twin's availability overlay is computed for the **start date** only. A multi-day
  booking is validated for every day on submit, but the pre-submit hint covers the first day.
- `trg_set_updated_at` exists on `public.floors`, which has **no `updated_at` column** — any
  `UPDATE` on a floor raises. Reproduced deliberately in the baseline rather than silently fixed;
  it deserves its own migration.
- Reservation dates are written as *floating local times* by the server's clock. Consistent today
  because the deployment runs UTC, but it is an assumption, not a guarantee.

**Unfinished against the SRS**
- `digital_twin_objects` exists and is empty. FR-39/41/42/43 (SVG floor plan, equipment, disabled
  zones, zoom/pan) are unimplemented; the Twin is a card grid using `workstations.svg_position`.
- FR-56 (saved filters) and FR-91 (per-cluster rules) are not implemented; settings are global.
- The D6 forecast is statistical, not ML — see §15.
- No AI provider has ever been exercised against a live vendor. Rejection paths are covered; the
  success path is not.

**Architectural compromises**
- `CURATED_OUT_TABS` pins some tabs off in a way the RBAC screen cannot override (§9).
- The main JS chunk is ~1.65 MB with no code splitting.
- `server-dist/` is committed. Deliberate — it guarantees the bundle is in the uploaded source
  regardless of build ordering — but a stale commit is possible if someone edits `backend/` and
  does not rebuild.

**Do not change without reading first**
- `requirePermission`'s `null`-means-unknown contract (§9).
- `has_role()`'s grants (§13).
- The order of the reservation guard chain (§10).
- `api/index.ts` + `build:server` + `vercel.json` as a set (§5).

## 23. Future Improvements

1. **Automated tests**, starting with the reservation guard chain, RBAC resolution and the QR flow.
2. **The Digital Twin as a real SVG floor plan**, closing the largest SRS gap.
3. **Navigation driven fully by policy**, retiring `CURATED_OUT_TABS`.
4. **A shared-store rate limiter** for a genuine global limit.
5. **Code splitting** for the main bundle.
6. **Replace or remove `xlsx`** if a spreadsheet-reading path is ever added.

## 24. Documentation & Maintenance

This documentation is only useful while it is true. When you change the system, change the docs in
the same commit:

| Change | Update |
|---|---|
| A new module or route | §7, §8, §14 |
| A business rule | The function's doc comment **and** §10 |
| The schema | A migration, `DB.md`, and §13 |
| An API contract | §14 and the route's own comment |
| A workflow | §10, §11 or §16 |
| An environment variable | §18 and `SETUP.md` |
| A permission or role | §9, and check the route's fallback list |

**The rule for code comments:** explain *why*, not *what*. `setLoading(true)` needs no comment. A
check that exists because a client-side guard was bypassable needs one — and if you delete that
check, the comment is how the next developer knows what they lost.

**Related documents:** `SETUP.md` (environment, deployment, troubleshooting), `DB.md` (column
reference), `database/migrations/README.md` (bootstrap order), `Livrables/` (SRS and BPMN).
