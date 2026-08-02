-- ============================================================================
-- OCP SA XFactory OS — Settings Schema Extension Migration
-- Adds dynamic reservation constraints & config versioning columns
-- ============================================================================

-- 1. Add extra columns to existing settings table (safe IF NOT EXISTS check pattern)
ALTER TABLE public.settings 
  ADD COLUMN IF NOT EXISTS booking_window_days integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS min_reservation_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS max_reservations_per_day integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_reservations_per_week integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS bypass_roles text[] NOT NULL DEFAULT '{admin,super_admin,director,executive_assistant}',
  ADD COLUMN IF NOT EXISTS allow_weekend_booking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_holiday_booking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS raw_config jsonb DEFAULT '{}'::jsonb;

-- 2. Ensure initial row exists in settings table
INSERT INTO public.settings (
  max_duration_hours_no_approval,
  no_show_window_minutes,
  business_days,
  business_hours_start,
  business_hours_end,
  booking_window_days,
  min_reservation_minutes,
  max_reservations_per_day,
  max_reservations_per_week,
  bypass_roles,
  allow_weekend_booking,
  allow_holiday_booking,
  config_version
) VALUES (
  48,
  30,
  '{1,2,3,4,5}',
  '08:00:00',
  '18:00:00',
  2,
  30,
  2,
  5,
  '{admin,super_admin,director,executive_assistant}',
  false,
  false,
  1
) ON CONFLICT DO NOTHING;
