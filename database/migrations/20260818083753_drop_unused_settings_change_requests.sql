-- Drops public.settings_change_requests.
--
-- Checked before removing, because "unused" is easy to get wrong:
--   * 0 rows;
--   * no code reference anywhere in backend/, services/, database/ or frontend/ - the only trace
--     in the repo is the RLS policy that 20260806160035 added defensively over every table;
--   * absent from the SRS data dictionary (section 19 lists `settings`, not this) and absent
--     from the BPMN.
--
-- It appears to be an early sketch of an approval workflow for settings changes. That need was
-- met differently: sensitive settings writes go through step-up re-authentication
-- (SettingsService.confirmWithPassword) rather than a queued request.
--
-- Deliberately NOT dropped in the same pass: public.digital_twin_objects. It is also empty and
-- also unreferenced, but the SRS requires it - section 19 lists it as "Mapping SVG / Liaison
-- visuel-donnee" and section 20 states "Les objets SVG doivent etre mappes a la base via
-- digital_twin_objects". It is specified-but-unimplemented (the Twin currently hardcodes
-- workstations.svg_position), so the table stays for that work.

DROP TABLE IF EXISTS public.settings_change_requests;
