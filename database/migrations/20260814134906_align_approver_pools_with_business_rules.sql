-- Narrows three governance rows that 20260811132256 seeded straight from the SRS §13 matrix,
-- where the matrix contradicts the business rules the rest of the system implements.
--
-- This migration is additive on purpose. 20260811132256 is the authoritative full-matrix
-- definition and re-applies every cell via `on conflict do update`, so a full replay restores
-- the grants below before this file removes them again. Editing that file in place instead
-- would rewrite already-applied history and silently diverge from deployed databases.
--
-- 1. approve_long_duration - BR-06 and the use-case diagram name Executive Assistant and
--    Director as the only long-duration approvers. The matrix's "A" for Administrator
--    contradicts them, and the business rule wins. Super Admin was previously retained as a
--    break-glass approver; that exception is dropped so the approver pool matches BR-06
--    exactly and Super Admin stays purely administrative.
--
-- 2. authorize_cluster_management - BR-09 and the BPMN both scope this decision to GCI Manager
--    and Building Manager. Administrator's "A" and Super Admin's break-glass grant are both
--    removed for the same reason.
--
-- 3. audit_logs - the matrix gives Director "R", but the SRS audit-actors section lists only
--    Super Admin, Security and IT Admin as audit readers. The narrower, more specific
--    statement governs.
--
-- Super Admin intentionally keeps manage_roles (see rbacMiddleware), which is what makes any
-- of this reversible from the UI.

update role_permissions rp
set can_read    = false,
    can_create  = false,
    can_update  = false,
    can_delete  = false,
    can_approve = false
from roles r, permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and (
        (r.code = 'ADMIN'       and p.code in ('approve_long_duration', 'authorize_cluster_management'))
     or (r.code = 'SUPER_ADMIN' and p.code in ('approve_long_duration', 'authorize_cluster_management'))
     or (r.code = 'DIRECTOR'    and p.code = 'audit_logs')
  );
