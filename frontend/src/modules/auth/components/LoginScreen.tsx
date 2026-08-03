import React, { useState } from 'react';
import { Shield, Mail, Lock, AlertCircle } from 'lucide-react';
import { signInWithPassword, signInWithGoogle } from '../services/realAuthService';

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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

  const handleGoogle = async () => {
    setError(undefined);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      // Redirects away from the page — nothing else to do here.
    } catch (err: any) {
      setError(err?.message || 'Connexion Google impossible.');
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 p-8 space-y-6">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-[#008751] flex items-center justify-center font-black text-white text-lg shadow-sm ring-1 ring-amber-400/40">
            <span className="text-amber-300 font-extrabold text-base tracking-tighter">OCP</span>
          </div>
          <h1 className="text-lg font-black uppercase tracking-tight text-slate-800">XFactory OS</h1>
          <p className="text-xs text-slate-400">Module Smart Open Space Management — Site de Safi</p>
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
            {submitting ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-100" />
          <span className="text-[10px] text-slate-400 uppercase font-bold">ou</span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl shadow-sm transition-all"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {googleLoading ? 'Redirection…' : 'Continuer avec Google'}
        </button>

        <p className="text-center text-[10px] text-slate-400">
          Accès réservé aux comptes @ocpgroup.ma. Contactez l'IT en cas de problème de connexion.
        </p>
      </div>
    </div>
  );
};
