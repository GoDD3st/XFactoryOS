-- Audit log access becomes something an administrator grants, not a default.
--
-- audit_logs.can_read was seeded true for BUILDING_MANAGER, GCI_MANAGER, IT_ADMIN and SECURITY,
-- and each of those roles carried an "Audit" tab in RoleShell to match. The decision is that the
-- audit log is an administration surface: Admin and Super Admin hold it by default, and anyone
-- else who needs it is given it deliberately from the Roles & Permissions screen.
--
-- Removing the tab from ROLE_TABS alone would have changed nothing. resolveVisibleTabs treats the
-- baseline as a starting point and ADDS any tab whose permission the policy grants, so with these
-- rows left true the menu entry would have come straight back - and the API would have kept
-- answering regardless, because requirePermission reads this table and not the menu. The tab, the
-- policy row and the route's fallback list have to move together or the change is cosmetic.
--
-- This is a revoke, not a delete: the row stays, flipped to false, so the pairing is still visible
-- in the permissions matrix and an administrator can turn it back on with one click. Deleting the
-- row would leave PermissionService.can() with nothing to answer from, which is a different state
-- entirely - "unknown" rather than "no".

update public.role_permissions rp
set can_read = false
from public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and p.code = 'audit_logs'
  and r.code in ('BUILDING_MANAGER', 'GCI_MANAGER', 'IT_ADMIN', 'SECURITY');
