/**
 * Frontend demo-mode detector.
 *
 * Demo mode is ONLY active when VITE_DEMO_MODE is explicitly set to 'true'.
 * Any other value (including undefined / missing) means real auth mode.
 *
 *   # .env
 *   VITE_DEMO_MODE=true   → Role Switcher shown, no login required
 *   VITE_DEMO_MODE=false  → Role Switcher hidden, real Supabase Auth required
 *
 * IMPORTANT: Vite replaces `import.meta.env.VITE_*` via static analysis at
 * transform time. Dynamic access like `(import.meta as any).env` BREAKS this
 * replacement and the value will always be undefined. We must use the direct
 * static property access `import.meta.env.VITE_DEMO_MODE` for Vite to inject
 * the value correctly.
 */
export function isDemoMode(): boolean {
  // Direct static access - Vite replaces this at transform time
  const value = import.meta.env.VITE_DEMO_MODE;
  return value === 'true';
}
