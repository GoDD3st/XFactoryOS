ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS check_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_out_at timestamptz;
