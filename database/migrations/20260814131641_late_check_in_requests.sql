-- Late check-in requests (SRS check-in workflow extension).
-- A user with a valid reservation who forgot the QR check-in asks a manager to grant it.
-- Modelled on cluster_authorizations, which is the existing request/approve precedent.

create type late_check_in_status as enum ('PENDING', 'APPROVED', 'REJECTED');

create table public.late_check_in_requests (
  id                uuid primary key default gen_random_uuid(),
  reservation_id    uuid not null references public.reservations(id) on delete cascade,
  -- Denormalised owner so RLS can check ownership without joining reservations.
  -- Kept honest by the trigger below, which refuses a mismatch.
  user_id           uuid not null references public.users(id),
  justification     text not null check (length(btrim(justification)) >= 10),
  status            late_check_in_status not null default 'PENDING',
  reviewed_by       uuid references public.users(id),
  reviewed_at       timestamptz,
  reviewer_comment  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- A decided request must carry its reviewer and timestamp; a pending one must not.
  constraint late_checkin_review_complete check (
    (status = 'PENDING'  and reviewed_by is null and reviewed_at is null) or
    (status <> 'PENDING' and reviewed_by is not null and reviewed_at is not null)
  ),
  -- Nobody may approve or reject their own request.
  constraint late_checkin_no_self_review check (reviewed_by is null or reviewed_by <> user_id)
);

-- At most one open request per reservation. Partial, so a rejected request can be re-submitted.
create unique index late_checkin_one_pending_per_reservation
  on public.late_check_in_requests (reservation_id)
  where status = 'PENDING';

create index late_checkin_status_idx on public.late_check_in_requests (status, created_at desc);
create index late_checkin_user_idx   on public.late_check_in_requests (user_id);

create trigger trg_late_checkin_updated_at
  before update on public.late_check_in_requests
  for each row execute function public.set_updated_at();

-- The request must belong to the reservation's owner: prevents requesting a late check-in for
-- somebody else's booking even if the API layer were bypassed.
create or replace function public.late_checkin_owner_matches()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select r.user_id into owner from public.reservations r where r.id = new.reservation_id;
  if owner is null then
    raise exception 'Reservation % introuvable', new.reservation_id;
  end if;
  if owner <> new.user_id then
    raise exception 'La demande doit appartenir au titulaire de la reservation';
  end if;
  return new;
end $$;

create trigger trg_late_checkin_owner_matches
  before insert on public.late_check_in_requests
  for each row execute function public.late_checkin_owner_matches();

alter table public.late_check_in_requests enable row level security;

-- Requester sees its own; reviewers see everything.
create policy p_late_checkin_read on public.late_check_in_requests
  for select using (
    user_id = auth.uid()
    or has_role(array['SUPER_ADMIN', 'ADMIN', 'BUILDING_MANAGER'])
  );

-- Only the owner may open a request, and only for a reservation that is actually theirs.
create policy p_late_checkin_insert on public.late_check_in_requests
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.reservations r
      where r.id = reservation_id and r.user_id = auth.uid()
    )
  );

-- Deciding is restricted to the three reviewer roles at the database level, not just the UI.
create policy p_late_checkin_decide on public.late_check_in_requests
  for update using (
    has_role(array['SUPER_ADMIN', 'ADMIN', 'BUILDING_MANAGER'])
  );

comment on table public.late_check_in_requests is
  'Late check-in requests: a reservation holder who missed the QR check-in asks BUILDING_MANAGER/ADMIN/SUPER_ADMIN to grant it. Approval routes through the normal check-in path and is recorded in check_events.metadata with origin=LATE_CHECK_IN.';
