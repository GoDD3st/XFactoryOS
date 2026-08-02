-- ============================================================================
-- OCP SA XFactory OS — Row Level Security (RLS) Policies
-- Zero-Trust Second Defense Layer for Supabase PostgreSQL
-- ============================================================================

-- Enable RLS on all critical tables
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workstations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waiting_list_entries ENABLE ROW LEVEL SECURITY;

-- Helper function: Check if current authenticated user has an admin role
CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
    AND r.code IN ('admin', 'super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Check if current authenticated user has a manager role
CREATE OR REPLACE FUNCTION public.is_manager_or_higher()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
    AND r.code IN ('building_manager', 'gci_manager', 'executive_assistant', 'director', 'admin', 'super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 1. RESERVATIONS POLICIES
-- ----------------------------------------------------------------------------

-- SELECT: Users can view their own reservations; Managers/Admins can view all
CREATE POLICY "reservations_select_policy" ON public.reservations
  FOR SELECT
  USING (
    user_id = auth.uid() OR public.is_manager_or_higher()
  );

-- INSERT: Users can only create reservations for themselves (user_id = auth.uid())
CREATE POLICY "reservations_insert_policy" ON public.reservations
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
  );

-- UPDATE: Users can update their own reservations; Admins can update any
CREATE POLICY "reservations_update_policy" ON public.reservations
  FOR UPDATE
  USING (
    user_id = auth.uid() OR public.is_admin_or_superadmin()
  )
  WITH CHECK (
    user_id = auth.uid() OR public.is_admin_or_superadmin()
  );

-- DELETE: Only owner or admin can cancel/delete
CREATE POLICY "reservations_delete_policy" ON public.reservations
  FOR DELETE
  USING (
    user_id = auth.uid() OR public.is_admin_or_superadmin()
  );

-- ----------------------------------------------------------------------------
-- 2. APPROVAL REQUESTS POLICIES
-- ----------------------------------------------------------------------------

-- SELECT: Requesters can see their own requests; Approvers can see all pending/history
CREATE POLICY "approvals_select_policy" ON public.approval_requests
  FOR SELECT
  USING (
    requested_by = auth.uid() OR public.is_manager_or_higher()
  );

-- INSERT: Authenticated users can create approval requests for themselves
CREATE POLICY "approvals_insert_policy" ON public.approval_requests
  FOR INSERT
  WITH CHECK (
    requested_by = auth.uid()
  );

-- UPDATE: Only designated approvers can decide on approval requests
CREATE POLICY "approvals_update_policy" ON public.approval_requests
  FOR UPDATE
  USING (
    public.is_manager_or_higher()
  );

-- ----------------------------------------------------------------------------
-- 3. WORKSTATIONS & CLUSTERS POLICIES
-- ----------------------------------------------------------------------------

-- SELECT: All authenticated users can view active workstations & clusters
CREATE POLICY "workstations_select_policy" ON public.workstations
  FOR SELECT
  USING (true);

CREATE POLICY "clusters_select_policy" ON public.clusters
  FOR SELECT
  USING (true);

-- UPDATE: Only Building Managers or Admins can modify workstation status/maintenance
CREATE POLICY "workstations_update_policy" ON public.workstations
  FOR UPDATE
  USING (
    public.is_manager_or_higher()
  );

-- ----------------------------------------------------------------------------
-- 4. NOTIFICATIONS POLICIES
-- ----------------------------------------------------------------------------

-- SELECT & UPDATE: Users can only see and mark read their own notifications
CREATE POLICY "notifications_owner_policy" ON public.notifications
  FOR ALL
  USING (
    user_id = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- 5. AUDIT LOGS POLICIES
-- ----------------------------------------------------------------------------

-- SELECT: Only Governance Managers & Admins can read audit logs
CREATE POLICY "audit_logs_select_policy" ON public.audit_logs
  FOR SELECT
  USING (
    public.is_manager_or_higher()
  );

-- INSERT: Authenticated system actions can append audit events
CREATE POLICY "audit_logs_insert_policy" ON public.audit_logs
  FOR INSERT
  WITH CHECK (
    actor_id = auth.uid() OR actor_id IS NULL
  );

-- NO UPDATE/DELETE ON AUDIT LOGS (Immutable audit trail)
