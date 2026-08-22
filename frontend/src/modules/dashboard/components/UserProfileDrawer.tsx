import React, { useState } from 'react';
import { X, User, Mail, Building2, ShieldCheck, KeyRound, Check, AlertCircle, LogOut } from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { apiChangeOwnPassword } from '@/services/api/userApi';

/**
 * Profile panel for the signed-in user.
 *
 * The password is shown as a masked placeholder and never as a value - the client is never sent
 * one, so there is nothing to reveal even accidentally. Changing it goes through an administrator:
 * the button raises a real notification to the admin population rather than telling the user to
 * "contact an admin" and leaving them to work out who that is.
 */

/**
 * Splits a display name into first/last.
 *
 * `users.full_name` is a single column, so this is presentation-only. The last token is treated
 * as the surname and everything before it as given names, which handles "Marie-Claire Ben Ali"
 * reasonably. Honorifics like "Dr." are kept with the given names rather than guessed at.
 */
function splitName(fullName: string): { first: string; last: string } {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const Field: React.FC<{ icon: React.ReactNode; label: string; value: string; mono?: boolean }> = ({
  icon,
  label,
  value,
  mono,
}) => (
  <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/60">
    <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[#008751] shrink-0">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xs text-slate-800 font-semibold break-words ${mono ? 'font-mono' : ''}`}>
        {value || ''}
      </p>
    </div>
  </div>
);

/** Same rules as the server-side schema; shown so the user sees them before submitting. */
const PASSWORD_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: 'Au moins 10 caractères', test: (v) => v.length >= 10 },
  { label: 'Une minuscule', test: (v) => /[a-z]/.test(v) },
  { label: 'Une majuscule', test: (v) => /[A-Z]/.test(v) },
  { label: 'Un chiffre', test: (v) => /[0-9]/.test(v) },
  { label: 'Un caractère spécial', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export const UserProfileDrawer: React.FC<Props> = ({ isOpen, onClose }) => {
  const { currentUser, roleConfig, signOut } = useAuth();

  const [changing, setChanging] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingLockout, setConfirmingLockout] = useState(false);

  if (!isOpen) return null;

  const { first, last } = splitName(currentUser.full_name);

  const rulesPassed = PASSWORD_RULES.map((r) => r.test(newPassword));
  const strongEnough = rulesPassed.every(Boolean);
  const matches = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = currentPassword.length > 0 && strongEnough && matches && !submitting;

  /** Wipes every password field - called on success, on cancel, and on close. */
  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
  };

  const submitChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      await apiChangeOwnPassword(currentPassword, newPassword);
      resetForm();
      setChanging(false);
      setChanged(true);
    } catch (err: any) {
      setError(err?.message || 'Échec du changement de mot de passe.');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * "I don't know my current password" path.
   *
   * The account cannot be recovered from inside the session - proving identity has to happen off
   * the platform, with an administrator, in person. Ending the session immediately is the point:
   * it stops an unattended or borrowed session from being used further while the real owner is
   * away resolving it.
   */
  const forgotPassword = async () => {
    resetForm();
    await signOut();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />

      <aside
        role="dialog"
        aria-label="Mon profil"
        className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        <header className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#008751] text-white flex items-center justify-center font-black text-xs">
              {(currentUser.full_name || '?')
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0])
                .join('')
                .toUpperCase()}
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Mon profil</h2>
              <p className="text-[11px] text-slate-500">{roleConfig.label}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <Field icon={<User className="w-3.5 h-3.5" />} label="Prénom" value={first} />
          <Field icon={<User className="w-3.5 h-3.5" />} label="Nom" value={last} />
          <Field icon={<Building2 className="w-3.5 h-3.5" />} label="Département" value={currentUser.department} />
          <Field icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={currentUser.email} mono />
          <Field icon={<ShieldCheck className="w-3.5 h-3.5" />} label="Rôle" value={roleConfig.label} />

          {/* Password: masked placeholder only. The client is never sent the value. */}
          <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[#008751] shrink-0">
              <KeyRound className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Mot de passe</p>
              <p className="text-xs text-slate-800 font-semibold tracking-widest">••••••••••</p>
              <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                Pour des raisons de sécurité, votre mot de passe n'est jamais affiché.
              </p>

              {changed && (
                <p className="mt-2 text-[11px] text-emerald-700 font-semibold flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  Mot de passe modifié avec succès.
                </p>
              )}

              {!changing ? (
                <button
                  onClick={() => {
                    setChanging(true);
                    setChanged(false);
                  }}
                  className="mt-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-[11px] rounded-lg transition-colors"
                >
                  Changer mon mot de passe
                </button>
              ) : (
                <form onSubmit={submitChange} className="mt-3 space-y-2.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600 block">
                      Mot de passe actuel
                    </label>
                    <input
                      type="password"
                      autoFocus
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600 block">
                      Nouveau mot de passe
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>

                  {newPassword.length > 0 && (
                    <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                      {PASSWORD_RULES.map((r, i) => (
                        <li
                          key={r.label}
                          className={`text-[9px] flex items-center gap-1 ${
                            rulesPassed[i] ? 'text-emerald-700 font-semibold' : 'text-slate-400'
                          }`}
                        >
                          <Check className={`w-2.5 h-2.5 ${rulesPassed[i] ? 'opacity-100' : 'opacity-30'}`} />
                          {r.label}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600 block">Confirmer</label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                    {confirmPassword.length > 0 && !matches && (
                      <p className="text-[9px] text-rose-600 font-semibold">
                        Les deux mots de passe ne correspondent pas.
                      </p>
                    )}
                  </div>

                  {error && (
                    <p className="text-[10px] text-rose-700 font-semibold flex items-start gap-1.5">
                      <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                      {error}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="flex-1 px-3 py-1.5 bg-[#008751] hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-[11px] rounded-lg transition-colors"
                    >
                      {submitting ? 'Vérification...' : 'Valider'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resetForm();
                        setChanging(false);
                      }}
                      className="px-3 py-1.5 text-slate-500 hover:text-slate-800 font-bold text-[11px]"
                    >
                      Annuler
                    </button>
                  </div>

                  {/* Second path: identity cannot be re-established from inside the session. */}
                  <div className="pt-2 border-t border-slate-200">
                    {!confirmingLockout ? (
                      <button
                        type="button"
                        onClick={() => setConfirmingLockout(true)}
                        className="text-[10px] font-bold text-slate-500 hover:text-slate-800 underline"
                      >
                        Je ne connais pas mon mot de passe actuel
                      </button>
                    ) : (
                      <div className="space-y-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                        <p className="text-[10px] text-amber-900 leading-relaxed">
                          <strong>Votre session va être fermée.</strong> Sans votre mot de passe actuel,
                          votre identité ne peut pas être vérifiée depuis l'application. Présentez-vous
                          physiquement auprès d'un administrateur : il réinitialisera votre accès et
                          vous communiquera un mot de passe temporaire.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={forgotPassword}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-[10px] rounded-lg transition-colors"
                          >
                            <LogOut className="w-3 h-3" />
                            Fermer ma session
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingLockout(false)}
                            className="px-2 py-1.5 text-amber-800 hover:text-amber-900 font-bold text-[10px]"
                          >
                            Retour
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Sign out lives here, last, and deliberately below everything else.
              It used to sit in the header next to the notification bell, a single tap away from
              whatever the user was doing and reachable by accident. Ending a session is the most
              destructive thing this screen offers - unsaved edits in the form above are lost with
              it - so it belongs at the end of the panel the user opened on purpose, after the
              account details it applies to. */}
          <div className="border-t border-slate-200 p-4">
            <button
              type="button"
              onClick={async () => {
                onClose();
                await signOut();
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300 font-bold text-xs transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Se déconnecter
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};
