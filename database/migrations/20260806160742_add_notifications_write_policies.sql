
-- notifications had a SELECT-only (owner) policy - no INSERT/UPDATE policy existed at all,
-- so every notification write (FR-75..79: confirmation, reminder, cancellation, approval,
-- no-show) was silently rejected by RLS whenever the write ran through a non-service-role
-- client. The primary fix is server-side callers now using the admin client (see
-- NotificationRepository), but this policy is a safety net for when the service-role key
-- isn't configured and callers fall back to a session-scoped client.
CREATE POLICY p_notifications_insert ON public.notifications FOR INSERT WITH CHECK (
  user_id = auth.uid()
  OR has_role(ARRAY['SUPER_ADMIN','ADMIN','EXECUTIVE_ASSISTANT','DIRECTOR','GCI_MANAGER','BUILDING_MANAGER','RECEPTIONIST','IT_ADMIN'])
);

CREATE POLICY p_notifications_owner_update ON public.notifications FOR UPDATE USING (
  user_id = auth.uid() OR has_role(ARRAY['SUPER_ADMIN','ADMIN'])
);
