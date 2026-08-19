-- Site-wide occupancy analytics were readable by every signed-in account, and three trigger
-- functions were reachable as RPCs.
--
-- PART 1 - mv_reservation_daily_stats
--
-- `analytics` is a permission. /api/telemetry/* checks it (backend/routes/telemetry.routes.ts), so
-- a Collaborator cannot ask the API for occupancy, no-show or cancellation figures. But the same
-- numbers were sitting in a materialized view that `authenticated` held SELECT on, one
-- GET /rest/v1/mv_reservation_daily_stats away from anyone holding any valid session.
--
-- The usual defence does not apply here. This relation is a MATERIALIZED VIEW (relkind 'm'), and
-- materialized views ignore RLS entirely - there is no policy to write, and ALTER ... ENABLE ROW
-- LEVEL SECURITY is not accepted on one. Table privileges are the only lever, so the grant itself
-- has to go.
--
-- 20260806160035 already saw half of this and revoked SELECT from `anon`. It stopped there, but
-- the leak was never really about anonymous visitors: the whole point of the analytics permission
-- is that having an account is not the same as being allowed to see the building's aggregate
-- behaviour. `authenticated` is exactly the role that permission is meant to constrain.
--
-- The revoke is ALL PRIVILEGES rather than just SELECT because the leftover bits are not inert.
-- Both roles retained MAINTAIN ('m', PostgreSQL 17), which permits REFRESH MATERIALIZED VIEW - an
-- unauthenticated CPU-burn vector that re-aggregates the reservation history on demand, as often
-- as it is asked to. INSERT/UPDATE/DELETE on a matview are refused by the executor regardless, so
-- dropping them costs nothing and leaves an ACL that states the intent plainly.
--
-- Nothing reads this view. No application query references it (the only repository-wide match is
-- the 20260806160035 hardening migration), and pg_depend/pg_rewrite reports no dependent view,
-- function body or policy expression. When telemetry is eventually served from it, it should be
-- through the service-role client behind the `analytics` check, never by direct PostgREST access.

REVOKE ALL PRIVILEGES ON public.mv_reservation_daily_stats FROM anon;
REVOKE ALL PRIVILEGES ON public.mv_reservation_daily_stats FROM authenticated;

COMMENT ON MATERIALIZED VIEW public.mv_reservation_daily_stats IS
  'Aggregate occupancy/no-show/cancellation stats. Materialized views ignore RLS, so access is controlled by GRANT alone: service_role only. Do not grant to anon or authenticated - reads belong behind the `analytics` permission on /api/telemetry/*.';

-- PART 2 - trigger functions exposed as RPCs
--
-- handle_new_auth_user(), restrict_signup_domain() and late_checkin_owner_matches() are all
-- SECURITY DEFINER and all carried the default PUBLIC execute grant (proacl was null), which is
-- what made them show up as anon-callable through /rest/v1/rpc/.
--
-- All three are trigger functions and nothing else - verified against pg_trigger:
--   restrict_signup_domain()       BEFORE INSERT ON auth.users              (enforce_email_domain)
--   handle_new_auth_user()         AFTER INSERT ON auth.users               (on_auth_user_created)
--   late_checkin_owner_matches()   BEFORE INSERT ON late_check_in_requests  (trg_late_checkin_owner_matches)
--
-- They return type `trigger`, so a direct RPC call fails on its own ("trigger functions can only
-- be called as triggers") and the practical exposure was already close to nil. The grant is still
-- wrong to leave in place: it is EXECUTE handed to the public internet on three SECURITY DEFINER
-- routines whose bodies mutate users, roles and check-in ownership, and it only stays harmless for
-- as long as nobody refactors the shared logic out into a callable helper.
--
-- Revoking is safe because PostgreSQL checks EXECUTE on a trigger function at CREATE TRIGGER time,
-- not on each fire - existing triggers keep working no matter who holds the grant. The revoke is
-- FROM PUBLIC, not FROM anon: with a null ACL neither role has a grant of its own to remove, so
-- revoking from them by name would materialize the default ACL and leave PUBLIC - and therefore
-- both roles - still holding EXECUTE. The explicit grants back to the owner and the service/auth
-- roles are belt-and-braces for the paths that legitimately touch these.

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restrict_signup_domain() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.late_checkin_owner_matches() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO postgres, service_role, supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.restrict_signup_domain() TO postgres, service_role, supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.late_checkin_owner_matches() TO postgres, service_role;

-- DELIBERATELY NOT TOUCHED - public.has_role(text[])
--
-- has_role() was flagged alongside the three above and is the one that must keep its PUBLIC grant.
-- It is the backbone of this schema's RLS: 37 policies across 16 tables call it, including
-- p_reservations_owner_read, p_users_admin_all and p_user_roles_self. A function invoked from a
-- policy expression is permission-checked against the CALLING role, so revoking EXECUTE from
-- `authenticated` would not tighten anything - it would make every one of those policies raise
-- "permission denied for function has_role" and lock the entire application out of its own data.
--
-- Nor is it worth revoking from `anon` alone. The body filters on `ur.user_id = auth.uid()` and
-- returns nothing but a boolean about the caller's own roles; with no JWT, auth.uid() is null and
-- the answer is always false. It cannot be used to probe another user's roles or to enumerate
-- anything. Meanwhile several of the policies that call it are declared TO public, so an anon
-- request against those tables evaluates has_role() as part of being correctly denied - removing
-- the grant would turn a clean empty result into a hard error on paths that are already secure.
--
-- Being callable by anon is the intended design here, not the bug.
