import React, { useState, useEffect } from 'react';
import { SystemSettings, HolidayEntry, ClosedDateEntry } from '@/frontend/src/types';
import { SettingsService } from '@/services/settings/settingsService';
import { useAuth } from '../../auth/context/AuthContext';
import { Settings, Save, RotateCcw, CheckCircle, Clock, CalendarDays, BarChart3, Building2, ShieldCheck, Tag, KeyRound, History, X, AlertCircle, Plus, Trash2, Lock } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────
   Reusable: section card wrapper
   ────────────────────────────────────────────────────────────────── */
const SectionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}> = ({ icon, title, subtitle, children }) => (
  <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
    <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
      <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
        {icon}
      </div>
      <div>
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">{title}</h3>
        <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{children}</div>
  </div>
);

/* ──────────────────────────────────────────────────────────────────
   Helper: format minutes into readable time
   ────────────────────────────────────────────────────────────────── */
const formatMinutesToReadable = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${h}h 00min`;
};

const formatDaysToDate = (days: number): string => {
  const target = new Date();
  target.setDate(target.getDate() + days);
  return target.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
};

/* ──────────────────────────────────────────────────────────────────
   Reusable: number input field with smart unit conversion
   ────────────────────────────────────────────────────────────────── */
const NumberField: React.FC<{
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  unit?: 'minutes' | 'days' | 'count';
  onChange: (val: number) => void;
}> = ({ label, hint, value, min, max, unit, onChange }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-bold text-slate-700 block">{label}</label>
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(parseInt(e.target.value) || min || 0)}
      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition-all"
    />
    {unit === 'minutes' && value > 0 && (
      <p className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1 inline-block">
        = {formatMinutesToReadable(value)}
      </p>
    )}
    {unit === 'days' && value > 0 && (
      <p className="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1 inline-block">
        → Première date réservable : {formatDaysToDate(value)}
      </p>
    )}
    {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
  </div>
);

/* ──────────────────────────────────────────────────────────────────
   Reusable: toggle switch field
   ────────────────────────────────────────────────────────────────── */
const ToggleField: React.FC<{
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}> = ({ label, hint, checked, onChange }) => (
  <div className="flex items-center justify-between gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
    <div className="space-y-0.5">
      <span className="text-xs font-bold text-slate-700">{label}</span>
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`
        relative w-10 h-5.5 rounded-full transition-colors duration-200 cursor-pointer shrink-0
        ${checked ? 'bg-emerald-500' : 'bg-slate-300'}
      `}
      style={{ height: '22px' }}
    >
      <span
        className={`
          absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200
          ${checked ? 'translate-x-[18px]' : 'translate-x-0'}
        `}
      />
    </button>
  </div>
);

/* ──────────────────────────────────────────────────────────────────
   OTP Verification Modal — Super Admin must confirm a 6-digit code
   before any settings change is persisted (10-minute window).
   ────────────────────────────────────────────────────────────────── */
const OtpVerificationModal: React.FC<{
  challengeId: string;
  demoOtpCode?: string;
  expiresAt: string;
  onConfirm: (code: string) => Promise<void>;
  onCancel: () => void;
}> = ({ challengeId, demoOtpCode, expiresAt, onConfirm, onCancel }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      await onConfirm(code.trim());
    } catch (err: any) {
      setError(err?.message || 'Code de vérification invalide.');
    } finally {
      setSubmitting(false);
    }
  };

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4 relative">
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Code de vérification</h3>
            <p className="text-[10px] text-slate-400">Confirmez la modification des paramètres système</p>
          </div>
        </div>

        {demoOtpCode && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
            <strong>Mode démo :</strong> code envoyé — <span className="font-mono font-black text-sm">{demoOtpCode}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoFocus
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full text-center tracking-[0.5em] text-xl font-black p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition-all"
          />

          <p className="text-[10px] text-center text-slate-400">
            {secondsLeft > 0 ? `Expire dans ${minutes}:${seconds}` : 'Code expiré — veuillez recommencer.'}
          </p>

          {error && (
            <div className="p-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-[11px] flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting || code.length !== 6 || secondsLeft <= 0}
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#008751] hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs transition-all"
            >
              {submitting ? 'Vérification…' : 'Confirmer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────
   Configuration Version History
   ────────────────────────────────────────────────────────────────── */
const SettingsHistoryTable: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [history, setHistory] = useState<Array<{ id: string; action: string; admin_name: string; details: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    SettingsService.getHistory().then((data) => {
      if (!cancelled) {
        setHistory(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <SectionCard
      icon={<History className="w-4 h-4" />}
      title="Historique des Modifications"
      subtitle="Chaque changement confirmé par OTP est journalisé avec un diff des valeurs"
    >
      <div className="md:col-span-2">
        {loading ? (
          <p className="text-xs text-slate-400">Chargement de l'historique…</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-slate-400">Aucune modification enregistrée pour le moment.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {history.map((h) => (
              <div key={h.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-700">{h.admin_name}</span>
                  <span className="text-[10px] text-slate-400">{new Date(h.created_at).toLocaleString('fr-FR')}</span>
                </div>
                <p className="text-[11px] text-slate-500 break-words">{h.details}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
};

/* ──────────────────────────────────────────────────────────────────
   Jours Fériés — editable list (Islamic holidays shift date every year,
   so this can't be a hardcoded calendar; Super Admin keeps it current)
   ────────────────────────────────────────────────────────────────── */
const HolidaysEditor: React.FC<{
  holidays: HolidayEntry[];
  onChange: (next: HolidayEntry[]) => void;
}> = ({ holidays, onChange }) => {
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');

  const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date));

  const handleAdd = () => {
    if (!date || !label.trim()) return;
    if (holidays.some((h) => h.date === date)) return; // avoid duplicate dates
    onChange([...holidays, { date, label: label.trim() }]);
    setDate('');
    setLabel('');
  };

  const handleRemove = (targetDate: string) => {
    onChange(holidays.filter((h) => h.date !== targetDate));
  };

  return (
    <div className="md:col-span-2 space-y-3">
      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {sorted.length === 0 && (
          <p className="text-xs text-slate-400">Aucun jour férié configuré.</p>
        )}
        {sorted.map((h) => (
          <div key={h.date} className="flex items-center justify-between gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[10px] font-mono font-bold text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-1 shrink-0">
                {new Date(h.date + 'T00:00:00').toLocaleDateString('fr-FR')}
              </span>
              <span className="text-xs font-semibold text-slate-700 truncate">{h.label}</span>
            </div>
            <button
              type="button"
              onClick={() => handleRemove(h.date)}
              className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition-all"
        />
        <input
          type="text"
          placeholder="Nom du jour férié (ex: Aïd Al Fitr)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition-all"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!date || !label.trim()}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition-all shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>
      <p className="text-[10px] text-slate-400">
        Les dates des fêtes religieuses (Aïd Al Fitr, Aïd Al Adha, 1er Moharram, Aïd Al Mawlid) avancent d'environ 11 jours chaque année du calendrier grégorien — mettez cette liste à jour annuellement.
      </p>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────
   Fermeture Exceptionnelle (Lockdown) — blocks NEW reservations on the
   given date(s) only; the rest of the app keeps functioning normally.
   ────────────────────────────────────────────────────────────────── */
const ClosedDatesEditor: React.FC<{
  closedDates: ClosedDateEntry[];
  onChange: (next: ClosedDateEntry[]) => void;
}> = ({ closedDates, onChange }) => {
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const sorted = [...closedDates].sort((a, b) => a.date.localeCompare(b.date));

  const handleAdd = () => {
    if (!date) return;
    if (endDate && endDate < date) return;
    onChange([...closedDates, { date, endDate: endDate || undefined, reason: reason.trim() || undefined }]);
    setDate('');
    setEndDate('');
    setReason('');
  };

  const handleRemove = (target: ClosedDateEntry) => {
    onChange(closedDates.filter((c) => c !== target));
  };

  return (
    <div className="md:col-span-2 space-y-3">
      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-start gap-2">
        <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>Une date verrouillée bloque uniquement la <strong>création de nouvelles réservations</strong> ce jour-là. Le reste du site (consultation, check-in sur réservations existantes, dashboards, administration) continue de fonctionner normalement.</span>
      </div>

      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {sorted.length === 0 && (
          <p className="text-xs text-slate-400">Aucune fermeture exceptionnelle programmée.</p>
        )}
        {sorted.map((c, idx) => (
          <div key={`${c.date}-${idx}`} className="flex items-center justify-between gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[10px] font-mono font-bold text-white bg-amber-500 rounded-lg px-2 py-1 shrink-0">
                {new Date(c.date + 'T00:00:00').toLocaleDateString('fr-FR')}
                {c.endDate && c.endDate !== c.date ? ` → ${new Date(c.endDate + 'T00:00:00').toLocaleDateString('fr-FR')}` : ''}
              </span>
              <span className="text-xs font-semibold text-slate-700 truncate">{c.reason || 'Fermeture exceptionnelle'}</span>
            </div>
            <button
              type="button"
              onClick={() => handleRemove(c)}
              className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[auto_auto_1fr_auto] gap-2 pt-2 border-t border-slate-100">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 transition-all"
        />
        <input
          type="date"
          value={endDate}
          min={date || undefined}
          onChange={(e) => setEndDate(e.target.value)}
          title="Date de fin (optionnel, pour une fermeture de plusieurs jours)"
          className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 transition-all"
        />
        <input
          type="text"
          placeholder="Motif (ex: Maintenance électrique)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 transition-all"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!date}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition-all shrink-0"
        >
          <Lock className="w-3.5 h-3.5" /> Verrouiller
        </button>
      </div>
    </div>
  );
};

export const SettingsView: React.FC = () => {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState<SystemSettings>(SettingsService.getSettings() as SystemSettings);
  const [savedMsg, setSavedMsg] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const [otpChallenge, setOtpChallenge] = useState<{ challengeId: string; expiresAt: string; otpCode?: string } | null>(null);
  const [requestError, setRequestError] = useState<string | undefined>();
  const [requesting, setRequesting] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestError(undefined);
    setRequesting(true);
    try {
      // Server-managed metadata (id/configVersion/updated_at/updated_by) isn't part of the
      // editable payload — SystemSettingsUpdateSchema is a strict Zod schema and rejects any
      // unrecognized key with a 400, so submitting the full `settings` state object as-is
      // (which always carries these once loaded from the DB) made every save fail outright.
      const { id, configVersion, updated_at, updated_by, ...editablePayload } = settings;
      const result = await SettingsService.requestUpdate(
        currentUser.id,
        currentUser.full_name,
        editablePayload
      );
      setOtpChallenge({
        challengeId: result.challengeId,
        expiresAt: String(result.expiresAt),
        otpCode: result.otpCode,
      });
    } catch (err: any) {
      setRequestError(err?.message || 'Erreur lors de la demande de modification.');
    } finally {
      setRequesting(false);
    }
  };

  const handleConfirmOtp = async (code: string) => {
    if (!otpChallenge) return;
    const updated = await SettingsService.confirmUpdate(otpChallenge.challengeId, code, currentUser.id);
    setSettings(updated);
    setOtpChallenge(null);
    setSavedMsg(true);
    setHistoryRefreshKey((k) => k + 1);
    setTimeout(() => setSavedMsg(false), 2500);
  };

  const handleReset = () => {
    // Local-only: resets the unsaved form back to defaults. Persisting still requires the
    // OTP-confirmed save below — this button must never write to the database directly.
    setSettings(SettingsService.resetToDefaults());
  };

  const update = (field: keyof SystemSettings, value: any) =>
    setSettings((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Paramètres du Système XFactory OS</h2>
          <p className="text-xs text-slate-500 mt-0.5">Configuration des règles métier de réservation, No-Show, et gouvernance</p>
        </div>

        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser
        </button>
      </div>

      {/* ── Success Banner ─────────────────────────────────────────── */}
      {savedMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Paramètres modifiés et vérifiés par code OTP avec succès !</span>
        </div>
      )}

      {requestError && (
        <div className="p-3 rounded-xl bg-red-50 text-red-800 border border-red-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{requestError}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* ── Card 1: Fenêtre de Réservation & Durée ──────────────── */}
        <SectionCard
          icon={<Clock className="w-4 h-4" />}
          title="Fenêtre de Réservation & Durée"
          subtitle="Contrôlez le délai d'anticipation et les limites de durée des réservations"
        >
          <NumberField
            label="Délai minimum d'anticipation (Jours)"
            hint="Nombre de jours à l'avance pour réserver. Ex: si 2, un utilisateur ne peut pas réserver pour demain."
            value={settings.bookingWindowDays}
            min={0}
            max={30}
            unit="days"
            onChange={(v) => update('bookingWindowDays', v)}
          />
          <NumberField
            label="Durée minimale de réservation (Minutes)"
            hint="Durée minimale autorisée pour un créneau de réservation."
            value={settings.minReservationMinutes}
            min={15}
            max={480}
            unit="minutes"
            onChange={(v) => update('minReservationMinutes', v)}
          />
          <NumberField
            label="Durée maximale de réservation (Minutes)"
            hint="Durée maximale autorisée pour un créneau unique."
            value={settings.maxReservationMinutes}
            min={30}
            max={1440}
            unit="minutes"
            onChange={(v) => update('maxReservationMinutes', v)}
          />
          <NumberField
            label="Durée maximale sans approbation (Jours)"
            hint="Si une réservation dépasse cette durée, elle requiert une approbation."
            value={settings.maxReservationDaysWithoutApproval}
            min={1}
            max={30}
            unit="days"
            onChange={(v) => update('maxReservationDaysWithoutApproval', v)}
          />
        </SectionCard>

        {/* ── Card 2: Quotas Utilisateur ──────────────────────────── */}
        <SectionCard
          icon={<BarChart3 className="w-4 h-4" />}
          title="Quotas Utilisateur par Période"
          subtitle="Limitez le nombre de réservations qu'un utilisateur peut effectuer"
        >
          <NumberField
            label="Réservations max par jour"
            hint="Nombre maximum de réservations qu'un utilisateur peut effectuer par jour."
            value={settings.maxReservationsPerUserPerDay}
            min={1}
            max={10}
            unit="count"
            onChange={(v) => update('maxReservationsPerUserPerDay', v)}
          />
          <NumberField
            label="Réservations max par semaine"
            hint="Nombre maximum de réservations qu'un utilisateur peut effectuer par semaine."
            value={settings.maxReservationsPerUserPerWeek}
            min={1}
            max={25}
            unit="count"
            onChange={(v) => update('maxReservationsPerUserPerWeek', v)}
          />
        </SectionCard>

        {/* ── Card 3: Heures d'Ouverture & No-Show ────────────────── */}
        <SectionCard
          icon={<Building2 className="w-4 h-4" />}
          title="Heures d'Ouverture & No-Show"
          subtitle="Configurez les horaires du bâtiment et le délai de tolérance No-Show"
        >
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Heures d'Ouverture du Bâtiment
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="time"
                value={settings.workingHoursStart}
                onChange={(e) => update('workingHoursStart', e.target.value)}
                className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium flex-1 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition-all"
              />
              <span className="text-xs text-slate-400 font-bold">à</span>
              <input
                type="time"
                value={settings.workingHoursEnd}
                onChange={(e) => update('workingHoursEnd', e.target.value)}
                className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium flex-1 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition-all"
              />
            </div>
            <p className="text-[10px] text-slate-400">Plage horaire durant laquelle les réservations sont autorisées.</p>
          </div>
          <NumberField
            label="Délai d'Annulation Automatique No-Show (Minutes)"
            hint="Temps accordé après le début de la réservation pour faire le check-in."
            value={settings.noShowDelayMinutes}
            min={5}
            max={120}
            unit="minutes"
            onChange={(v) => update('noShowDelayMinutes', v)}
          />
        </SectionCard>

        {/* ── Card 4: Jours Spéciaux & Permissions ────────────────── */}
        <SectionCard
          icon={<CalendarDays className="w-4 h-4" />}
          title="Jours Spéciaux & Permissions"
          subtitle="Autorisez ou bloquez les réservations pendant les week-ends et jours fériés"
        >
          <ToggleField
            label="Autoriser les réservations le week-end"
            hint="Permet aux utilisateurs de réserver des postes le samedi et dimanche."
            checked={settings.allowWeekendBooking}
            onChange={(v) => update('allowWeekendBooking', v)}
          />
          <ToggleField
            label="Autoriser les réservations les jours fériés"
            hint="Permet aux utilisateurs de réserver des postes pendant les jours fériés."
            checked={settings.allowHolidayBooking}
            onChange={(v) => update('allowHolidayBooking', v)}
          />
        </SectionCard>

        {/* ── Card 4b: Jours Fériés ────────────────────────────────── */}
        <SectionCard
          icon={<CalendarDays className="w-4 h-4" />}
          title="Jours Fériés"
          subtitle="Liste des jours fériés OCP Safi — modifiable car les fêtes religieuses n'ont pas de date fixe"
        >
          <HolidaysEditor
            holidays={settings.holidays}
            onChange={(next) => update('holidays', next)}
          />
        </SectionCard>

        {/* ── Card 4c: Fermeture Exceptionnelle (Lockdown) ────────── */}
        <SectionCard
          icon={<Lock className="w-4 h-4" />}
          title="Fermeture Exceptionnelle de l'Open Space"
          subtitle="Verrouillez une date pour empêcher toute nouvelle réservation, sans affecter le reste du site"
        >
          <ClosedDatesEditor
            closedDates={settings.closedDates}
            onChange={(next) => update('closedDates', next)}
          />
        </SectionCard>

        {/* ── Card 5: Informations Générales ──────────────────────── */}
        <SectionCard
          icon={<Tag className="w-4 h-4" />}
          title="Informations Générales"
          subtitle="Identité et branding du site"
        >
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-bold text-slate-700 block">Nom Officiel du Site OCP</label>
            <input
              type="text"
              value={settings.siteName}
              onChange={(e) => update('siteName', e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition-all"
            />
          </div>
        </SectionCard>

        {/* ── Save Button ─────────────────────────────────────────── */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={requesting}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#008751] hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
          >
            <KeyRound className="w-4 h-4 text-amber-300" />
            <span>{requesting ? 'Envoi du code…' : 'Enregistrer (vérification OTP requise)'}</span>
          </button>
        </div>
      </form>

      <SettingsHistoryTable refreshKey={historyRefreshKey} />

      {otpChallenge && (
        <OtpVerificationModal
          challengeId={otpChallenge.challengeId}
          demoOtpCode={otpChallenge.otpCode}
          expiresAt={otpChallenge.expiresAt}
          onConfirm={handleConfirmOtp}
          onCancel={() => setOtpChallenge(null)}
        />
      )}
    </div>

  );
};