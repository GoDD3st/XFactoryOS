import React, { useState, useEffect } from 'react';
import { SystemSettings } from '@/frontend/src/types';
import { SettingsService } from '@/services/settings/settingsService';
import { Settings, Save, RotateCcw, CheckCircle, Clock, CalendarDays, BarChart3, Building2, ShieldCheck, Tag } from 'lucide-react';

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

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings>(SettingsService.getSettings());
  const [savedMsg, setSavedMsg] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    SettingsService.updateSettings(settings);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  };

  const handleReset = () => {
    const res = SettingsService.resetSettings();
    setSettings(res);
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
          <span>Paramètres sauvegardés avec succès !</span>
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
            className="flex items-center gap-2 px-5 py-2.5 bg-[#008751] hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
          >
            <Save className="w-4 h-4 text-amber-300" />
            <span>Enregistrer la Configuration</span>
          </button>
        </div>
      </form>
    </div>
  );
};
