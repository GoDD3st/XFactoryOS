import { Request, Response, NextFunction } from 'express';
import { supabase } from '@/database/client';
import { UserRole } from '@/frontend/src/types';

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
  director: { id: 'usr-dir-1', email: 'directeur.safi@ocpgroup.ma', full_name: 'Dr. Hassan Alami', department: 'Direction Générale OCP Safi' },
  admin: { id: 'usr-admin-1', email: 'admin.xfactory@ocpgroup.ma', full_name: 'Omar Bennani', department: "Systèmes d'Information & XFactory" },
  super_admin: { id: 'usr-sa-1', email: 'superadmin@ocpgroup.ma', full_name: 'Amine Benchekroun', department: 'Architecte Enterprise & Cloud' },
  it_admin: { id: 'usr-it-1', email: 'it.infrastructure@ocpgroup.ma', full_name: 'Reda Laraki', department: 'IT Infrastructure & Support' },
  security_guard: { id: 'usr-sec-1', email: 'securite.port@ocpgroup.ma', full_name: 'Tariq Kadiri', department: 'Sûreté Industrielle & Contrôle Accès' },
};

export async function authenticateJWT(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Skip public routes
  console.log('🔥 AUTH MIDDLEWARE HIT');

    
  const path = req.path || req.originalUrl;
  if (PUBLIC_ROUTES.some(route => path.startsWith(route))) {
    return next();
  }

  // ── DEMO MODE ──
  if (DEMO_MODE) {
    const demoRole = (req.headers['x-demo-role'] as UserRole) || 'collaborator';
    const demoUser = DEMO_USERS[demoRole] || DEMO_USERS.collaborator;
    req.user = {
      id: demoUser.id,
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

  const token = authHeader.substring(7); // Remove "Bearer "

  try {
    // Verify token with Supabase (network call — no JWT secret needed)
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({
        status: 'error',
        code: 'AUTH_INVALID',
        message: 'Token invalide ou expiré. Veuillez vous reconnecter.',
      });
      return;
    }

    // Fetch user role from the database (users → user_roles → roles)
    const { data: userRoleData } = await supabase
      .from('user_roles')
      .select('role_id, roles(code)')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    const role: UserRole = (userRoleData as any)?.roles?.code || 'collaborator';

    // Fetch user profile
    const { data: profile } = await supabase
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
