import React, { useState, useEffect } from 'react';
import { Shield, Mail, Lock, AlertCircle } from 'lucide-react';
import { signInWithPassword } from '../services/realAuthService';
import { SettingsService } from '@/services/settings/settingsService';
import { SystemSettings } from '@/frontend/src/types';

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [siteName, setSiteName] = useState<string>(
    (SettingsService.getSettings() as SystemSettings).siteName
  );

  // Settings §28.12 "Nom du site" - GET /api/settings has no auth requirement, so this resolves
  // even pre-login. Falls back to the default if the anonymous read is blocked by RLS.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (siteName) document.title = siteName;
    Promise.resolve(SettingsService.getSettings()).then((s) => {
      if (s.siteName) {
        setSiteName(s.siteName);
        document.title = s.siteName;
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      await signInWithPassword(email, password);
      // onAuthStateChange in AuthContext picks up the new session automatically.
    } catch (err: any) {
      setError(err?.message || 'Identifiants invalides.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 p-8 space-y-6">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-[#008751] flex items-center justify-center font-black text-white text-lg shadow-sm ring-1 ring-amber-400/40">
            <span className="text-amber-300 font-extrabold text-base tracking-tighter">XF</span>
          </div>
          <h1 className="text-lg font-black uppercase tracking-tight text-slate-800">{siteName}</h1>
          <p className="text-xs text-slate-400">Module Smart Open Space Management - Site de Safi</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Adresse e-mail professionnelle</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                autoComplete="username"
                placeholder="prenom.nom@ocpgroup.ma"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Mot de passe</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition-all"
              />
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-[11px] flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#008751] hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all"
          >
            <Shield className="w-4 h-4 text-amber-300" />
            {submitting ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p className="text-center text-[10px] text-slate-400">
          Accès réservé aux comptes @ocpgroup.ma. Mot de passe oublié ? Contactez un Super
          Administrateur, qui vous remettra un mot de passe temporaire.
        </p>
      </div>
    </div>
  );
};
