import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserRole, UserProfile, RoleConfig } from '../../../types';
import { LOCAL_STORAGE_ROLE_KEY } from '@/services/supabase/supabaseClient';
import { ROLE_CONFIGS, DEFAULT_USERS_BY_ROLE, AuthService } from '@/services/auth/authService';

export { ROLE_CONFIGS, DEFAULT_USERS_BY_ROLE };

interface AuthContextType {
  currentUser: UserProfile;
  currentRole: UserRole;
  roleConfig: RoleConfig;
  switchRole: (role: UserRole) => void;
  isAdminOrSuperAdmin: boolean;
  canView8Postes: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 🛡️ Global Fetch Interceptor to inject X-Demo-Role header into all API calls in demo mode
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
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

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    return AuthService.getInitialRole();
  });

  const [currentUser, setCurrentUser] = useState<UserProfile>(
    AuthService.getUserForRole(currentRole)
  );

  const switchRole = (newRole: UserRole) => {
    if (ROLE_CONFIGS[newRole]) {
      setCurrentRole(newRole);
      setCurrentUser(AuthService.getUserForRole(newRole));
      AuthService.saveRolePreference(newRole);
    }
  };

  useEffect(() => {
    setCurrentUser(AuthService.getUserForRole(currentRole));
  }, [currentRole]);

  const isAdminOrSuperAdmin = currentRole === 'admin' || currentRole === 'super_admin';
  const canView8Postes = isAdminOrSuperAdmin;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentRole,
        roleConfig: ROLE_CONFIGS[currentRole],
        switchRole,
        isAdminOrSuperAdmin,
        canView8Postes
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
