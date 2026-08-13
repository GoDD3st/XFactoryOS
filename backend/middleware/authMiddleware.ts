import { Request, Response, NextFunction } from 'express';
import { createUserClient, getAdminClient } from '@/database/serverClient';
import { UserRole } from '@/frontend/src/types';
import { normalizeRoleCode } from '@/frontend/src/modules/auth/utils/normalizeRole';
import { supabase } from '@/database/client';

/**
 * Authentication Middleware — Zero-Trust JWT Verification
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
];

const DEMO_MODE = process.env.DEMO_MODE === 'true';

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

// Cached per role for the process lifetime — `null` means "looked up, none exists", so a missing
// account is not re-queried on every request.
const demoUserIdCache = new Map<UserRole, string | null>();

async function resolveDemoUserId(role: UserRole): Promise<string | null> {
  if (demoUserIdCache.has(role)) return demoUserIdCache.get(role) ?? null;

  let resolved: string | null = null;
  try {
    const { getAdminClient } = await import('@/database/serverClient');
    const admin = getAdminClient();
    const code = DEMO_ROLE_TO_DB_CODE[role];

    if (admin && code) {
      // Ordered so the mapping is STABLE: several accounts can share a role (three users hold
      // EMPLOYEE here), and an unordered limit(1) let Postgres return a different one per
      // restart — the demo collaborator would silently "become" a different person and stop
      // seeing its own reservations.
      const { data, error } = await admin
        .from('user_roles')
        .select('user_id, granted_at, roles!inner(code)')
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
      resolved = (data as any)?.user_id ?? null;
    }
  } catch (err: any) {
    console.warn(`[DEMO] Demo user resolution failed for role "${role}":`, err?.message || err);
    resolved = null;
  }

  demoUserIdCache.set(role, resolved);
  return resolved;
}

export async function authenticateJWT(req: Request, res: Response, next: NextFunction): Promise<void> {
  const path = req.path || req.originalUrl;
  if (PUBLIC_ROUTES.some(route => path.startsWith(route))) {
    return next();
  }

  // ── DEMO MODE — only when explicitly enabled ──
  const isDemo = process.env.DEMO_MODE === 'true';
  if (isDemo) {
    const demoRole = (req.headers['x-demo-role'] as UserRole) || 'collaborator';
    const demoUser = DEMO_USERS[demoRole] || DEMO_USERS.collaborator;

    // DEMO_USERS ids are synthetic strings ('usr-gci-1'). Every table that stores an actor
    // (reservations.user_id, cluster_authorizations.decided_by, approvals…) uses a uuid FK to
    // users, so those writes fail with an invalid-uuid error under demo mode and the feature
    // looks broken when it is not. Resolve the demo role to a real users row when one exists so
    // demo mode can exercise write paths; fall back to the synthetic id for read-only use.
    const realId = await resolveDemoUserId(demoRole);

    req.user = {
      id: realId || demoUser.id,
      email: demoUser.email,
      role: demoRole,
      full_name: demoUser.full_name,
      department: demoUser.department,
    };
    return next();
  }

  // ── PRODUCTION MODE — Supabase JWT verification ──
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
