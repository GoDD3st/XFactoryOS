import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LoginScreen } from './LoginScreen';
import { RoleShell } from '@/frontend/src/shared/components/RoleShell';

/**
 * - Demo mode (VITE_DEMO_MODE=true): always renders RoleShell directly,
 *   login is disabled entirely — this is the QA/testing flow.
 * - Real mode: shows a splash while the initial Supabase session check is in
 *   flight, the LoginScreen if there's no session, and RoleShell once
 *   authenticated. The Role Switcher itself is hidden inside RoleShell when
 *   `isDemoMode` is false (see RoleShell.tsx).
 */
export const AuthGate: React.FC = () => {
  const { isDemoMode, authLoading, isAuthenticated } = useAuth();

  if (!isDemoMode && authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wide">
          <div className="w-4 h-4 border-2 border-slate-300 border-t-emerald-600 rounded-full animate-spin" />
          Vérification de la session…
        </div>
      </div>
    );
  }

  if (!isDemoMode && !isAuthenticated) {
    return <LoginScreen />;
  }

  return <RoleShell />;
};
