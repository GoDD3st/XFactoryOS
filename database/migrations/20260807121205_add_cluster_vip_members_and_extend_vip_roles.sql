
-- Extend clusters UPDATE policy to let Director/Executive Assistant toggle VIP status too
drop policy if exists p_clusters_admin_write on public.clusters;
create policy p_clusters_admin_write on public.clusters
  for update
  using (has_role(array['SUPER_ADMIN','ADMIN','BUILDING_MANAGER','GCI_MANAGER','DIRECTOR','EXECUTIVE_ASSISTANT']))
  with check (has_role(array['SUPER_ADMIN','ADMIN','BUILDING_MANAGER','GCI_MANAGER','DIRECTOR','EXECUTIVE_ASSISTANT']));

-- Extend workstations INSERT policy so Director/EA can add extension seats too (DELETE stays Super Admin/Admin only)
drop policy if exists p_workstations_admin_insert_delete on public.workstations;
create policy p_workstations_admin_insert_delete on public.workstations
  for insert
  with check (has_role(array['SUPER_ADMIN','ADMIN','DIRECTOR','EXECUTIVE_ASSISTANT']));

-- New table: explicit per-user allowlist for a VIP-locked cluster
create table public.cluster_vip_members (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  assigned_by uuid references public.users(id),
  assigned_at timestamptz not null default now(),
  unique (cluster_id, user_id)
);

alter table public.cluster_vip_members enable row level security;

create policy p_cluster_vip_members_read on public.cluster_vip_members
  for select
  using (
    user_id = auth.uid()
    or has_role(array['SUPER_ADMIN','ADMIN','DIRECTOR','EXECUTIVE_ASSISTANT','BUILDING_MANAGER','GCI_MANAGER'])
  );

create policy p_cluster_vip_members_write on public.cluster_vip_members
  for all
  using (has_role(array['SUPER_ADMIN','ADMIN','DIRECTOR','EXECUTIVE_ASSISTANT']))
  with check (has_role(array['SUPER_ADMIN','ADMIN','DIRECTOR','EXECUTIVE_ASSISTANT']));

create index idx_cluster_vip_members_cluster on public.cluster_vip_members(cluster_id);
create index idx_cluster_vip_members_user on public.cluster_vip_members(user_id);
