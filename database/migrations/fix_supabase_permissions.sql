-- ============================================================================
-- XFactory OS — Fix "permission denied for table reservations"
-- Run this ONCE in Supabase → SQL Editor
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;

DROP POLICY IF EXISTS "users_select_all_authenticated" ON public.users;
CREATE POLICY "users_select_all_authenticated" ON public.users
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "users_insert_own" ON public.users;
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "reservations_insert_own" ON public.reservations;
CREATE POLICY "reservations_insert_own" ON public.reservations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "reservations_select_own" ON public.reservations;
CREATE POLICY "reservations_select_all" ON public.reservations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "reservations_update_own" ON public.reservations;
CREATE POLICY "reservations_update_own" ON public.reservations
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "workstations_anon_select" ON public.workstations;
CREATE POLICY "workstations_anon_select" ON public.workstations
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "clusters_anon_select" ON public.clusters;
CREATE POLICY "clusters_anon_select" ON public.clusters
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "audit_logs_insert_authenticated" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_authenticated" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "notifications_insert_system" ON public.notifications;
CREATE POLICY "notifications_insert_system" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "waiting_list_insert_own" ON public.waiting_list_entries;
CREATE POLICY "waiting_list_insert_own" ON public.waiting_list_entries
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "waiting_list_select_own" ON public.waiting_list_entries;
CREATE POLICY "waiting_list_select_own" ON public.waiting_list_entries
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "check_events_insert" ON public.check_events;
CREATE POLICY "check_events_insert" ON public.check_events
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "check_events_select" ON public.check_events;
CREATE POLICY "check_events_select" ON public.check_events
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "approvals_insert_own" ON public.approval_requests;
CREATE POLICY "approvals_insert_own" ON public.approval_requests
  FOR INSERT TO authenticated WITH CHECK (requested_by = auth.uid());

DROP POLICY IF EXISTS "approvals_select_own" ON public.approval_requests;
CREATE POLICY "approvals_select_own" ON public.approval_requests
  FOR SELECT TO authenticated USING (requested_by = auth.uid());

DROP POLICY IF EXISTS "ai_interactions_insert_own" ON public.ai_interactions;
CREATE POLICY "ai_interactions_insert_own" ON public.ai_interactions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
