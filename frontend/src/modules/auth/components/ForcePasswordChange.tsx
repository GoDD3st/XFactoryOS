import React, { useState } from 'react';
import { KeyRound, ShieldCheck, AlertCircle, Check } from 'lucide-react';
import { apiChangeOwnPassword } from '@/services/api/userApi';

/**
 * Forced password creation after signing in with an admin-issued temporary password.
 *
 * Rendered as a full-screen gate rather than a dismissible modal: the account is on a credential
 * its administrator also knows, so there is no state in which the user should reach the rest of
 * the platform while that is still true. There is deliberately no "later" button.
 *
 * The rules below mirror the server-side Zod schema exactly. They are a convenience so the user
 * sees the requirement before submitting - the backend is what enforces it.
 */

const RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: 'Au moins 10 caractères', test: (v) => v.length >= 10 },
  { label: 'Une minuscule', test: (v) => /[a-z]/.test(v) },
  { label: 'Une majuscule', test: (v) => /[A-Z]/.test(v) },
  { label: 'Un chiffre', test: (v) => /[0-9]/.test(v) },
  { label: 'Un caractère spécial', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

interface Props {
  userName?: string;
  onDone: () => void;
}

export const ForcePasswordChange: React.FC<Props> = ({ userName, onDone }) => {
  // The temporary password the user just signed in with. Required by the server for the same
  // reason as any other change: a valid session proves the browser was logged in, not that the
  // person at the keyboard is the account owner.
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passed = RULES.map((r) => r.test(password));
  const allPassed = passed.every(Boolean);
  const matches = password.length > 0 && password === confirm;
  const canSubmit = temporaryPassword.length > 0 && allPassed && matches && !submitting;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      await apiChangeOwnPassword(temporaryPassword, password);
      // Cleared from component state immediately; never persisted anywhere client-side.
      setTemporaryPassword('');
      setPassword('');
      setConfirm('');
      onDone();
    } catch (err: any) {
      setError(err?.message || 'Échec de la définition du mot de passe.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/70 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-[#008751] text-white flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">
              Créez votre mot de passe
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {userName ? `${userName}` : ''}votre compte utilise un mot de passe temporaire
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-900 leading-relaxed">
            Ce mot de passe temporaire a été communiqué par un administrateur et est connu de lui.
            Définissez le vôtre pour continuer - il ne sera visible par personne d'autre.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Mot de passe temporaire actuel
            </label>
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              placeholder="Celui communiqué par votre administrateur"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Nouveau mot de passe</label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>

          <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
            {RULES.map((r, i) => (
              <li
                key={r.label}
                className={`text-[10px] flex items-center gap-1.5 ${
                  passed[i] ? 'text-emerald-700 font-semibold' : 'text-slate-400'
                }`}
              >
                <Check className={`w-3 h-3 ${passed[i] ? 'opacity-100' : 'opacity-30'}`} />
                {r.label}
              </li>
            ))}
          </ul>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Confirmer le mot de passe</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
            {confirm.length > 0 && !matches && (
              <p className="text-[10px] text-rose-600 font-semibold">
                Les deux mots de passe ne correspondent pas.
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-rose-900">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-[#008751] hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-md transition-all"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{submitting ? 'Enregistrement...' : 'Définir mon mot de passe'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
