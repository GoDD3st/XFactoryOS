# XFactory OS — Module 1 Smart Open Space Management
## SRS + BPMN Conformance Report

**Repo tested:** `GoDD3st/XFactoryOS` (branch: default, cloned fresh)
**Method:** installed & ran the app (`npm install && npm run dev`, confirmed boot on `:3000`), traced every service/route file against SRS FR/BR IDs and the 8 BPMN diagrams, and wrote a Node test harness (`tsx`) that actually executed the reservation, no-show, approval, and waiting-list service functions in isolation to observe real runtime behavior rather than just reading code.

**Verdict:** The **data model and role taxonomy** track the SRS closely. The **business-process wiring** (the part BPMN D0–D7 actually describes) is mostly **not connected** — most workflows exist as isolated service functions that the UI never calls, or as UI mockups with hardcoded arrays that never call the service layer. There are also several features in the app that the SRS explicitly places **out of scope** for Module 1.

---

## 1. Implemented and conforms

| Area | SRS ref | Status | Evidence |
|---|---|---|---|
| 10 personas, no self-service visitor | §8, RBAC §13 | ✅ | `frontend/src/types/index.ts` — `UserRole` = exactly the 10 SRS roles |
| Role-based dynamic menu | FR-03 | ✅ | `RoleShell.tsx` → `ROLE_TABS` per role |
| 7 clusters, CL-F/CL-G flagged management-only | BR-07 | ✅ | `services/workspaces/workspaceService.ts` |
| No-show delay = 30 min, *when triggered manually* | BR-12, FR-64/65 | ✅ (logic only) | `services/noshow/noShowService.ts`; verified by test harness — flips status to `no-show`, frees desk, notifies, audits |
| FIFO ordering on waiting list | BR-01, FR-69 | ✅ | `services/waitinglist/waitingListService.ts` — `processWaitingListFIFO()` respects insertion order, confirmed by harness |
| Audit log schema | §26.2 | ✅ (schema only) | `AuditLogEntry` — actor, action, entity, timestamp, IP, all present |
| Screen inventory | §28 | ✅ | Every wireframe in §28 has a matching view file (`ExecutiveDashboard`, `MyReservationsView`, `CalendarView`, `WaitingListView`, `WorkstationsAdminView`, `ClustersAdminView`, `UsersAdminView`, `RolesAdminView`, `SettingsView`, `AuditLogsView`) |
| Reservation statuses | ERD §19 | ✅ (superset — see §4 below re: extra `extension`/`maintenance` seat states) | `ReservationStatus` type covers confirmed/check-in/waiting/cancelled/completed/no-show/checked-out |

---

## 2. In the code but not actually wired into the running app

This is the biggest category, and the most important one to understand before you build on top of it — these look done in a code review but do nothing when you click through the UI.

| Feature | SRS ref | What exists | Why it doesn't run |
|---|---|---|---|
| **No-show detection** | BR-12/13, BPMN D4 | `NoShowService.detectNoShows()` works correctly when called directly (verified) | **Nothing calls it.** No `setInterval`/polling in the frontend, and the only caller is `backend/routes/noshow.routes.ts` — but the frontend never makes a single `fetch()` call to the Express backend anywhere (`grep` across `frontend/` for `fetch(` returns zero hits). Reservations will sit as `confirmée` forever. |
| **Long-duration approval workflow** | BR-05/06, BPMN D2 | `ApprovalService` has full request → notify → approve/reject → audit logic | `services/reservations/reservationService.ts::createReservation()` never calls `ApprovalService.requiresApproval()`. No booking is ever routed to `PENDING_APPROVAL` automatically. Separately, `ApprovalsView.tsx` displays a **hardcoded local array** of fake `VIPRequest` objects and never imports `ApprovalService` at all — approving/rejecting in that screen doesn't touch the real approval data. Two disconnected implementations of the same feature. |
| **Cluster management authorization (CL-F/CL-G unlock)** | BR-09, BPMN D3 | `ClustersAdminView.tsx` has a toggle button | It's local `useState` (`unlockedState`) — no service call, no persistence, no audit log, and it doesn't change `is_management_only`/`enabled` on the actual cluster data used by the Digital Twin. Confirmed by harness: `CL-F` stays `reservable: true`/`disponible` regardless of the toggle. The BPMN D3 "request → GCI/BM review → time-boxed activation → audit" flow doesn't exist anywhere in code. |
| **System Settings (max duration, no-show delay)** | BR-04, FR-88/89 | `SettingsView.tsx` saves to `SettingsService` | Confirmed by grep: **nothing else in the codebase reads `SettingsService`.** `NoShowService.NO_SHOW_DELAY_MINUTES` (30) and `ApprovalService.MAX_DURATION_WITHOUT_APPROVAL_DAYS` (3) are separate hardcoded constants. Changing settings in the UI has zero effect on system behavior. |
| **Double-booking prevention** | BR-01, FR-31 | — | Confirmed by harness: booking the same desk/slot twice from two different users both return `status: 'confirmée'`. No conflict check exists anywhere in `createReservation()` or `ReservationPanel.tsx`. |
| **Real-time occupancy sync** | FR-45/51 | `window.dispatchEvent(CustomEvent)` on every save | Works only within a single browser tab. No Supabase Realtime channel, no WebSocket. Two different users in two different browsers will not see each other's bookings without a manual refresh (and even then, each browser has its own separate `localStorage`, so they'd never converge at all). |
| **Users / Roles admin CRUD** | FR-11–15, §11.2 | `UsersAdminView.tsx`, `RolesAdminView.tsx` | Both just render a static seed array through local `useState` — search/filter only, no create/edit/disable actually persisted anywhere. |

---

## 3. Not implemented at all

| Requirement | SRS ref | Notes |
|---|---|---|
| Real authentication (email/password login, session, SSO prep) | FR-01–05 | Confirmed — you already know this one, addressing it next |
| Server-side RBAC enforcement | §13, §25.1 | Every Express route in `backend/routes/*` has zero auth/permission middleware |
| Input validation / sanitization / rate limiting on API | §25 | No schema validation (no Zod etc.) anywhere in `backend/routes/` |
| Interactive SVG Digital Twin (walls, circulation, entrances, zoom/pan) | FR-39–43 | `DigitalTwin.tsx` is a grid of cluster/desk cards; no `<svg>`, no zoom/pan handlers found |
| Search engine with saved filters | FR-52–56 | `services/search/searchService.ts` exists but isn't reachable from any view I found wired to it beyond basic keyword match |
| AI Assistant — real recommendations/predictions | §22 | `askXFactoryAI()` is keyword string-matching (`if queryLower.includes('disponib')...`), not a model call — despite `@google/genai` being a dependency, it's never imported by the service |
| Dashboard exports (PDF/Excel/CSV) | FR-87, §23.4 | No export logic found in `ExecutiveDashboard.tsx` |
| Approval/cluster/no-show audit trail actually populated by real events | §26 | `logAuditEvent()` exists and is correctly called *inside* `NoShowService` and `ApprovalService`, but since those two are barely triggered by the UI (see §2), the audit log stays mostly seeded/empty in practice |

---

## 4. Additions beyond SRS Module 1 scope

You asked for **strict** conformance — no additions. These exist in the repo but the SRS explicitly places them outside Module 1 (§6 "Hors périmètre," §10.3 roadmap phases), so they should be removed or fenced off if you want a clean 1:1 match:

| Addition | Where | SRS says |
|---|---|---|
| **Visitor badge generation** (`generateVisitorBadge`) | `services/security/securityService.ts` | §6: "Gestion visiteurs — Futur module." §8.9: Visitor is "modélisé mais non activé en self-service" — a working badge generator is more than modeling. |
| **Evacuation roster with a hardcoded fake visitor** ("Jean-Marc Dupont") | `services/security/securityService.ts::getEvacuationRoster()` | Not in SRS at all for Module 1 — closest match is Phase 4 (Visitors) / Phase 6 (Services & Support) on the roadmap (§33), explicitly future phases. |
| **Hardware diagnostics** (RJ45 port status, link speed, dock power delivery, `resetHardwarePort()`) | `services/hardware/hardwareService.ts` | §10.3 marks equipment as "Préparé, minimal" for v1 — this is a fully working IT-ops feature, not minimal prep. Also full port-level network diagnostics is Phase 5 (Equipment Management) territory. |
| **8 seats per cluster (56 total) with an "extension" seat concept** | `services/workspaces/workspaceService.ts::generateWorkstationsForCluster` | SRS §3.2/§19.2 is explicit: **28 postes actuels (4/cluster), extensible jusqu'à 40**. The current model bakes in 8/cluster = 56 max, which is a different number than the SRS's stated ceiling, and introduces a `SeatStatus` value (`'extension'`) that doesn't exist in the SRS's status vocabulary (disponible/réservé/occupé/no-show/désactivé/management/maintenance, §21.3). |
| **`checkinout`, `telemetry`, `history`, `search` as separate service *and* route modules** | `services/*`, `backend/routes/*` | Not wrong functionally, but several of these (telemetry vs. dashboard KPIs, history vs. audit) duplicate the same data through parallel code paths not distinguished in the SRS's domain model (§18.4) — worth consolidating if "no additions" is the goal, since right now there are two ways to compute the same occupancy numbers. |

---

## 5. RBAC matrix reality check (§13)

The SRS matrix is implemented as **UI tab visibility only** (`RoleShell.tsx`). None of it is enforced where the SRS requires it ("RBAC serveur obligatoire," §25.1):

- Every backend route is open to any caller regardless of role.
- The frontend doesn't even call those backend routes — it talks to the service layer directly in-browser, so there's no server boundary to enforce anything at, currently.
- This is exactly the piece your next step (Supabase Auth + Google OAuth) needs to fix, and it should come with **RLS policies in Supabase** (per your existing 19-table schema) rather than trusting the client.

---

## 6. BPMN diagram-by-diagram status

| Diagram | Status |
|---|---|
| D0 — Vue globale (routing by role/action) | ✅ Present as UI navigation, not as a formal gateway/state machine |
| D1 — Réservation standard FIFO | ⚠️ Booking works; FIFO/conflict-check and alternative-desk suggestion on unavailability do not |
| D2 — Longue durée / approbation | ❌ Not wired (see §2) |
| D3 — Clusters management | ❌ Not wired (see §2) |
| D4 — Check-in / No-show | ⚠️ Check-in works manually; no-show auto-detection logic works but is never triggered |
| D5 — Liste d'attente | ✅ Core FIFO logic works; the "notify on release, expiring offer" half of the loop (`GWRESP` timeout in the BPMN) isn't implemented |
| D6 — Architecture | ⚠️ Matches on paper (services layer mirrors the diagram's boxes) but Realtime/DB are not actually the source of truth (localStorage is) |
| D7 — Cycle de vie (state machine) | ⚠️ States exist as string literals on `Reservation.status`, but transitions aren't centrally enforced — several transitions in the diagram (e.g. `PENDING_APPROVAL → CONFIRMED`) can't happen because nothing ever puts a reservation into `PENDING_APPROVAL` in the first place |

---

## 7. Suggested next steps, in order

1. **Strip the out-of-scope additions** (§4) if you want a clean SRS match before building further — removing them now is cheap; removing them after Supabase wiring is more work.
2. **Wire the disconnected workflows** (§2) — these are mostly small integration fixes (call `ApprovalService`/`NoShowService`/`SettingsService` from the places that currently bypass them), not new features to design.
3. **Then** do Supabase Auth + Google OAuth, and use that moment to also move persistence off `localStorage` and onto your real 19-table Supabase schema — doing auth and real data source together avoids doing the RLS work twice.
4. Digital Twin SVG redesign (already on your roadmap) can come after, since it's UI-only and doesn't block the functional/security work above.
