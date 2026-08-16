
-- SettingsRepository.getSettings()/updateSettings() were written against a `raw_config` jsonb
-- column (and several other columns: booking_window_days, min_reservation_minutes,
-- max_reservation_minutes, max_reservations_per_day/week, bypass_roles, allow_weekend_booking,
-- allow_holiday_booking, config_version) that never existed on this table. Every settings
-- update has therefore always failed outright (PostgREST rejects unknown columns in the
-- payload), and every read always fell through to hardcoded defaults (raw_config was always
-- undefined -> `{}`). This is the actual root cause behind "settings changes don't stick" --
-- confirmed by comparing the live column list to what the repository code references.
--
-- Fix: add the one column the design actually needs (raw_config) to hold every settings field
-- that doesn't have (and doesn't need) its own typed column. The repository code is being
-- updated in the same change to only write to columns that really exist.
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS raw_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- No INSERT policy existed for settings (only SELECT + UPDATE) -- add one for admin roles as a
-- safety net (there's normally exactly one settings row so this rarely triggers, but the code
-- path exists).
CREATE POLICY p_settings_admin_insert ON public.settings FOR INSERT WITH CHECK (
  has_role(ARRAY['SUPER_ADMIN','ADMIN','IT_ADMIN'])
);
