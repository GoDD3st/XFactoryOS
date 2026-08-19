
-- The application's approval-request flow needs to persist the requester's free-text
-- justification (BR-05/06, BPMN D2), but no column existed for it - ApprovalRepository was
-- inserting a `reason`/`objective` field that PostgREST rejected as an unknown column,
-- silently failing every approval-request insert.
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS objective text;

-- No INSERT policy existed at all for approval_requests -> every write was also blocked by RLS
-- (independently of the schema mismatch above) whenever it ran through a non-service-role
-- client. A requester can create their own approval request; approvers/admins can create on
-- behalf of others (e.g. reception booking for someone).
CREATE POLICY p_approvals_insert ON public.approval_requests FOR INSERT WITH CHECK (
  requested_by = auth.uid()
  OR has_role(ARRAY['SUPER_ADMIN','ADMIN','EXECUTIVE_ASSISTANT','DIRECTOR','GCI_MANAGER','BUILDING_MANAGER','RECEPTIONIST'])
);
