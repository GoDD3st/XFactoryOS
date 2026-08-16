
-- workstations/clusters only had a public SELECT policy - no write policy existed, so any
-- write path that isn't the true service-role client (e.g. SUPABASE_SERVICE_ROLE_KEY unset,
-- falling back to a user-JWT-scoped client) silently updated zero rows under RLS.
-- Matrix RBAC §13 "Gérer postes"/"Gérer clusters": Super Admin/Admin = CRUD, Building/GCI Manager = RU.
CREATE POLICY p_workstations_admin_write ON public.workstations FOR UPDATE
  USING (has_role(ARRAY['SUPER_ADMIN','ADMIN','BUILDING_MANAGER','GCI_MANAGER']))
  WITH CHECK (has_role(ARRAY['SUPER_ADMIN','ADMIN','BUILDING_MANAGER','GCI_MANAGER']));

CREATE POLICY p_workstations_admin_insert_delete ON public.workstations FOR INSERT
  WITH CHECK (has_role(ARRAY['SUPER_ADMIN','ADMIN']));

CREATE POLICY p_workstations_admin_delete ON public.workstations FOR DELETE
  USING (has_role(ARRAY['SUPER_ADMIN','ADMIN']));

CREATE POLICY p_clusters_admin_write ON public.clusters FOR UPDATE
  USING (has_role(ARRAY['SUPER_ADMIN','ADMIN','BUILDING_MANAGER','GCI_MANAGER']))
  WITH CHECK (has_role(ARRAY['SUPER_ADMIN','ADMIN','BUILDING_MANAGER','GCI_MANAGER']));

CREATE POLICY p_clusters_admin_insert_delete ON public.clusters FOR INSERT
  WITH CHECK (has_role(ARRAY['SUPER_ADMIN','ADMIN']));

CREATE POLICY p_clusters_admin_delete ON public.clusters FOR DELETE
  USING (has_role(ARRAY['SUPER_ADMIN','ADMIN']));
