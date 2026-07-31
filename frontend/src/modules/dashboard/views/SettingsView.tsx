import React, { useState, useEffect } from 'react';
import { SystemSettings } from '@/frontend/src/types';
import { SettingsService } from '@/services/settings/settingsService';
import { Settings, Save, RotateCcw, CheckCircle, Sliders } from 'lucide-react';

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

  return (
    <div className="space-y-6">
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

      {savedMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Paramètres sauvegardés avec succès !</span>
        </div>
      )}

      <form onSubmit={handleSave} className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              Durée maximale sans approbation (Jours)
            </label>
            <input
              type="number"
              value={settings.maxReservationDaysWithoutApproval}
              onChange={(e) =>
                setSettings({ ...settings, maxReservationDaysWithoutApproval: parseInt(e.target.value) || 1 })
              }
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
            />
            <p className="text-[10px] text-slate-400">Si une réservation dépasse cette durée, elle requiert une approbation.</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              Délai d'Annulation Automatique No-Show (Minutes)
            </label>
            <input
              type="number"
              value={settings.noShowDelayMinutes}
              onChange={(e) =>
                setSettings({ ...settings, noShowDelayMinutes: parseInt(e.target.value) || 15 })
              }
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
            />
            <p className="text-[10px] text-slate-400">Temps accordé après le début de la réservation pour faire le check-in.</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              Heures d'Ouverture du Bâtiment
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="time"
                value={settings.workingHoursStart}
                onChange={(e) => setSettings({ ...settings, workingHoursStart: e.target.value })}
                className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium flex-1"
              />
              <span className="text-xs text-slate-400">à</span>
              <input
                type="time"
                value={settings.workingHoursEnd}
                onChange={(e) => setSettings({ ...settings, workingHoursEnd: e.target.value })}
                className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium flex-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              Nom Officiel du Site OCP
            </label>
            <input
              type="text"
              value={settings.siteName}
              onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
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
