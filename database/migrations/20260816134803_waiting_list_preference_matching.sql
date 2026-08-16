-- BPMN D5 "Moteur matching - Verifier compatibilite preference".
--
-- Until now the queue was FIFO and nothing else: the first waiting entry for the right date was
-- offered whatever desk came free. D5 requires the desk to be checked against what the person
-- asked for. Two things were missing from storage.
--
-- 1. preferred_attributes - the "zone / equipement" half of a preference. The columns it is
--    matched against already exist on workstations.metadata (near_window, is_pmr, is_quiet_zone),
--    and the same three flags are already the search vocabulary in WorkstationSearchQuery; this
--    gives the waiting list the same vocabulary. Free-text `notes` stays what it is - a note.
--
-- 2. offered_start_at / offered_end_at - the hours an offer is actually good for. requested_*
--    is what the person asked for; the desk may only be free for part of it. acceptOffer used to
--    book the full requested slot, so accepting an offer on a desk freed 14:00-18:00 by someone
--    queued 08:00-18:00 created a reservation over hours the desk was still occupied.

ALTER TABLE public.waiting_list_entries
  ADD COLUMN IF NOT EXISTS preferred_attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS offered_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS offered_end_at timestamptz;

COMMENT ON COLUMN public.waiting_list_entries.preferred_attributes IS
  'BPMN D5 zone/equipement preferences, matched against workstations.metadata. Keys: nearWindow, isPMR, isQuietZone. Only true constrains; absent/false means no opinion.';

COMMENT ON COLUMN public.waiting_list_entries.offered_start_at IS
  'Start of the window this offer is good for = requested window intersected with the freed desk''s free hours. Null until an offer is made.';

COMMENT ON COLUMN public.waiting_list_entries.offered_end_at IS
  'End of the window this offer is good for. See offered_start_at.';

-- An offer either has both ends of its window or neither.
ALTER TABLE public.waiting_list_entries
  DROP CONSTRAINT IF EXISTS waiting_list_offered_window_complete;
ALTER TABLE public.waiting_list_entries
  ADD CONSTRAINT waiting_list_offered_window_complete CHECK (
    (offered_start_at IS NULL AND offered_end_at IS NULL)
    OR (offered_start_at IS NOT NULL AND offered_end_at IS NOT NULL AND offered_end_at > offered_start_at)
  );
