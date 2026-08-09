import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
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
  /** BR-07: management-reserved clusters (CL-F/CL-G) are reserved FOR these roles — they can
   * select seats there directly without needing the GCI/Building Manager unlock step. */
  canAccessManagementClusters: boolean;
  /** true when running with the QA Role Switcher (VITE_DEMO_MODE=true), false when gated by real Supabase Auth */
  isDemoMode: boolean;
  /** false while the initial Supabase session check is still in flight (real mode only) */
  authLoading: boolean;
  /** true once a real user is signed in (always true in demo mode) */
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  /** FR-04 "expirer les sessions inactives" — true when idle warning countdown is showing */
  sessionIdleWarning: boolean;
  /** Seconds remaining before auto-logout, only meaningful while sessionIdleWarning is true */
  idleSecondsLeft: number;
  /** Resets the idle timer — call when the user confirms they're still there */
  extendSession: () => void;
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

// FR-04 "Le système doit expirer les sessions inactives" — auto sign-out after sustained
// inactivity, with a warning window so an idle-but-present user isn't cut off without notice.
const IDLE_WARNING_AFTER_MS = 25 * 60 * 1000; // warn at 25 min idle
const IDLE_LOGOUT_AFTER_MS = 30 * 60 * 1000; // force logout at 30 min idle
const IDLE_ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'] as const;

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

        // SRS FR-05 / §26.1 "Connexion utilisateur" — journaliser chaque connexion.
        // Only on an actual sign-in, not every TOKEN_REFRESHED/USER_UPDATED event.
        if (_event === 'SIGNED_IN') {
          const { AuditRepository } = await import('@/database/repositories/auditRepository');
          AuditRepository.logEvent(
            'LOGIN',
            profile.id,
            profile.full_name,
            profile.role,
            profile.id,
            `Connexion réussie de ${profile.email}`
          ).catch(() => {});
        }
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

  const signOut = useCallback(async () => {
    if (demo) return; // nothing to sign out of in demo mode
    if (realUser) {
      const { AuditRepository } = await import('@/database/repositories/auditRepository');
      AuditRepository.logEvent(
        'LOGOUT',
        realUser.id,
        realUser.full_name,
        realUser.role,
        realUser.id,
        `Déconnexion de ${realUser.email}`
      ).catch(() => {});
    }
    await realSignOut();
    setRealUser(null);
  }, [demo, realUser]);

  const currentUser = demo ? demoUser : realUser || GUEST_PROFILE;
  const currentRole = demo ? demoRole : (realUser?.role || 'collaborator');
  const isAuthenticated = demo ? true : !!realUser;

  // ── Idle session expiration (real mode only — demo mode has no real session to expire) ──
  const [sessionIdleWarning, setSessionIdleWarning] = useState(false);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState(0);
  const warningShownRef = useRef(false); // live mirror of sessionIdleWarning, read inside the
  // activity listener's closure so it doesn't need re-subscribing on every state change
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearIdleTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
  }, []);

  const extendSession = useCallback(() => {
    warningShownRef.current = false;
    setSessionIdleWarning(false);
    clearIdleTimers();

    warningTimerRef.current = setTimeout(() => {
      warningShownRef.current = true;
      setSessionIdleWarning(true);
      setIdleSecondsLeft(Math.round((IDLE_LOGOUT_AFTER_MS - IDLE_WARNING_AFTER_MS) / 1000));
      countdownIntervalRef.current = setInterval(() => {
        setIdleSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      }, 1000);
    }, IDLE_WARNING_AFTER_MS);

    logoutTimerRef.current = setTimeout(() => {
      clearIdleTimers();
      warningShownRef.current = false;
      setSessionIdleWarning(false);
      signOut();
    }, IDLE_LOGOUT_AFTER_MS);
  }, [clearIdleTimers, signOut]);

  useEffect(() => {
    if (demo || !isAuthenticated) {
      clearIdleTimers();
      warningShownRef.current = false;
      setSessionIdleWarning(false);
      return;
    }

    extendSession(); // arm timers on mount / when auth state becomes true

    const handleActivity = () => {
      // While the warning is showing, ambient activity (e.g. residual mouse movement) shouldn't
      // silently dismiss it — the user must explicitly confirm via the modal's "stay logged in"
      // button (which calls extendSession() directly), so a truly-unattended machine still logs
      // out on schedule instead of the warning flashing away on its own.
      if (warningShownRef.current) return;
      extendSession();
    };

    IDLE_ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handleActivity));

    return () => {
      IDLE_ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
      clearIdleTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, isAuthenticated]);

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
  const canAccessManagementClusters =
    currentRole === 'director' ||
    currentRole === 'executive_assistant' ||
    currentRole === 'admin' ||
    currentRole === 'super_admin';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentRole,
        roleConfig: safeRoleConfig,
        switchRole,
        isAdminOrSuperAdmin,
        canView8Postes,
        canAccessManagementClusters,
        isDemoMode: demo,
        authLoading: demo ? false : authLoading,
        isAuthenticated,
        signOut,
        sessionIdleWarning,
        idleSecondsLeft,
        extendSession,
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