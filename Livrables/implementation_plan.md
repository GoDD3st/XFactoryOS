# Phase 6: Data Integration & API Connections

Now that the UI components are modularized and props-driven, they currently display empty states because they aren't fetching real data. The next major step is to connect our frontend to the Supabase PostgreSQL database securely.

## Goal
Implement a robust data-fetching layer using `@tanstack/react-query` and `supabase-js` so that all dashboards (Admin, EndUser, Security, etc.) display real-time data instead of empty states.

## Open Questions
> [!IMPORTANT]
> The roadmap mentions routing API calls through a Node.js Backend API Gateway (`backend/src/`). However, for standard CRUD operations (reading reservations, workstations, clusters), querying Supabase directly from the frontend using `supabase-js` is faster and highly secure thanks to Row Level Security (RLS). 
> 
> **Question:** Should we implement direct Supabase fetching for standard CRUD to speed up the UI, and reserve the API Gateway strictly for complex backend logic (like AI recommendations or sending email notifications)?

## Proposed Changes

### 1. Data Fetching Services
We will create a service layer that interacts securely with the database using the authenticated user's session token.

#### [NEW] `frontend/src/services/api/workspaces.ts`
- Functions to fetch `clusters` and `workstations` for the Digital Twin.

#### [NEW] `frontend/src/services/api/reservations.ts`
- Functions to fetch user reservations, pending approvals, and KPIs.

#### [NEW] `frontend/src/services/api/admin.ts`
- Functions to fetch users, audit logs, roles, and system settings.

### 2. React Query Hooks
We will create custom hooks to manage caching, loading states, and refetching.

#### [NEW] `frontend/src/hooks/queries/useWorkspaces.ts`
#### [NEW] `frontend/src/hooks/queries/useReservations.ts`
#### [NEW] `frontend/src/hooks/queries/useAdmin.ts`

### 3. Dashboard Integration
We will inject these hooks into the dashboard components so they can pass real data to the shared UI elements.

#### [MODIFY] `frontend/src/modules/dashboard/components/EndUserDashboard.tsx`
- Connect `useReservations` and `useWorkspaces` to power the Digital Twin and personal reservations table.

#### [MODIFY] `frontend/src/modules/admin/components/AdminDashboard.tsx`
- Connect `useAdmin` to power the Users Table, Roles Matrix, and Audit Logs.

#### [MODIFY] `frontend/src/modules/admin/components/SecurityDashboard.tsx`
- Connect `useAdmin` to power the Audit Log Viewer.

## Verification Plan

### Automated Tests
- Build verification (`npm run build`) to ensure no TypeScript compilation errors.

### Manual Verification
- We will log in as an `admin` and an `employee` and verify that data (or the correct empty states if the tables are empty) load dynamically from the database.
