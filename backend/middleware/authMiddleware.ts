import { Request, Response, NextFunction } from 'express';
import { createUserClient, getAdminClient } from '@/database/serverClient';
import { UserRole } from '@/frontend/src/types';
import { normalizeRoleCode } from '@/frontend/src/modules/auth/utils/normalizeRole';
import { supabase } from '@/database/client';

/**
 * Authentication Middleware - Zero-Trust JWT Verification
 * 
 * Verifies Supabase JWT via supabase.auth.getUser(token).
 * In DEMO_MODE, uses a simulated user from the X-Demo-Role header.
 * 
 * Injects req.user = { id, email, role, full_name, department }
 */



// Routes that bypass authentication entirely
const PUBLIC_ROUTES = [
  '/api/health',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/reset-password',
  // Called by Vercel Cron, which carries no user session. It is NOT unauthenticated: the handler
  // requires `Authorization: Bearer $CRON_SECRET` and refuses to run when CRON_SECRET is unset.
  // Listing it here only skips the JWT check, which would otherwise reject the scheduler outright.
  '/api/cron',
];

const DEMO_MODE = process.env.DEMO_MODE === 'true';

/**
 * Demo mode is a complete authentication bypass: it trusts the X-Demo-Role header and performs no
 * credential check whatsoever, so any caller can present themselves as super_admin. That is
 * acceptable on a throwaway dev deployment and catastrophic anywhere else.
 *
 * Refusing to start is deliberate. A misconfigured production environment that boots and quietly
 * serves an open admin API is far worse than one that fails loudly on deploy, and an env var set
 * wrongly is exactly the mistake this is guarding against - `false` is one keystroke from `true`.
 */
export function assertDemoModeIsSafe(): void {
  // VERCEL_ENV decides when it is present; NODE_ENV only when it is not.
  //
  // The original test ORed the two, which looks stricter and was in fact broken: Vercel sets
  // NODE_ENV=production on EVERY deployment, previews included. So a preview with DEMO_MODE=true -
  // which is exactly what SETUP.md prescribes for the dev environment - threw here, inside
  // createExpressApp(), which api/index.ts calls at module scope. The function then crashed on
  // cold start and every single route answered 500, including ones that touch nothing. Nothing in
  // the response said why; the reason was only in the function log.
  //
  // Reading VERCEL_ENV first fixes that without loosening the guard where it matters. A real
  // production deployment still reports VERCEL_ENV=production and is still refused, and a
  // self-hosted `NODE_ENV=production` with no VERCEL_ENV is still refused. Only the case the old
  // test could not distinguish - a Vercel preview - is now allowed to run in demo mode, which is
  // the entire point of having a preview environment.
  const vercelEnv = process.env.VERCEL_ENV;
  const isProduction = vercelEnv ? vercelEnv === 'production' : process.env.NODE_ENV === 'production';

  if (DEMO_MODE && isProduction) {
    // Logged as well as thrown: the throw becomes an opaque 500 on every route, and this line is
    // the only thing that tells whoever is reading the logs which of the many possible boot
    // failures they are looking at.
    console.error('[BOOT] REFUS DE DEMARRAGE - DEMO_MODE=true en production.');
    throw new Error(
      'REFUS DE DEMARRAGE : DEMO_MODE=true dans un environnement de production. ' +
        "Le mode demonstration contourne entierement l'authentification (en-tete X-Demo-Role). " +
        'Definissez DEMO_MODE=false et VITE_DEMO_MODE=false, puis reconstruisez.'
    );
  }

  if (DEMO_MODE) {
    console.warn('');
    console.warn('  ******************************************************************');
    console.warn('  *  DEMO_MODE=true - AUTHENTICATION IS DISABLED                   *');
    console.warn('  *  Any caller may set X-Demo-Role and act as any role,           *');
    console.warn('  *  including super_admin. Never expose this deployment.          *');
    console.warn('  ******************************************************************');
    console.warn('');
  }
}

// Demo users mapping (same as authService defaults)
const DEMO_USERS: Record<UserRole, { id: string; email: string; full_name: string; department: string }> = {
  collaborator: { id: 'usr-collab-1', email: 'youssef.elamrani@ocpgroup.ma', full_name: 'Youssef El Amrani', department: 'Digital Factory' },
  receptionist: { id: 'usr-recep-1', email: 'reception.safi@ocpgroup.ma', full_name: 'Khadija Mansour', department: 'Accueil & Services Bâtiment' },
  building_manager: { id: 'usr-bm-1', email: 'facilities.safi@ocpgroup.ma', full_name: 'Mehdi Chraibi', department: 'Facility & Asset Management' },
  gci_manager: { id: 'usr-gci-1', email: 'gci.governance@ocpgroup.ma', full_name: 'Fatima-Zahra Benali', department: 'Gouvernance Chimie & Intégration' },
  executive_assistant: { id: 'usr-ea-1', email: 'direction.assistant@ocpgroup.ma', full_name: 'Sanaa Berrada', department: 'Secrétariat Général & Direction' },
  director: { id: 'usr-dir-1', email: 'directeur.safi@ocpgroup.ma', full_name: 'Dr. Hassan Alami', department: 'Direction Générale' },
  admin: { id: 'usr-admin-1', email: 'admin.xfactory@ocpgroup.ma', full_name: 'Omar Bennani', department: "Systèmes d'Information & XFactory" },
  super_admin: { id: 'usr-sa-1', email: 'superadmin@ocpgroup.ma', full_name: 'Amine Benchekroun', department: 'Architecte Enterprise & Cloud' },
  it_admin: { id: 'usr-it-1', email: 'it.infrastructure@ocpgroup.ma', full_name: 'Reda Laraki', department: 'IT Infrastructure & Support' },
  security_guard: { id: 'usr-sec-1', email: 'securite.port@ocpgroup.ma', full_name: 'Tariq Kadiri', department: 'Sûreté Industrielle & Contrôle Accès' },
};

// App-facing UserRole -> public.roles.code, mirroring ROLE_TO_DB_CODE in userRepository.ts.
const DEMO_ROLE_TO_DB_CODE: Record<UserRole, string> = {
  collaborator: 'EMPLOYEE',
  receptionist: 'RECEPTIONIST',
  building_manager: 'BUILDING_MANAGER',
  gci_manager: 'GCI_MANAGER',
  executive_assistant: 'EXECUTIVE_ASSISTANT',
  director: 'DIRECTOR',
  admin: 'ADMIN',
  super_admin: 'SUPER_ADMIN',
  it_admin: 'IT_ADMIN',
  security_guard: 'SECURITY',
};

/** The real account a demo role maps onto. Both fields describe the SAME row. */
interface ResolvedDemoIdentity {
  id: string;
  email: string;
}

// Cached per role for the process lifetime - `null` means "looked up, none exists", so a missing
// account is not re-queried on every request.
const demoUserCache = new Map<UserRole, ResolvedDemoIdentity | null>();

/**
 * Resolves the real account behind a demo role - id AND email together.
 *
 * The email matters as much as the id. This used to resolve only the id while req.user.email kept
 * the synthetic DEMO_USERS address, so the session described two different accounts at once:
 * writes landed on the real row (by id) while anything keyed on the email hit a non-existent one.
 * That is what broke the settings step-up re-authentication after a password change - the new
 * password was set on the real account via its id, then verified by signing in as
 * "superadmin@ocpgroup.ma" instead of "superadmin.test@ocpgroup.ma", which failed as
 * "Mot de passe incorrect".
 */
async function resolveDemoIdentity(role: UserRole): Promise<ResolvedDemoIdentity | null> {
  if (demoUserCache.has(role)) return demoUserCache.get(role) ?? null;

  let resolved: ResolvedDemoIdentity | null = null;
  try {
    const { getAdminClient } = await import('@/database/serverClient');
    const admin = getAdminClient();
    const code = DEMO_ROLE_TO_DB_CODE[role];

    if (admin && code) {
      // Ordered so the mapping is STABLE: several accounts can share a role (three users hold
      // EMPLOYEE here), and an unordered limit(1) let Postgres return a different one per
      // restart - the demo collaborator would silently "become" a different person and stop
      // seeing its own reservations.
      const { data, error } = await admin
        .from('user_roles')
        // The users embed MUST name its constraint: user_roles has two FKs to users (user_id and
        // granted_by), so a bare `users!inner(email)` is ambiguous and PostgREST rejects the whole
        // query. That left `resolved` null for every role, so demo mode fell back to the synthetic
        // 'usr-collab-1' ids and every uuid-keyed write failed - the exact failure the comment
        // below this block describes. Same trap already fixed in reservationRepository
        // (user_id vs cancelled_by) and waitingListRepository (requested vs offered workstation).
        .select('user_id, granted_at, roles!inner(code), users!user_roles_user_id_fkey!inner(email)')
        .eq('roles.code', code)
        .order('granted_at', { ascending: true })
        .order('user_id', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        // Don't fail silently: this falls back to the synthetic id, which then breaks every
        // uuid-keyed write in demo mode. A bad column name here cost a debugging cycle.
        console.warn(`[DEMO] Could not resolve a real user for role "${role}": ${error.message}`);
      }

      const id = (data as any)?.user_id;
      const email = (data as any)?.users?.email;
      // Both or neither: a half-resolved identity is exactly the inconsistency this fixes.
      resolved = id && email ? { id, email } : null;
    }
  } catch (err: any) {
    console.warn(`[DEMO] Demo user resolution failed for role "${role}":`, err?.message || err);
    resolved = null;
  }

  demoUserCache.set(role, resolved);
  return resolved;
}

/**
 * Establishes WHO is calling. Every /api route passes through here except PUBLIC_ROUTES.
 *
 * Business context: this is the boundary where an anonymous HTTP request becomes a known user.
 * Everything downstream - permission checks, ownership checks, audit attribution - trusts
 * req.user, so this is the only place identity may be decided.
 *
 * Flow:
 *   1. Public route? pass through (see PUBLIC_ROUTES and the note there about full-path matching).
 *   2. DEMO_MODE? resolve a fabricated user from the X-Demo-Role header. Never reachable in
 *      production - assertDemoModeIsSafe refuses to build the app at all.
 *   3. Otherwise require `Authorization: Bearer <token>` and verify it WITH SUPABASE. The
 *      signature is not checked locally; Supabase is asked, so a revoked or expired session is
 *      rejected rather than merely a malformed one.
 *   4. Resolve the user's role FROM THE DATABASE and attach req.user.
 *
 * THE ROLE IS NEVER TAKEN FROM THE REQUEST. Not from a header, not from the body, not from a
 * claim the client can influence. A client that could name its own role would make every
 * permission check downstream decorative.
 *
 * Consequence for new routes: mounting a route outside this middleware means it has no
 * req.user at all, and any code reading req.user!.id there will throw at runtime rather than
 * fail closed. Add routes under /api and let this run.
 */
export async function authenticateJWT(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Full request path, not req.path.
  //
  // This middleware is mounted with app.use('/api', authenticateJWT), and Express strips the
  // mount point before handing the request over - so req.path reads "/cron/sweep" while
  // PUBLIC_ROUTES lists "/api/cron". The startsWith test could therefore never match, and every
  // route in that list was being authenticated anyway.
  //
  // It went unnoticed because of which routes are on the list. /api/health is registered ahead of
  // this middleware and never reaches it, and the /api/auth/* entries are vestigial - the browser
  // signs in against Supabase directly through realAuthService, not through this API. That left
  // /api/cron, where it mattered: the scheduler sends `Authorization: Bearer $CRON_SECRET`, which
  // is not a Supabase JWT, so every sweep was rejected here with 401 before the route's own
  // CRON_SECRET check ever ran. Background jobs were dead on any deployment that relies on them.
  const path = (req.originalUrl || req.url || '').split('?')[0];
  if (PUBLIC_ROUTES.some(route => path.startsWith(route))) {
    return next();
  }

  // ── DEMO MODE - only when explicitly enabled ──
  const isDemo = process.env.DEMO_MODE === 'true';
  if (isDemo) {
    const demoRole = (req.headers['x-demo-role'] as UserRole) || 'collaborator';
    const demoUser = DEMO_USERS[demoRole] || DEMO_USERS.collaborator;

    // DEMO_USERS ids are synthetic strings ('usr-gci-1'). Every table that stores an actor
    // (reservations.user_id, cluster_authorizations.decided_by, approvals...) uses a uuid FK to
    // users, so those writes fail with an invalid-uuid error under demo mode and the feature
    // looks broken when it is not. Resolve the demo role to a real users row when one exists so
    // demo mode can exercise write paths; fall back to the synthetic identity for read-only use.
    const real = await resolveDemoIdentity(demoRole);

    req.user = {
      // id and email must come from the SAME source. Mixing a resolved id with the synthetic
      // email made password-based re-authentication verify a different account than the one the
      // password was actually set on.
      id: real?.id || demoUser.id,
      email: real?.email || demoUser.email,
      role: demoRole,
      full_name: demoUser.full_name,
      department: demoUser.department,
    };
    return next();
  }

  // ── PRODUCTION MODE - Supabase JWT verification ──
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      status: 'error',
      code: 'AUTH_MISSING',
      message: 'Authentification requise. Fournissez un token Bearer valide.',
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({
        status: 'error',
        code: 'AUTH_INVALID',
        message: 'Token invalide ou expiré. Veuillez vous reconnecter.',
      });
      return;
    }

    const db = getAdminClient() || createUserClient(token);

    const { data: userRoleData } = await db
      .from('user_roles')
      .select('role_id, roles(code)')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    const rawCode = (userRoleData as any)?.roles?.code;
    const role: UserRole = normalizeRoleCode(rawCode);

    // Fetch user profile
    const { data: profile } = await db
      .from('users')
      .select('full_name, department')
      .eq('id', user.id)
      .single();

    req.user = {
      id: user.id,
      email: user.email || '',
      role,
      full_name: profile?.full_name || user.email || 'Utilisateur',
      department: profile?.department || '',
    };

    return next();
  } catch (err) {
    console.error('[Auth Middleware] Unexpected error:', err);
    res.status(500).json({
      status: 'error',
      code: 'AUTH_ERROR',
      message: 'Erreur interne d\'authentification.',
    });
    return;
  }
}
