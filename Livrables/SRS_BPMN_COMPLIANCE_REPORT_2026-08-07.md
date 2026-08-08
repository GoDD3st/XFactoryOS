# XFactory OS — SRS + BPMN Compliance Report

**Note on scope:** the FR-1..42 / BPMN-1..19 list in the request is a generic template that does not match this project. The actual governing documents are `Livrables/SRS_XFactory_OS_Module_1_Smart_Open_Space_Management.md` (96 numbered requirements, FR-01..FR-96) and `Livrables/BPMN_OpenSpace_XFactoryOS_Mermaid_v1.html` (8 diagrams, D0–D7). Per the instruction to refer only to the documents in the project folders, this audit runs against those — not the generic list — with a mapping table at the end for cross-reference.

---

## 1. SRS vs Implementation (FR-01 → FR-96)

Legend: ✅ YES (works, file/function cited) · ⚠️ PARTIAL (exists but incomplete) · ❌ MISSING

### §11.1 Authentification
| FR | Status | Evidence |
|---|---|---|
| FR-01 email/password login | ✅ | `frontend/src/modules/auth/components/LoginScreen.tsx` → `realAuthService.signInWithPassword` |
| FR-02 SSO prep | ⚠️ | Google OAuth wired (`signInWithGoogle`); no enterprise SAML/SSO |
| FR-03 load roles/permissions at login | ✅ | `backend/middleware/authMiddleware.ts`, `realAuthService.fetchRealUserProfile` |
| FR-04 expire inactive sessions | ⚠️ | Supabase JWT default expiry only; no app-level idle timeout |
| FR-05 log connections | ✅ **fixed this session** | `frontend/src/modules/auth/context/AuthContext.tsx` now logs `LOGIN` on `SIGNED_IN` (was ❌ missing entirely before) |

### §11.2 Role Management
| FR | Status | Evidence |
|---|---|---|
| FR-06 predefined role list | ✅ | `roles` table seeded, `RolesAdminView.tsx` |
| FR-07 permission assignment per module | ⚠️ | `role_permissions` table exists, 0 rows, no admin UI |
| FR-08 CRUD permissions | ❌ | No UI/API manages `role_permissions` |
| FR-09 approval permissions | ✅ | `approver_role` concept in `ApprovalService` |
| FR-10 historize role changes | ❌ | No call site logs `ROLE_CHANGE` when `user_roles` changes |

### §11.3 User Management
| FR | Status | Evidence |
|---|---|---|
| FR-11 manage internal users | ✅ **fixed this session** | `UserRepository.createUser()` (real Supabase Auth admin-create) + `UsersAdminView.tsx` create modal |
| FR-12 visitor future support | ✅ (by design, not activated) | `UserRole` includes `visitor`, self-service intentionally off per SRS §8.9 |
| FR-13 associate department | ✅ | `users.department` |
| FR-14 active/inactive status | ✅ **fixed this session** | `UserRepository.updateUserStatus` now wired to `PATCH /api/users/:id/status` + UI toggle |
| FR-15 bulk import | ❌ | Not implemented (no import feature found) |

### §11.4 Workstation Management
| FR | Status | Evidence |
|---|---|---|
| FR-16 up to 40 desks | ✅ | `workstations` table, no hard cap |
| FR-17 SVG position per desk | ⚠️ | `svg_position` jsonb column exists, unused by the current card-grid UI |
| FR-18 statuses | ✅ | `workstation_status` enum, `WorkstationRepository.mapDbStatusToDomain` |
| FR-19 temporary disable | ✅ | Maintenance toggle, `WorkstationsAdminView.tsx` |
| FR-20 desk history | ✅ | `HistoryService.getWorkstationHistory`, `GET /api/history/workstation/:code` |

### §11.5 Cluster Management
| FR | Status | Evidence |
|---|---|---|
| FR-21 7 initial clusters | ✅ | Seeded |
| FR-22 support adding clusters | ⚠️ | RLS/DB supports it; no "create cluster" UI |
| FR-23 identify management clusters | ✅ | `clusters.management_reserved` |
| FR-24 disabled by default | ✅ | |
| FR-25 exceptional authorization | ⚠️ | Direct Super Admin toggle works (real DB write via `PATCH /api/workspaces/clusters/:id/management-lock`). **Also added:** per BR-07, Director/Executive Assistant/Admin/Super Admin can now select CL-F/CL-G seats directly without unlocking the cluster first (`AuthContext.canAccessManagementClusters`, wired into `DigitalTwin.tsx` — a prior UI/logic mismatch let admins click a seat that looked enabled but the handler silently no-op'd). The formal BPMN D3 GCI/Building-Manager **request → review → decide** workflow (`cluster_authorizations` table) still has RLS policies but no UI |

### §11.6 Reservation Management
| FR | Status | Evidence |
|---|---|---|
| FR-26/27/28 half/full/multi-day | ✅ | `reservation_type` enum, `deriveReservationType` |
| FR-29 FIFO | ✅ | `ReservationRepository.checkConflict`, fail-closed (fixed this session) |
| FR-30 approval if duration > max | ✅ | `ReservationService.createReservation` |
| FR-31 prevent conflicts | ✅ **fixed this session** | Was fail-open on DB error; now throws (fail-closed) |
| FR-32 user cancels before start | ✅ | Ownership-checked delete/update |
| FR-33 reservation history | ✅ | `HistoryService.getReservationHistory` |

### §11.7 Reservation Calendar
| FR | Status | Evidence |
|---|---|---|
| FR-34 day view | ✅ **fixed this session** | `CalendarView.tsx` — was previously a fake "week" grid showing the same single day 7 times |
| FR-35 week view | ✅ **fixed this session** | Real Mon–Sun date spread |
| FR-36 month view | ✅ **new this session** | Was entirely absent |
| FR-37 filter by cluster | ✅ **new this session** | Was entirely absent |
| FR-38 distinguish reservation/occupation/no-show | ✅ | Status enum + badge colors |

### §11.8 Digital Twin SVG
| FR | Status | Evidence |
|---|---|---|
| FR-39 walls/circulation/entrances | ❌ | `DigitalTwin.tsx` is a card grid, not an SVG plan |
| FR-40 desks/clusters represented | ⚠️ | As cards, not spatial SVG |
| FR-41 equipment/printers/displays | ❌ | `digital_twin_objects` table exists, 0 rows, never rendered |
| FR-42 disabled zones shown | ❌ | |
| FR-43 zoom/pan | ❌ | No handlers found |
| FR-44 hover/click | ✅ | Card hover/click |
| FR-45 realtime refresh | ✅ | `RealtimeSyncService` (fixed this session — event feedback loop removed) |
| FR-46 responsive | ⚠️ | Tailwind grid, not verified on real mobile devices |

**FR-39/41/42/43 are a genuine, undelivered feature gap** — an actual floor-plan SVG with walls/circulation/zoom/pan requires real building floor-plan assets and a front-end redesign beyond what can be inferred from the SRS text alone. Documented, not fabricated as done. See §3.

### §11.9 Real-time Occupancy — FR-47–51: ✅ all (Supabase Realtime channel on `reservations`/`workstations`, event loop bug fixed this session)

### §11.10 Search
| FR | Status | Evidence |
|---|---|---|
| FR-52 search by desk code | ✅ **fixed this session** | `SearchService.searchWorkstations` — was returning synthetic seed data server-side, always |
| FR-53 filter by cluster | ✅ | |
| FR-54 filter by availability | ✅ | |
| FR-55 filter by future equipment | ❌ | Equipment not functionally modeled |
| FR-56 save user filters | ❌ | Not implemented |

### §11.11 Check-in
| FR | Status | Evidence |
|---|---|---|
| FR-57 request check-in after start | ✅ | `CheckInOutService.getCheckInReminders` |
| FR-58 check-in via web/PWA | ✅ | |
| FR-59 notify before expiration | ⚠️ | Reminder data exists (`GET /api/checkinout/reminders`); no proactive push ticker sends it automatically (unlike no-show/auto-checkout, which do run on a timer) |
| FR-60 refuse unauthorized check-in | ✅ | Ownership check in `performCheckIn` |

### §11.12 Check-out — FR-61/62/63: ✅ all. **Critical fix this session**: `mapDomainStatusToDb('check-in')` wrote `'CHECKED_IN'`, which is **not a valid value** of the real `reservation_status` Postgres enum (valid check-in state is `OCCUPIED`) — every check-in write to the database has been failing outright. Fixed.

### §11.13 No Show — FR-64–67: ✅ all. `getNoShowStats()` fixed this session (was sync/browser-only, always returned zeros server-side via `GET /api/noshow/stats`).

### §11.14 Waiting List
| FR | Status | Evidence |
|---|---|---|
| FR-68 waiting list per period | ✅ | |
| FR-69 FIFO | ✅ | |
| FR-70 notify on availability | ✅ | |
| FR-71 expire unconfirmed offers | ✅ **new this session** | Was entirely missing (BPMN D5 GWRESP not implemented at all — offering never converted to a reservation, never expired, never cascaded). Now: `WaitingListService.acceptOffer/declineOffer/expireStaleOffers`, `POST /api/waiting-list/:id/accept|decline`, background ticker in `backend/server.ts` |

### §11.15 Reservation History — FR-72/73/74: ✅/⚠️ (CSV export exists; no field-level diff audit trail for reservation edits specifically, only action-level audit_logs)

### §11.16 Notifications — FR-75–79: ✅ all (fixed earlier this session — `notifications` table had no INSERT policy and the repository used the anon client with no admin fallback, so no notification had ever actually reached the database)

### §11.17 Dashboard et rapports
| FR | Status | Evidence |
|---|---|---|
| FR-80 occupancy rate | ✅ | `ExecutiveDashboard.tsx`, `telemetryService.getRealTimeTelemetry` |
| FR-81 available/reserved counts | ✅ | |
| FR-82 peak hours | ✅ **fixed this session** | Was a **hardcoded fake string** `'09:30 - 11:30'` shown to every viewer regardless of real data; now computed from actual reservation start-time buckets over the last 7 days |
| FR-83 heat map | ⚠️ | Card-grid "heatmap", not a spatial heatmap |
| FR-84 cluster usage | ✅ | |
| FR-85 no-shows | ✅ | |
| FR-86 trends | ✅ **new this session** | Was entirely absent; added `TelemetryService.getReservationTrends`, `GET /api/telemetry/trends`, bar chart in `ExecutiveDashboard.tsx` |
| FR-87 PDF/Excel export | ✅ **new this session** | Was CSV-only; added real `.xlsx` export (`xlsx` package) and browser print-to-PDF |

### §11.18 Administration et settings
| FR | Status | Evidence |
|---|---|---|
| FR-88 max duration setting | ✅ | |
| FR-89 no-show delay setting | ✅ | |
| FR-90 business days/hours | ✅ | |
| FR-91 per-cluster rules | ❌ | Settings are global only |
| FR-92 theme/preferences | ✅ | |

**Critical fix this session, unrelated to a specific FR but underlying all of §11.18**: `SettingsRepository` referenced a `raw_config` jsonb column (and ~8 other columns) that **never existed** on `public.settings`. Every settings write, ever, including through the OTP-confirmed Super Admin flow, silently failed; every read fell back to hardcoded defaults. Fixed (added the column, corrected the write payload).

### §11.19 Audit Logs
| FR | Status | Evidence |
|---|---|---|
| FR-93 log create/update/delete | ✅ | Reservations, approvals; not fully consistent across every entity type |
| FR-94 log approvals/refusals | ✅ | |
| FR-95 log RBAC changes | ❌ | No `ROLE_CHANGE` call site (matches FR-10 gap — no role-editing UI exists yet either) |
| FR-96 filter by date/actor/entity | ⚠️ | `AuditLogsView.tsx` has keyword search; no explicit date-range/actor/entity filter controls |

**Critical fix this session**: `AuditService.getAuditLogs()` was written for browser+localStorage and, called server-side (`GET /api/audit`), always returned `[]` — the audit log viewer never showed real data via the API. Fixed.

---

## 1a. Post-Report Fixes (2026-08-07, continued)

The five items below landed after this report was first written and are not reflected in the FR table's "fixed this session" notes above (except where cross-referenced). A verification pass on 2026-08-07 also found and fixed three further data-integrity bugs in the workstation admin CRUD path.

- **VIP cluster seat selection** (FR-23/24/25, D3): Director/Executive Assistant/Admin/Super Admin can now select CL-F/CL-G seats directly (`AuthContext.canAccessManagementClusters`), fixing a UI/logic mismatch in `DigitalTwin.tsx` where the button looked clickable for these roles but the handler silently did nothing.
- **Holidays + workspace lockdown**: Super Admin can add/edit OCP public holidays and lockdown date ranges (`SystemSettings.holidays` / `closedDates`), enforced both client-side and server-side in `ReservationService.createReservation` (`isDateLockedDown`, `isPublicHoliday`). Not tied to a specific numbered FR — extends FR-90 (business days/hours).
- **Notification bell**: `RoleShell.tsx` previously rendered two hardcoded fake notification cards; now calls `apiFetchNotifications()`/`apiMarkNotificationRead()` for real unread-count and mark-as-read behavior (FR-75–79).
- **Director dashboard** (`DirectionView.tsx`): previously fabricated KPIs (e.g. a fixed "84.2%" occupancy, "14 Projets", "+280 m²" shown regardless of real data); now built on `getRealTimeTelemetry()` (FR-80–87).
- **IT Admin dashboard** (`ITAdminView.tsx`): previously showed fabricated hardware stats plus reservations/Digital Twin (out of scope per the SRS role matrix — IT Admin's mandate is hardware, not occupancy); now shows only real per-desk diagnostics via `apiFetchHardwareDiagnostics()`, reservations/twin removed.

### Workstation admin CRUD — bugs found and fixed during this 2026-08-07 verification pass

While re-verifying task "Workstation/Cluster admin CRUD persistence" (flagged as unconfirmed in the prior handoff), five real, confirmed bugs were found in `WorkstationsAdminView.tsx` / `WorkstationEditModal.tsx` / `WorkstationRepository.ts` / `WorkspaceService.ts`:

1. **CL-F/CL-G had zero real workstation rows in the database, for as long as the app has existed.** `database/seeder.ts` wrote `status: 'MANAGEMENT_RESERVED'` for these two clusters' 8 seats, but that string is **not a valid `workstation_status` enum value** — every insert failed silently, and the seeder's "only run if `clusters` table is empty" guard meant it never retried once the other 5 clusters existed. The UI never showed this because a client-side `generateDefaultWorkstations()` fallback synthesized placeholder seats. Any real reservation on a CL-F/CL-G seat would have failed at `resolveWorkstationId()`. **Fixed**: seeder and `WorkstationRepository.mapDomainStatusToDb()` now write `'AVAILABLE'` + `reservable: false` (which already round-trips correctly to the domain `'management_reserved'` status); the 8 missing rows were backfilled directly (see `SUPABASE_CHANGELOG.md`, 2026-08-07 entry).
2. **The admin edit modal (`WorkstationEditModal`) collected visibility/amenity/notes fields but never sent them anywhere.** `handleSave()` only called `updateWorkstationStatus(id, status, reservable)`; the `visibleToUsers`, near-window, PMR, quiet-zone, and notes fields the form collects were silently discarded on every save. **Fixed**: added `WorkstationRepository.updateWorkstation()`, which merges a metadata patch against the row's current `metadata` jsonb; the modal now calls it with all collected fields.
3. **The extension-seat visibility toggle never touched the database at all** — `WorkspaceService.toggleExtensionSeatVisibility()` only mutated an in-memory object and `localStorage`. **Fixed**: now persists via the same `updateWorkstation()` metadata-merge path. Also `getWorkstations()` was reading `visibleToUsers` from a nonexistent top-level DB column instead of `metadata.visibleToUsers` — always fell back to the `?? true` default regardless of actual state.
4. **The Postes admin table double-counted every workstation** (28 real seats displayed as up to 56, with duplicate rows) because `getWorkstations()` intentionally keys its result map under both a cluster's UUID and its lowercase code (for lookup flexibility used elsewhere), and the table naively flattened every map value. **Fixed**: dedupe by workstation id at the display layer.
5. **The admin table was always one fetch cycle stale** — `loadWorkstations()` called the live-fetching `fetchClustersWithOverlays()` but then discarded its result and re-read `WorkspaceService.getSavedWorkstations()`, which returns its `localStorage` cache synchronously and only refreshes it in the background. **Fixed**: the view now uses the live-fetched result directly.

All five verified live: `npx tsc --noEmit` and `npx vite build` clean after each change; the Postes admin table was exercised in-browser (role-switched to Administrateur via demo mode) and now shows exactly 28 real seats across all 7 clusters with no duplicates. The metadata-write fix (items 2–3) could not be click-tested end-to-end in the browser because demo mode does not establish a real Supabase Auth session, and the `workstations` UPDATE RLS policy requires `has_role(['SUPER_ADMIN','ADMIN','BUILDING_MANAGER','GCI_MANAGER'])` — verified the policy and `has_role()` function are correctly configured, and that real test accounts with these roles exist, but a genuine authenticated session is needed to confirm the write clears RLS end-to-end.

**Follow-up fix, same pass**: found that every admin quick-action in `WorkstationsAdminView.tsx`/`DigitalTwin.tsx` (maintenance toggle, extension visibility toggle) called `WorkspaceService` directly from the browser (anon-key client) instead of the backend routes that already existed for exactly this purpose (`PATCH /api/workspaces/clusters/:id/seats/:id/visibility|maintenance`, built earlier but never wired to any frontend caller). Added `apiToggleSeatVisibility`/`apiToggleSeatMaintenance`/`apiUpdateWorkstation` wrappers in `services/api/workspaceApi.ts` and switched every call site to use them — closes the same demo-mode/RLS gap consistently across the whole admin surface, and adds a new `PATCH /api/workspaces/seats/:id` endpoint backing the edit modal.

## 1b. Digital Twin real floor plan + VIP cluster admin (2026-08-07, user-provided blueprint)

The user supplied the actual OCP Safi Module 1 floor plan (two images: full building blueprint, zoomed Open Space detail). This resolves the FR-39–46 gap differently than originally scoped — not a full architectural SVG (no CAD/wall-geometry data was provided), but a schematic room-accurate floor plan:

- **New component** `frontend/src/shared/components/BuildingFloorPlan.tsx` — renders ~25 real, named rooms from the blueprint (Vestiaires, Salle de prière, Stand up meeting, Total focus, Brainstorming space, Salles de réunion 01/02, Détente ×3, Zone fumeur, Cour, Hall, etc.) as percentage-positioned zones over a fixed-aspect-ratio canvas. Only the two **Open Space** rooms (Module 1's actual scope) are interactive; every other room shows a "Bientôt disponible" (Coming Soon) modal on click, honestly reflecting that they aren't wired up yet rather than faking interactivity.
- `DigitalTwin.tsx` now has a **Plan / Liste** toggle (plan is default): plan mode renders the 7 clusters spatially inside their real Open Space rooms (CL-A–D in Open Space Ouest, CL-E–G in Open Space Est, per the blueprint's two-room split); liste mode keeps the original card grid as a fallback. All existing interaction (search, filters, hover detail, admin overlay, seat selection) is unchanged — only the layout container changed.
- **New feature, user-requested same session**: Super Admin/Admin/Director/Executive Assistant can mark *any* cluster VIP (previously only CL-F/CL-G, hardcoded), assign specific users to a VIP-locked cluster (new `cluster_vip_members` allowlist table — members can book that cluster without needing one of the four privileged roles), and add extension seats up to 8/cluster on demand (previously extension seats 5-8 never existed in the database for any cluster). `ClustersAdminView.tsx` rebuilt with these controls; `RoleShell.tsx` gives Director/EA a new "Clusters VIP" tab.
- **Security fix found while wiring this in**: `ReservationService.createReservation` had **no server-side check at all** that a locked/`management_reserved` seat's `reservable` flag was respected — only the UI disabled the button. A direct POST to `/api/reservations` could book any VIP-locked seat regardless of role. Fixed: server now checks `reservable` and rejects unless the requester holds a privileged role or is a `cluster_vip_members` allowlist entry for that cluster — verified live (collaborator role correctly rejected with a clear error; director role passed this check).

---

## 2. BPMN vs Backend (D0–D7)

| Diagram | Status | Notes |
|---|---|---|
| **D0** Vue globale | ✅ | RBAC-gated menu, Digital Twin entry point present (as card grid, not SVG) |
| **D1** Réservation standard FIFO | ✅ (ALT path fixed this session) | `GWAV` conflict → `ALT` "proposer alternatives" was missing entirely; now `ReservationConflictError` carries up to 3 alternative desks in the same cluster/slot, surfaced in the 409 response and shown in `EndUserDashboard.tsx` |
| **D2** Longue durée / approbation | ✅ | Request → notify → decide → audit, fully wired (approval_requests schema fixed earlier this session) |
| **D3** Clusters management | ⚠️ | Direct toggle works; direct VIP seat selection for Director/EA/Admin/Super Admin added (see FR-25) — but see §1a: CL-F/CL-G had **zero real workstation rows** in the DB until 2026-08-07, found and fixed during this audit. The full request/review/decide sub-flow (`cluster_authorizations`) still has DB support but no UI |
| **D4** Check-in / No-show | ✅ (critical enum bug fixed this session) | Check-in write was silently failing (invalid enum value); no-show ticker runs every 60s |
| **D5** Liste d'attente FIFO | ✅ (GWRESP fixed this session) | Accept/decline/expire-and-cascade was completely unimplemented; now fully wired with a 60s expiry ticker |
| **D6** Architecture | ⚠️ | Services layer mirrors the diagram; AI Assistant now makes a real Gemini call (was keyword matching with fabricated numbers) — see §3; Digital Twin is still not a true SVG |
| **D7** Cycle de vie | ✅ (fixed this session) | `REJECTED` was being collapsed into `CANCELLED` (loses audit/analytics fidelity); now a distinct terminal state matching the enum and the diagram |

**Missing states found**: none in the DB (`reservation_status` enum already had all 10 states from `DRAFT` to `AVAILABLE_RELEASED`) — the gap was entirely in the **application code's mapping to those states** (`CHECKED_IN` typo, `REJECTED` collapsed into `CANCELLED`), not the schema.

**Missing transitions found and fixed**: `OFFERED → ACCEPTED` (waiting list), `OFFERED → EXPIRED → (next FIFO offer)`.

---

## 3. Missing Features — Gap Groups

- **Reservation system**: alternative-desk suggestion (fixed), REJECTED state (fixed), check-in enum bug (fixed) — all closed this session.
- **RBAC**: role_permissions CRUD UI (FR-07/08) and role-change audit logging (FR-10/95) remain unimplemented — there is no role-editing screen at all yet, so logging its absence is consistent. Flagged, not fixed (would require designing a permissions-matrix editor, a larger UI project).
- **Notifications**: closed this session (prior fix).
- **Dashboard**: trends + Excel/PDF export closed this session; per-cluster settings (FR-91) and true spatial heatmap remain open.
- **AI assistant**: was 100% fabricated (keyword matching + hardcoded fake numbers like "96.4%" hardware uptime, "2 postes" freed today — numbers that were never computed from anything). **Rebuilt this session** with a real Gemini 2.0 Flash call (`GEMINI_API_KEY` is configured), grounded strictly in live Supabase data assembled server-side, with a deterministic fallback if the API call fails. RBAC widened to include Employee per SRS §22.2, which explicitly lists Employee as an actor.
- **Digital Twin**: still a card grid, not the SRS §21 interactive SVG (walls, circulation, zoom/pan, equipment icons). **Not attempted this session** — this needs real floor-plan artwork/geometry input that doesn't exist anywhere in the repo or Livrables folder; building one from scratch would mean inventing a floor plan not specified anywhere, which the "do not hallucinate" instruction rules out. This needs a decision/input from you (either provide a floor-plan SVG/positions to wire up, or accept the card-grid as the deliberate v1 representation).
- **Audit logs**: server-side read bug fixed this session; role-change logging still open (blocked on FR-07/08/10 not existing).
- **APIs**: all new functionality above is exposed via REST endpoints (see §5).
- **Security**: RBAC audited across every backend route this session (prior turn) — waiting list, search, and history endpoints were leaking cross-user data with no ownership scoping; all fixed.

---

## 4. Implementations — see the conversation for full diffs. Key new/changed files this session:

- `services/waitinglist/waitingListService.ts`, `database/repositories/waitingListRepository.ts`, `backend/routes/waitinglist.routes.ts`, `services/api/waitingListApi.ts`, `frontend/.../WaitingListView.tsx` — D5 accept/decline/expiry
- `services/reservations/reservationService.ts` (`ReservationConflictError`, `findAlternativeDesks`), `backend/routes/reservations.routes.ts`, `services/api/reservationApi.ts`, `frontend/.../EndUserDashboard.tsx` — D1 alternatives
- `database/repositories/reservationRepository.ts` (`mapDbStatusToDomain`/`mapDomainStatusToDb`), `services/approval/approvalService.ts`, `frontend/src/types/index.ts`, `frontend/.../ReservationsTable.tsx` — D7 REJECTED + check-in enum fix
- `services/ai/aiAssistantService.ts`, `database/repositories/aiInteractionRepository.ts`, `backend/routes/ai.routes.ts`, `services/api/aiApi.ts`, `frontend/.../AIAssistantDrawer.tsx` — real Gemini-backed assistant
- `database/repositories/settingsRepository.ts`, `services/settings/settingsService.ts`, `backend/routes/settings.routes.ts` — settings persistence (was fully broken)
- `frontend/.../CalendarView.tsx` — real day/week/month + cluster filter
- `services/telemetry/telemetryService.ts`, `backend/routes/telemetry.routes.ts`, `services/api/telemetryApi.ts`, `frontend/.../ExecutiveDashboard.tsx` — real peak-hour, trends, Excel/PDF export
- `database/repositories/userRepository.ts`, `backend/routes/users.routes.ts`, `services/api/userApi.ts`, `frontend/.../UsersAdminView.tsx` — user create/disable
- `services/noshow/noShowService.ts`, `backend/routes/noshow.routes.ts`, `services/api/noShowApi.ts` — no-show stats server-side fix
- `frontend/src/modules/auth/context/AuthContext.tsx` — login audit logging

All changes verified with `npx tsc --noEmit` (clean) and `npx vite build` (clean) after every batch.

---

## 5. API Summary (new/changed endpoints this session)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/waiting-list/:id/accept` | D5 GWRESP accept — converts offer to reservation |
| POST | `/api/waiting-list/:id/decline` | D5 GWRESP decline — cascades to next FIFO |
| GET | `/api/telemetry/trends?days=N` | FR-86 daily reservation/no-show volume |
| POST | `/api/users` | FR-11 admin creates a user (real Supabase Auth account) |
| PATCH | `/api/users/:id/status` | FR-14 activate/deactivate a user |
| POST | `/api/ai/ask` | Unchanged route, now backed by a real Gemini call instead of keyword matching |
| POST | `/api/reservations` | Unchanged route; 409 responses now include `alternatives[]` |

## 6. Database Changes this session

None required for the original FR-01→FR-96 audit pass (waiting-list accept/expire and REJECTED status both used columns/enum values that already existed; user creation uses existing tables). The 2026-08-07 CRUD-verification follow-up (§1a) did require one data change: 8 missing `workstations` rows for CL-F/CL-G were backfilled. All schema/data changes are logged in `Livrables/SUPABASE_CHANGELOG.md`.

---

## Cross-reference to the generic FR-1..42 list in the request

| Generic FR | Maps to real FR(s) | Status |
|---|---|---|
| FR-1/2 Login/logout | FR-01 | ✅ |
| FR-3/4/5 Roles, RBAC, feature-gating, user management | FR-03/06/07/08/11/14 | ⚠️/✅ mixed — see §11.2/11.3 above |
| FR-6/7/8/9 Desk/cluster management | FR-16–25 | ✅/⚠️ mixed |
| FR-10–15 Reservations | FR-26–33 | ✅ |
| FR-16–18 Reservation rules | FR-16/17 (dateValidation.ts), lifecycle §D7 | ✅ (fixed) |
| FR-19–21 Notifications | FR-75–79 | ✅ (fixed earlier this session) |
| FR-22–25 Dashboard | FR-80–87 | ✅ (fixed this session) |
| FR-26–28 AI assistant | §22 | ✅ (rebuilt this session) |
| FR-29–31 Digital Twin | §21 (FR-39–46) | ❌ still open — see §3 |
| FR-32–34 Audit | FR-93–96 | ✅/❌ mixed |
| FR-35–37 APIs | §20 | ✅ |
| FR-38/39 Error handling | §27 | ⚠️ not systematically using the SRS's named error codes, but errors are handled and messaged |
| FR-40–42 Security | §25 | ✅ (full RBAC route audit done this session) |
