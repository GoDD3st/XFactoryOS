
-- Matrix RBAC §13 "Gérer utilisateurs": Building Manager/GCI Manager/IT Admin = R (read-only),
-- in addition to Super Admin/Admin's existing CRUD (p_users_admin_all). Only Super Admin/Admin
-- and self were covered before; the backend route was also missing IT Admin in its role check.
CREATE POLICY p_users_ops_read ON public.users FOR SELECT USING (
  has_role(ARRAY['BUILDING_MANAGER','GCI_MANAGER','IT_ADMIN'])
);
