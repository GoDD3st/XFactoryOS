-- The audit trail was writable by anyone.
--
-- p_audit_insert was `FOR INSERT TO public WITH CHECK (true)`. `public` includes the `anon` role,
-- and the anon key is published in the browser bundle by design, so any visitor - with no account
-- and no session - could POST arbitrary rows straight to PostgREST. Verified against this project
-- on 2026-08-18: an unauthenticated client successfully inserted an APPROVE entry attributed to a
-- named director.
--
-- Three consequences, all defeating SRS section 26 traceability:
--   * entries can be FORGED, attributing any action to any person or role;
--   * the table can be FLOODED, burying genuine records and inflating storage;
--   * a client that is trusted to write its own trail can equally choose not to.
--
-- Audit writes now belong to the server alone. AuditRepository resolves the service-role client
-- server-side, and service_role bypasses RLS, so legitimate logging is unaffected. Browser code
-- must go through POST /api/audit, which derives actor_id, actor_name and actor_role from the
-- verified JWT and ignores whatever the body claims.
--
-- Read access is unchanged: p_audit_read already limits SELECT to SUPER_ADMIN, SECURITY and
-- IT_ADMIN, and that was verified as correctly closed to anon.

DROP POLICY IF EXISTS p_audit_insert ON public.audit_logs;

-- No permissive INSERT policy for `public` is created in its place. With RLS enabled and no
-- matching policy, anon and authenticated are denied by default; service_role bypasses RLS.
REVOKE INSERT ON public.audit_logs FROM anon;
REVOKE INSERT ON public.audit_logs FROM authenticated;

COMMENT ON TABLE public.audit_logs IS
  'Append-only audit trail. Writes are server-side only (service_role); browser code must use POST /api/audit, which takes the actor from the JWT. Do not add a permissive INSERT policy for anon/authenticated.';
