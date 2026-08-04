import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserRole, UserProfile, RoleConfig } from '../../../types';
import { LOCAL_STORAGE_ROLE_KEY, supabase } from '@/services/supabase/supabaseClient';
import { ROLE_CONFIGS, DEFAULT_USERS_BY_ROLE, AuthService } from '@/services/auth/authService';
import { isDemoMode } from '../utils/demoMode';
import { fetchRealUserProfile, signOut as realSignOut } from '../services/realAuthService';

export { ROLE_CONFIGS, DEFAULT_USERS_BY_ROLE };

interface AuthContextType {
  currentUser: UserProfile;
  currentRole: UserRole;
  roleConfig: RoleConfig;
  switchRole: (role: UserRole) => void;
  isAdminOrSuperAdmin: boolean;
  canView8Postes: boolean;
  /** true when running with the QA Role Switcher (VITE_DEMO_MODE=true), false when gated by real Supabase Auth */
  isDemoMode: boolean;
  /** false while the initial Supabase session check is still in flight (real mode only) */
  authLoading: boolean;
  /** true once a real user is signed in (always true in demo mode) */
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 🛡️ Global Fetch Interceptor to inject X-Demo-Role header into all API calls in demo mode
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    if (!isDemoMode()) return originalFetch(input, init);

    const role = AuthService.getInitialRole() || 'collaborator';
    const initObj = init || {};
    const headers = new Headers(initObj.headers || {});

    if (!headers.has('X-Demo-Role')) {
      headers.set('X-Demo-Role', role);
    }

    return originalFetch(input, {
      ...initObj,
      headers,
    });
  };
}

const GUEST_PROFILE: UserProfile = {
  id: '',
  email: '',
  full_name: '',
  department: '',
  role: 'collaborator',
  status: 'inactive',
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const demo = isDemoMode();

  // ── Demo mode state (unchanged behavior: role switching via localStorage) ──
  const [demoRole, setDemoRole] = useState<UserRole>(() => AuthService.getInitialRole());
  const [demoUser, setDemoUser] = useState<UserProfile>(() => AuthService.getUserForRole(demoRole));

  // ── Real mode state (Supabase Auth session) ──
  const [realUser, setRealUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(!demo);

  useEffect(() => {
    if (demo) return; // demo mode never touches Supabase Auth

    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      const sessionUser = data.session?.user;
      if (sessionUser) {
        const { profile } = await fetchRealUserProfile(sessionUser);
        if (!cancelled) setRealUser(profile);
      }
      if (!cancelled) setAuthLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const { profile } = await fetchRealUserProfile(session.user);
        if (!cancelled) setRealUser(profile);
      } else {
        if (!cancelled) setRealUser(null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [demo]);

  const switchRole = (newRole: UserRole) => {
    if (!demo) {
      console.warn('[AuthContext] switchRole() is disabled outside demo mode (VITE_DEMO_MODE=true).');
      return;
    }
    if (ROLE_CONFIGS[newRole]) {
      setDemoRole(newRole);
      setDemoUser(AuthService.getUserForRole(newRole));
      AuthService.saveRolePreference(newRole);
    }
  };

  const signOut = async () => {
    if (demo) return; // nothing to sign out of in demo mode
    await realSignOut();
    setRealUser(null);
  };

  const currentUser = demo ? demoUser : realUser || GUEST_PROFILE;
  const currentRole = demo ? demoRole : (realUser?.role || 'collaborator');
  const isAuthenticated = demo ? true : !!realUser;

  // Defensive fallback: never let an unrecognized/empty role crash the UI.
  // If this fires, it means `currentRole` held a value outside the 10 known
  // UserRole keys — check the console warning below for the actual value.
  const safeRoleConfig = ROLE_CONFIGS[currentRole] || ROLE_CONFIGS.collaborator;
  if (!ROLE_CONFIGS[currentRole]) {
    console.warn(
      '[AuthContext] Unrecognized currentRole, falling back to collaborator. ' +
      'demo=' + demo + ' currentRole=' + JSON.stringify(currentRole) + ' realUser=' + JSON.stringify(realUser)
    );
  }

  const isAdminOrSuperAdmin = currentRole === 'admin' || currentRole === 'super_admin';
  const canView8Postes = isAdminOrSuperAdmin;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentRole,
        roleConfig: safeRoleConfig,
        switchRole,
        isAdminOrSuperAdmin,
        canView8Postes,
        isDemoMode: demo,
        authLoading: demo ? false : authLoading,
        isAuthenticated,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};