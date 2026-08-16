-- Seat-specific queuing.
--
-- waiting_list_entries could only ever express "somewhere in this cluster"
-- (preferred_cluster_id). A user watching one specific desk - because it is taken all day and
-- their only way in is the no-show cascade - had nowhere to record that. offered_workstation_id
-- is the seat the queue eventually hands out, which is an outcome, not a request; this is the
-- request side.
--
-- Nullable on purpose: a null target keeps the existing cluster-wide behaviour, so old rows and
-- cluster-level queuing continue to work unchanged.

alter table public.waiting_list_entries
  add column if not exists requested_workstation_id uuid references public.workstations(id) on delete cascade;

comment on column public.waiting_list_entries.requested_workstation_id is
  'Specific desk this entry is queuing for. Null = any desk in preferred_cluster_id.';

-- The FIFO sweep filters by (status, requested seat) on every no-show and every offer expiry.
create index if not exists waiting_list_entries_requested_workstation_idx
  on public.waiting_list_entries (requested_workstation_id, status, fifo_rank)
  where requested_workstation_id is not null;

-- One live entry per user per desk: re-queuing for the same seat should be a no-op, not a way to
-- stack duplicate claims and take several positions in the queue.
create unique index if not exists waiting_list_entries_one_active_per_user_seat
  on public.waiting_list_entries (user_id, requested_workstation_id)
  where requested_workstation_id is not null and status in ('WAITING', 'OFFERED');
