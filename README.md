# XFactory OS

**XFactory OS is the digital operating system for the XFactory building** - OCP SA's innovation
and collaboration centre on Site Safi. The long-term target is a *Smart Building OS*: one platform
that runs spaces, flows, reservations, services, visitors, equipment, access control, incidents,
usage performance and the user experience around all of it, for a population sized at 10 000+ users.

This repository is the **first brick** of that platform: Module 1, Smart Open Space Management.
This section describes the platform it belongs to, so that
a reader knows what exists, what is merely prepared, and what is deliberately absent.

## The six functional domains

XFactory OS is organised into six business domains. Module 1 activates parts of four of
them and leaves the other two as extension points in the schema.

| Domain                    | Covers                                                       | State in this codebase                                                  |
|---------------------------|--------------------------------------------------------------|-------------------------------------------------------------------------|
| **Dashboard**             | Executive view of the building                               | **Active** — Open Space executive dashboard only                        |
| **Spaces & Reservations** | Every bookable space: desks, meeting rooms, executive spaces | **Active for desks.** Meeting rooms and the Bijou are future modules    |
| **Visitors**              | Visitors, visits, access requests, badges                    | **Not active.** Data model prepared (`visitor` extensibility on users)  |
| **Services & Support**    | Equipment, facility management, building services            | **Minimal.** Equipment referenced, no service workflow                  |
| **Analytics**             | Usage analytics across the whole building                    | **Active for Open Space occupancy**                                     |
| **Administration**        | Users, roles, permissions, settings, audit                   | **Active and complete**                                                 |

```
XFactory OS
├── Dashboard ----------- Executive Dashboard              [v1]
├── Spaces & Reservations
│   └── Smart Open Space Management                        [v1 — this repository]
│       ├── Digital Twin SVG · Reservations · Calendar
│       └── Check-in/out · No-show · Waiting list
│   └── Meeting rooms · Executive spaces                   [future]
├── Visitors ------------ Visitors, visits, access         [prepared, inactive]
├── Services & Support -- Equipment, FM, maintenance       [prepared, minimal]
├── Analytics ----------- Occupancy KPIs                   [v1] · building-wide [future]
└── Administration ------ RBAC · Users · Settings · Audit  [v1]
```

## Modules that exist today

Module 1 is not one feature; it is nineteen specified functional modules plus the AI Assistant.
Each maps to a service in `services/`.

| # | Module                           | What it does |
|---|----------------------------------|---|
| 1 | **Authentication**               | Email/password sign-in via Supabase Auth, session expiry, sign-in logging; SSO prepared, not built |
| 2 | **Role Management**              | Ten roles, permissions granted per module as a matrix (`role_permissions`), CRUD and approval rights, every change audited |
| 3 | **User Management**              | Accounts, departments, active/inactive status, bulk CSV import, Super-Admin password recovery by replacement |
| 4 | **Workstation Management**       | The desk referential, 28 desks today, schema to 40: codes, SVG position, statuses (available, reserved, occupied, disabled, maintenance), per-desk history |
| 5 | **Cluster Management**           | 7 clusters of 4, extensible. Two management/VIP clusters locked by default, opened only by temporary GCI or Building Manager authorisation |
| 6 | **Reservation Management**       | Half-day, full-day and multi-day bookings; FIFO on contention; conflict prevention; approval above the configured duration; cancellation before start |
| 7 | **Reservation Calendar**         | Day, week and month views, cluster filters, visually distinguishing reserved / occupied / no-show |
| 8 | **Interactive SVG Digital Twin** | The floor plan as the primary interface — zoom, pan, hover, click to book, coloured by live availability for the chosen date and window |
| 9 | **Real-time Occupancy** | The measured state of the room, not the booked state: who actually checked in, right now |
| 10 | **Search & advanced filters** | Find a desk or a reservation by cluster, date, window, department, status |
| 11 | **Check-in** | Mandatory presence confirmation by scanning the QR badge on the desk, within a time window |
| 12 | **Check-out** | Release at the end, or early — including the walk-in and desk-move paths |
| 13 | **No-show** | Automatic detection and release of desks never claimed, cascading to the waiting list |
| 14 | **Waiting List** | FIFO queue with preference matching; a freed desk is offered automatically to the head of the queue |
| 15 | **Reservation History** | Per-user and per-desk usage history |
| 16 | **Notifications & emails** | Reminders, approval requests and decisions, waiting-list offers, no-show notices |
| 17 | **Dashboards & reports** | Occupancy, trends, departments, no-show rates, forecasting; CSV, Excel and print-to-PDF exports |
| 18 | **Administration & settings** | Booking rules, quotas, holidays, closures, business hours, branding — password-confirmed |
| 19 | **Audit Logs** | Append-only trail of sensitive actions, readable by Admin and Super Admin only, unforgeable by the people it records |
| — | **XFactory AI Assistant** | Not a generic chatbot: occupancy prediction, anomaly detection, usage analysis, natural-language questions, report generation, cluster-optimisation advice. Answers only from data the asking role is permitted to see. Built; no provider has been exercised against a live vendor |

## Modules that do not exist yet

Deliberately out of Module 1, but the architecture is expected to accommodate them without a
rewrite. They are listed here because several schema choices only make sense in their light.

| Future module | What the current schema owes it |
|---|---|
| Meeting-room reservation | A generic `space` model rather than a desk-only one |
| The Bijou (executive space) | Same generic space model, with its own approval policy |
| Visitor management | `visitor`, `visit`, `access_request` models; users already carry a visitor path |
| Building equipment | An extensible `equipment` model |
| Facility Management | `service_request`, `maintenance_ticket` |
| Access control — CDVI Centaur | API contracts and an event stream |
| Hager / building automation | Building-service connectors |
| Reservation screens, IoT | The API-first rule: every feature callable over HTTP |
| Native mobile app | PWA-ready and a mobile-ready API; no native client planned |
| Building-wide analytics | Telemetry aggregated above the Open Space |

Explicitly **never** in scope: financial or cost management, and payroll / HR / full corporate
directory. User import is the only intended overlap with HR systems.

## Guiding principles

These explain most of the design decisions recorded later in this document.

- **Digital Twin first** — the plan is the interface, not a table of desk names.
- **API first** — every feature exposable over HTTP, so mobile, screens and IoT can arrive later.
- **RBAC strict** — a role sees exactly what it is granted, enforced by the server (§9).
- **Audit by design** — every sensitive action is recorded and cannot be edited by its author.
- **Modularity** — Module 1 must not make the other five domains harder to add.
- **Data driven** — occupancy is measured, never asserted (§15).
- **AI assisted** — the assistant recommends and detects; it does not decide.

---

# Module 1: Smart Open Space Management

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

| Feature                 |    Summary                                                                    |
|-------------------------|-------------------------------------------------------------------------------|
| Two booking paths       | Pick a desk on the Digital Twin floor plan, or fill the form and let it pick  |
| Multi-day bookings      | A date range; business days are counted and drive the approval requirement    |
| Approval workflow       | Long or multi-day bookings route to the Executive Assistant or the Director   |
| QR check-in / check-out | Scan the badge on the desk, from the phone camera or in-app                   |
| Late check-in requests  | A user who missed the window can ask for the reservation back                 |
| Waiting list            | FIFO queue with preference matching; a freed desk is offered automatically    |
| No-show release         | Unclaimed desks are released and passed to the queue                          |
| Digital Twin            | Live floor plan coloured by real availability for a chosen date and window    |
| Dashboards              | Occupancy, trends, departments, no-shows, and a statistical forecast          |
| Administration          | Users, roles and permissions, desks, clusters, settings, audit                |
| Exports                 | CSV, Excel and a print-to-PDF report of the executive dashboard               |

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
5. **Booking window** — `bookingWindowDays` minimum lead time. One exception, and it cannot be
   requested from outside: a **walk-in** (see below) booked by scanning the desk's badge while
   standing at it. The flag is set by `WalkInService` on the server; `POST /api/reservations`
   has no field for it.
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

**Check-in** (`CONFIRMED → OCCUPIED`) is always an explicit act. Scanning a desk badge never
performs it; it only shows the user what they hold. The button then calls `/api/checkinout/check-in`,
which re-validates everything from the database at that instant — identity from the JWT, ownership
of the reservation, status still `confirmée`, and the check-in window. Nothing the scan established
earlier is carried forward as proof, because between a scan and a button press a reservation can be
cancelled, checked in from another device, or expire into a no-show.

The **check-in window** opens 15 minutes before the slot and closes at
`start + noShowDelayMinutes` — the same instant the no-show sweep uses, so the two can never
disagree. Arriving later is not a dead end: `late_check_in_requests` is the reviewed way back in.

The recorded check-in time returned to the interface is the timestamp the **database** stored. The
browser clock is never used to display it.

**Check-out** (`OCCUPIED → COMPLETED`) is available from two places — the reservation list on the
dashboard, and the QR flow, where it is a second explicit button. A scan alone never checks anybody
out. The real departure time is recorded in `check_out_at`.

**Automatic completion.** A reservation that is never checked out is completed by
`autoCheckOutExpired` once its end time has passed, and the desk returns to the ordinary pool.
There is deliberately no physical-presence enforcement and no "awaiting verification" state: a
booking ending at 09:00 ends at 09:00 in the system, and if nobody has the desk until 10:00 the
previous occupant may well still be sitting there. Reception and the building manager receive an
informational notice; it never blocks the workstation.

**No-show**: `detectNoShows` marks any `confirmée` reservation whose start is more than
`noShowDelayMinutes` in the past, sets the desk back to `disponible`, and hands the freed slot to
the waiting-list matcher. **The slot handed over is the whole booked slot**, because a no-show
forfeits all of it — the matcher needs the exact hours so it does not offer them to someone who
queued for a different part of the day.

### Early check-out does NOT open the freed hours to the site

This is the rule most likely to be re-broken by someone trying to be helpful, so it is stated
plainly:

> When a user checks out early, the unused remainder of their reservation does **not** become an
> immediately bookable slot. It is not published as availability, it is not offered to the waiting
> list, it gets no status or colour of its own, and it does **not** exempt anybody from the normal
> reservation lead time (`settings.bookingWindowDays`, the "48h" rule).

Ahmed books WS-A 08:00–12:00 and leaves at 10:30. The reservation becomes `COMPLETED` with
`check_out_at = 10:30`. The 10:30–12:00 stretch is now ordinary unbooked time: anybody wanting it
must satisfy the same rules as for any other free desk, which inside the lead time means they
cannot have it — **including by walk-in**: while the next holder's extension offer stands, those
hours are refused to everyone else, badge in hand or not. The desk stays empty until that holder
accepts or their own reservation begins.

Exactly one person may take those hours, and only in one specific way:

> **The holder of the next reservation on that same desk may be offered an earlier start for the
> reservation they already hold.**

If Sara holds WS-A 12:00–16:00, she is offered `10:30 → 16:00`. She is *not* being given a new
reservation — her existing one moves — which is why the workflow modifies a row rather than passing
through `createReservation`, and therefore never touches the lead-time rule at all.

How the offer is decided (`services/reservations/earlyExtensionService.ts`):

| Question | Rule |
|---|---|
| Who is eligible? | The holder of the reservation immediately after the freed period **on the same desk**. Nothing may sit between the two. |
| When is there an offer? | Only when the previous booking is `COMPLETED` **and** `check_out_at` is earlier than its booked end. An ordinary completion, an automatic sweep, a cancellation and a no-show all release nothing here. |
| How far back? | To the check-out time, clamped to now — hours that have already passed are never offered, or the holder's check-in deadline would move into the past. |
| Automatic? | Never. The offer is shown on the dashboard and applied only when the holder presses **Prolonger la réservation**. |
| What does the server check on accept? | Ownership from the JWT, that the offer still exists when recomputed from the database, that the requested start sits inside it, that the holder has no other reservation over those hours, and that the desk is still free. The GiST exclusion constraint on `(workstation_id, period)` is the final backstop against two requests racing for the same gap. |

The offer never names the person who left. It carries hours only.

### Réservation sur place (walk-in)

Somebody standing at an **empty** desk may take it there and then by scanning its badge. The site
answers with how long the desk is free:

```
start = now
end   = the next reservation's start on that desk, or close of business, whichever is first
```

and the user confirms, optionally finishing earlier than the window allows. This is the **only**
exception to the reservation lead time, and it is narrow by construction rather than by promise:

- it needs a valid desk badge, which is only obtainable by being at the desk. The exemption is
  granted by the server on that path alone (`WalkInService.book` → `createReservation({walkIn})`),
  and `POST /api/reservations` has no way to ask for it;
- it can only produce a booking that starts **now**, **today**, on the **scanned desk**. Not
  tomorrow, not elsewhere, not a future window;
- it ends where the next booking begins, so it never eats into a reservation somebody holds.

Everything else still applies: conflicts, quotas, business hours, one-desk-at-a-time, and BR-07 —
management-locked desks are excluded outright, since a scan proves presence, not entitlement.

The rationale: the lead time governs **planning**. Taking a chair that is empty right now plans
nothing, so applying a two-day notice to it would leave desks empty for no gain.

### Déplacer une réservation vers un autre poste

Operational correction — a desk breaks, a cluster is re-purposed, two people need to sit together.
`POST /api/reservations/:id/transfer` moves a booking to another desk **without cancelling and
rebooking**, which would lose its history, its check-in, its approval and its place in the day.

- **Who**: Building Manager, Administrator, Super Administrator, Director, Executive Assistant.
  Reception is deliberately absent — it checks people in and out; who sits where is an allocation
  decision.
- **What changes**: the desk, and nothing else. The window, the holder and the status are read from
  the stored row, so a transfer can never become a re-booking.
- **What the server re-verifies**: the reservation is still live; the destination exists, differs,
  and is not out of service; it is free for exactly that window; and — for a management-locked
  destination — that the **holder** is entitled to sit there. Moving somebody onto a VIP desk they
  could not have booked themselves would launder BR-07 through an operator's permissions.
- **Side effects**: an occupied desk carries its occupancy across (the old desk is released, the new
  one marked occupied), the holder is notified that their desk changed, and the audit trail records
  the staff member as the author of the move.
- **Races**: the GiST exclusion constraint on `(workstation_id, period)` is the backstop — a `23P01`
  surfaces as "ce poste vient d'être réservé", not a 500.

### Waiting list (BPMN D5)

FIFO by `fifo_rank`, but filtered first: `preferenceMatching.ts` checks the requested **period**,
**zone** and **equipment** against the freed desk before making an offer. An offer expires after
`waiting_list_offer_expiry_minutes` and cascades to the next entry.

Priority is **FIFO** — first in, first out — among the entries that match.

Three events hand a desk to the queue: **no-show**, **cancellation**, and the **automatic
completion** at a reservation's end time. An **early check-out is deliberately not one of them**:
its remainder is not redistributed to anybody (see "Early check-out does NOT open the freed hours
to the site" above), and the cascade that used to run on it has been removed. The automatic
completion is different and legitimate — the hours it offers are *after* the booked end, so they
were never part of anyone's reservation.

**One live entry per user, per desk, per day** — enforced by
`waiting_list_entries_one_active_per_user_seat_day`. The index deliberately includes the date: an
earlier version did not, so queuing for a desk on Thursday blocked queuing for the same desk on
Friday.

## 11. QR Code System

```
QR          → identifies the physical WORKSTATION
JWT         → identifies the authenticated USER
Reservation → determines AUTHORIZATION
Backend/DB  → the source of truth for all three
```

There is **one** QR system: `seatQrTokenService.ts`, an HMAC over a workstation id. A second,
reservation-scoped token family (`reservationId`, `userId`, `exp`, `nonce`) used to exist in
`qrTokenService.ts`; nothing generated or consumed it — no screen produced such a QR and no caller
ever passed one — so it has been deleted rather than left as a plausible-looking alternative.

### The static badge is not a credential

**What.** `generateSeatToken` is an HMAC over the workstation id, with no nonce and no expiry. The
same desk always produces the same token.

**Why.** The badge is printed and stays on the desk for months. An expiring token would need
reprinting; a nonce would make it unreproducible, so the system would have to store it to reprint.

**Consequence — read this before reusing the token anywhere.** The token is **not a secret** and
**not proof of identity**. It is on a sticker; anyone walking past can photograph it. A valid token
proves one thing: this string was signed by us and names workstation X. It says nothing about who
scanned it. Authorization is therefore always:

```
authenticated JWT user
  + verified workstation QR
  + a reservation matching that user AND that workstation
  + a valid time window
  + a valid reservation status
```

A caller that acts on the workstation id alone has built an unauthenticated endpoint.

`QR_HMAC_SECRET` must be configured. There is no hardcoded fallback: a missing secret raises a
clear configuration error rather than silently signing badges with a key that is in the source
tree. `DEMO_MODE=true` is the only exception and generates a random per-process key — and demo mode
cannot run in production (`backend/middleware/authMiddleware.ts` refuses to boot). Rotating the
secret invalidates every printed badge; they must all be reprinted.

### Check-in flow

```
Scan  (phone camera on the sticker, or SelfSeatScanModal in-app)
  ↓   the QR encodes <origin>/?scan=<seatToken>
Authentication
  ↓   AuthGate lifts ?scan= out of the URL, stores it, strips the address bar
  ↓   not signed in → LoginScreen → the scan resumes after sign-in
QR verification            POST /api/checkinout/scan-seat  (READ-ONLY)
  ↓   HMAC checked → 401 QR_INVALID if forged or tampered
Reservation lookup         user from the JWT, never the body
  ↓   holds a reservation here      → identity confirmation, then CHECK IN / CHECK OUT
  ↓   holds nothing, desk is FREE   → walk-in offer: "libre de 11:37 à 18:00", then book
  ↓   holds nothing, desk is taken  → "Ce poste est occupé jusqu'à 12:00."
  ↓   every refusal describes the DESK: the occupant's identity is never disclosed
Identity confirmation      "You are signed in as X" → the user confirms
  ↓
Reservation details        cluster, desk, date, start, end
  ↓
Explicit CHECK IN button   green, and it must be pressed
  ↓
Fresh server validation    POST /api/checkinout/check-in re-reads and re-checks everything
  ↓
OCCUPIED                   welcome message + the check-in time the DATABASE recorded
```

The scan endpoint performs **no state transition**. It used to: it checked the caller in on scan,
and checked them *out* if they were already occupying the desk, so a stray scan of your own desk
ended your session. Both are gone.

### Check-out flow

```
Manual early check-out:   OCCUPIED → COMPLETED, check_out_at recorded
                          from the dashboard, or from the QR screen's explicit CHECK OUT button
End time reached:         OCCUPIED → COMPLETED automatically (autoCheckOutExpired)
```

Scanning a badge never checks anybody out on its own.

**Acting on someone's behalf.** `ReceptionSeatScanModal` decodes the desk first
(`/scan-seat/decode`, restricted roles) and then asks *which* collaborator, before calling
`/check-in-for` or `/check-out-for`. Those routes are role-gated, and the audit trail records the
staff member as the actor with the collaborator as the subject — never as though the collaborator
had done it themselves.

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
| `POST /api/checkinout/scan-seat` | Read-only: resolves the caller's own reservation on a scanned desk. Performs no check-in. §11. |
| `POST /api/checkinout/check-in` | The only self check-in. Re-validates ownership, status and window; returns the stored timestamp. |
| `GET /api/reservations/extension-offers` | Earlier starts open to the caller after someone left a desk early. §10. |
| `POST /api/reservations/:id/extend` | Accepts one, re-deriving the offer server-side first. |
| `POST /api/reservations/:id/transfer` | Moves a booking to another desk. Allocation roles only. §10. |
| `POST /api/reservations/walk-in/availability` | How long the scanned desk is free for. |
| `POST /api/reservations/walk-in` | Takes it, for that window. The only lead-time exception. §10. |
| `GET /api/checkinout/auto-checkout`, `/reminders` | Site-wide sweeps: operational roles only, not any session holder. |
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
| `QR_HMAC_SECRET` | server | Signs the desk badges. **Required** — a missing value is a configuration error, not a fallback (§11). **Rotating it invalidates every printed badge.** |
| `TZ` | server | Optional. Defaults to `Africa/Casablanca` (see below). Set it only to relocate the site. |

### The site timezone

Reservation times are wall clocks - a user picks 08:00 and means eight in the morning at Site
Safi - stored as `timestamptz`, which is an instant. Converting between the two needs a zone,
and the process is pinned to `Africa/Casablanca` by `services/time/siteTime.ts`, imported first
in `backend/server.ts`.

**Decision: pin the process rather than convert at each call site.** Every reservation path
builds dates with `new Date('<date>T<time>')`, which means "in whatever zone this process runs
in". On Vercel that is UTC, so 08:00 was stored as 08:00Z - 09:00 in Morocco. It looked right
because it was read back the same way, and only broke where the instant meets real time:
no-show detection ran an hour late, and the waiting-list cascade with it.

**Consequence.** A zone NAME, never an offset: Morocco is UTC+1 most of the year and UTC+0
during Ramadan, so a hardcoded `+01:00` would be wrong for about a month annually. Anything
comparing a stored wall clock against real time in the BROWSER must use
`siteWallClockToEpoch`, not `new Date(date + 'T' + time)` - the latter reads the device's zone
and is right only when the user happens to be in Morocco.

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

**Correctness / edge cases**
- The Digital Twin's availability overlay is computed for the **start date** only. A multi-day
  booking is validated for every day on submit, but the pre-submit hint covers the first day.
- `trg_set_updated_at` exists on `public.floors`, which has **no `updated_at` column** — any
  `UPDATE` on a floor raises. Reproduced deliberately in the baseline rather than silently fixed;
  it deserves its own migration.
- Reservation wall clocks are resolved through the pinned site timezone (see §18). Event
  timestamps (`created_at`, `check_in_at`, ...) are true instants and are deliberately left
  alone. If a new column ever stores a user-typed time, it belongs in the first group - the
  test is whether a human typed it or the clock produced it.

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
