import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  Award,
  Users,
  Building,
  Download
} from 'lucide-react';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { ReservationsTable } from '../../../shared/components/ReservationsTable';
import { getRealTimeTelemetry, SiteTelemetrySummary } from '@/services/telemetry/telemetryService';

export const DirectionView: React.FC = () => {
  const [telemetry, setTelemetry] = useState<SiteTelemetrySummary | null>(null);

  useEffect(() => {
    const refresh = () => getRealTimeTelemetry().then(setTelemetry);
    refresh();

    // Same fix as ExecutiveDashboard: this was a load-once snapshot that went stale until a
    // manual reload. Wire it to the same live events the Digital Twin already reacts to.
    window.addEventListener('xfactory_reservations_changed', refresh);
    window.addEventListener('xfactory_workstations_changed', refresh);

    return () => {
      window.removeEventListener('xfactory_reservations_changed', refresh);
      window.removeEventListener('xfactory_workstations_changed', refresh);
    };
  }, []);

  // Ratio présentiel = active occupancy / total desks (people physically checked in per desk).
  const presenceRatio = telemetry && telemetry.totalCapacity > 0
    ? (telemetry.activeOccupancy / telemetry.totalCapacity).toFixed(1)
    : '—';

  const availableDesks = telemetry
    ? telemetry.totalCapacity - telemetry.activeOccupancy
    : 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-xs">
              Rôle : Directeur de Site
            </span>
            <span className="text-xs text-slate-400">Direction Générale OCP Safi</span>
          </div>
          <h1 className="text-xl font-bold mt-1">Tableau de Bord Exécutif & Métriques Stratégiques</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            KPIs de performance globale et taux d'utilisation de l'Open Space, calculés en temps réel.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="bg-rose-700 hover:bg-rose-800 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-2"
        >
          <Download className="w-4 h-4" />
          <span>Synthèse Exécutive (PDF)</span>
        </button>
      </div>

      {!telemetry ? (
        <div className="p-8 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200">
          Chargement des métriques...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Taux d'Occupation Live</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-slate-900">{telemetry.overallOccupancyRate}%</div>
            <p className="text-[11px] text-slate-500">Capacité totale : {telemetry.totalCapacity} postes</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Postes Disponibles</span>
              <Building className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-black text-slate-900">{availableDesks} Postes</div>
            <p className="text-[11px] text-slate-500">Sur {telemetry.totalCapacity} postes Open Space</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Heures de Pointe</span>
              <Award className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-2xl font-black text-purple-900">{telemetry.peakHourWindow}</div>
            <p className="text-[11px] text-purple-700 font-semibold">Fenêtre d'affluence maximale (7j)</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Ratiomètre Présentiel</span>
              <Users className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black text-slate-900">{presenceRatio} pers/poste</div>
            <p className="text-[11px] text-slate-500">Occupations actives / capacité totale</p>
          </div>
        </div>
      )}

      <DigitalTwin />
      <ReservationsTable />
    </div>
  );
};
