
-- Reference/config tables with RLS enabled but zero policies (default-deny) - add public read.
CREATE POLICY p_buildings_read ON public.buildings FOR SELECT USING (true);
CREATE POLICY p_floors_read ON public.floors FOR SELECT USING (true);
CREATE POLICY p_permissions_read ON public.permissions FOR SELECT USING (true);
CREATE POLICY p_role_permissions_read ON public.role_permissions FOR SELECT USING (true);

CREATE POLICY p_permissions_admin_write ON public.permissions FOR ALL
  USING (has_role(ARRAY['SUPER_ADMIN','ADMIN']))
  WITH CHECK (has_role(ARRAY['SUPER_ADMIN','ADMIN']));

CREATE POLICY p_role_permissions_admin_write ON public.role_permissions FOR ALL
  USING (has_role(ARRAY['SUPER_ADMIN','ADMIN']))
  WITH CHECK (has_role(ARRAY['SUPER_ADMIN','ADMIN']));

-- check_events: no policies existed -> check-in/out event writes/reads were blocked for any
-- non-service-role caller. Owner (actor) or ops roles can read; owner or reception/admin can insert.
CREATE POLICY p_check_events_read ON public.check_events FOR SELECT USING (
  actor_id = auth.uid() OR has_role(ARRAY['SUPER_ADMIN','ADMIN','BUILDING_MANAGER','GCI_MANAGER','RECEPTIONIST'])
);
CREATE POLICY p_check_events_insert ON public.check_events FOR INSERT WITH CHECK (
  actor_id = auth.uid() OR has_role(ARRAY['SUPER_ADMIN','ADMIN','RECEPTIONIST'])
);

-- cluster_authorizations: BR-09 workflow (CL-F/CL-G unlock requests) was fully blocked at the DB layer.
CREATE POLICY p_cluster_auth_read ON public.cluster_authorizations FOR SELECT USING (
  requested_by = auth.uid() OR has_role(ARRAY['SUPER_ADMIN','ADMIN','GCI_MANAGER','BUILDING_MANAGER'])
);
CREATE POLICY p_cluster_auth_insert ON public.cluster_authorizations FOR INSERT WITH CHECK (
  requested_by = auth.uid()
);
CREATE POLICY p_cluster_auth_decide ON public.cluster_authorizations FOR UPDATE USING (
  has_role(ARRAY['SUPER_ADMIN','ADMIN','GCI_MANAGER','BUILDING_MANAGER'])
);

-- waiting_list_entries: FR-68/69 FIFO waiting list was fully blocked at the DB layer.
CREATE POLICY p_waiting_list_read ON public.waiting_list_entries FOR SELECT USING (
  user_id = auth.uid() OR has_role(ARRAY['SUPER_ADMIN','ADMIN','BUILDING_MANAGER','GCI_MANAGER','RECEPTIONIST'])
);
CREATE POLICY p_waiting_list_insert ON public.waiting_list_entries FOR INSERT WITH CHECK (
  user_id = auth.uid() OR has_role(ARRAY['SUPER_ADMIN','ADMIN','RECEPTIONIST'])
);
CREATE POLICY p_waiting_list_update ON public.waiting_list_entries FOR UPDATE USING (
  user_id = auth.uid() OR has_role(ARRAY['SUPER_ADMIN','ADMIN','RECEPTIONIST'])
);

-- ai_interactions: AI assistant logging was fully blocked at the DB layer.
CREATE POLICY p_ai_interactions_read ON public.ai_interactions FOR SELECT USING (
  user_id = auth.uid() OR has_role(ARRAY['SUPER_ADMIN','ADMIN','IT_ADMIN'])
);
CREATE POLICY p_ai_interactions_insert ON public.ai_interactions FOR INSERT WITH CHECK (
  user_id = auth.uid()
);

-- settings_change_requests: existing policy compared role code against lowercase 'super_admin',
-- but all seeded role codes are uppercase ('SUPER_ADMIN') -> the policy never matched anyone,
-- silently blocking the OTP settings-change flow for real (non-service-role) super admins.
DROP POLICY IF EXISTS super_admin_full_access ON public.settings_change_requests;
CREATE POLICY p_settings_change_requests_admin ON public.settings_change_requests FOR ALL
  USING (has_role(ARRAY['SUPER_ADMIN','ADMIN']))
  WITH CHECK (has_role(ARRAY['SUPER_ADMIN','ADMIN']));

-- Hardening: v_occupancy_current was flagged SECURITY DEFINER (ERROR-level advisor), bypassing the
-- querying user's RLS on its underlying tables. Both underlying tables already have public SELECT
-- policies, so this is a no-op behaviorally and just closes the advisor finding.
ALTER VIEW public.v_occupancy_current SET (security_invoker = true);

-- Hardening: pin search_path on SECURITY DEFINER / trigger functions (mutable search_path warning).
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.has_role(text[]) SET search_path = public;
ALTER FUNCTION public.restrict_signup_domain() SET search_path = public;
ALTER FUNCTION public.handle_new_auth_user() SET search_path = public;

-- Hardening: mv_reservation_daily_stats (occupancy/no-show/cancellation counts) was readable by
-- unauthenticated anon role via the Data API.
REVOKE SELECT ON public.mv_reservation_daily_stats FROM anon;
