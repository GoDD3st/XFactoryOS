-- One live queue entry per user, per desk, PER DAY.
--
-- waiting_list_entries_one_active_per_user_seat (20260814141136) keyed on
-- (user_id, requested_workstation_id) with no date in it. The intent was "re-queuing for the same
-- seat should be a no-op, not a way to stack duplicate claims" - but with the date left out, the
-- constraint reads as "one live entry per user per desk, ever". A collaborator queued for D-042 on
-- Thursday could not also queue for D-042 on Friday: the second insert hit 23505 and the UI told
-- them they were already registered, which was true only for a different day.
--
-- Queuing for the same desk on two days is two distinct requests - the FIFO sweep already filters
-- by date when it looks for a match (preferenceMatching.ts), so the two entries never compete.
-- What must stay blocked is two live entries for the same desk on the SAME day, which is the
-- double-click / duplicate-claim case the original index was written for.
--
-- Date expression: entries are written as floating local times by
-- waitingListRepository.addEntry (new Date("YYYY-MM-DDTHH:mm:00") in the server's zone) and read
-- back the same way, and the deployed server runs UTC - so UTC is the zone that reproduces the
-- date the application itself shows. `timezone(text, timestamptz)` is IMMUTABLE (provolatile 'i'),
-- which is what makes the expression indexable at all; a bare `requested_start_at::date` is only
-- STABLE and would be rejected.

DROP INDEX IF EXISTS public.waiting_list_entries_one_active_per_user_seat;

CREATE UNIQUE INDEX IF NOT EXISTS waiting_list_entries_one_active_per_user_seat_day
  ON public.waiting_list_entries (
    user_id,
    requested_workstation_id,
    ((requested_start_at AT TIME ZONE 'UTC')::date)
  )
  WHERE requested_workstation_id IS NOT NULL
    AND status IN ('WAITING', 'OFFERED');
