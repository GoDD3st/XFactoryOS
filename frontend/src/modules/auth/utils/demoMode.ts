/**
 * Frontend demo-mode flag.
 *
 * This is intentionally SEPARATE from the backend's `DEMO_MODE` env var
 * (read by `backend/middleware/authMiddleware.ts` via `process.env.DEMO_MODE`).
 * Vite only exposes `VITE_`-prefixed variables to browser code — a plain
 * `DEMO_MODE` in `.env` is invisible here by design, so we use its own key:
 *
 *   # .env (project root)
 *   DEMO_MODE=false        <- read by the Express backend (Node/process.env)
 *   VITE_DEMO_MODE=false   <- read by the browser bundle (this file)
 *
 * Keep the two values in sync manually — they intentionally use different
 * variable names so it's obvious when reading `.env` which runtime reads which.
 *
 * true  -> Role Switcher UI is shown, no login required (current QA/demo flow).
 * false -> Role Switcher is hidden, a real Supabase Auth session is required.
 */
export function isDemoMode(): boolean {
  try {
    const env = (import.meta as any)?.env;
    return env?.VITE_DEMO_MODE === 'true';
  } catch {
    return false;
  }
}
