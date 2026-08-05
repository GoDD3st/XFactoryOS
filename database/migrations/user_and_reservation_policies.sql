-- Allow authenticated users to manage their own profile row (required for reservations FK)
-- Run this in Supabase SQL Editor if user profile creation fails on first login.

CREATE POLICY IF NOT EXISTS "users_select_all_authenticated" ON public.users
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY IF NOT EXISTS "users_insert_own" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY IF NOT EXISTS "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Reservations: allow authenticated users to read their own rows (if policy missing)
CREATE POLICY IF NOT EXISTS "reservations_insert_own" ON public.reservations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "reservations_select_own" ON public.reservations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
