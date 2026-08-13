import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoginScreen } from './LoginScreen';
import { RoleShell } from '@/frontend/src/shared/components/RoleShell';
import { SeatScanScreen } from '@/frontend/src/modules/dashboard/components/SeatScanScreen';
import { DataSyncService } from '@/services/sync/dataSyncService';

// A desk's printed QR badge just links to this site with `?scan=<token>` — the token has to
// survive a login redirect, so it's stashed here on first load and stripped from the URL.
const PENDING_SCAN_KEY = 'xfactory_pending_seat_scan';

/**
 * - Demo mode (VITE_DEMO_MODE=true): always renders RoleShell directly,
 *   login is disabled entirely — this is the QA/testing flow.
 * - Real mode: shows a splash while the initial Supabase session check is in
 *   flight, the LoginScreen if there's no session, and RoleShell once
 *   authenticated. The Role Switcher itself is hidden inside RoleShell when
 *   `isDemoMode` is false (see RoleShell.tsx).
 */
export const AuthGate: React.FC = () => {
  const { isDemoMode, authLoading, isAuthenticated, currentUser } = useAuth();
  const [pendingScan, setPendingScan] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scanToken = params.get('scan');
    if (scanToken) {
      sessionStorage.setItem(PENDING_SCAN_KEY, scanToken);
      params.delete('scan');
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }
    const stored = sessionStorage.getItem(PENDING_SCAN_KEY);
    if (stored) setPendingScan(stored);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      DataSyncService.initialize(currentUser.id || undefined).catch(console.warn);
    }
  }, [isAuthenticated, currentUser.id]);

  console.log('🔍 isDemoMode:', isDemoMode, '| VITE_DEMO_MODE:', import.meta.env.VITE_DEMO_MODE);

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

  if (pendingScan) {
    return (
      <SeatScanScreen
        seatToken={pendingScan}
        onDone={() => {
          sessionStorage.removeItem(PENDING_SCAN_KEY);
          setPendingScan(null);
        }}
      />
    );
  }

  return <RoleShell />;
};