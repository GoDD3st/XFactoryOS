import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  Award,
  Building,
  Download,
  CheckCircle2,
  Clock,
  Wrench
} from 'lucide-react';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { ReservationsTable } from '../../../shared/components/ReservationsTable';
import { SiteTelemetrySummary } from '@/services/telemetry/telemetryService';
import { apiFetchOccupancy } from '@/services/api/telemetryApi';
import { apiFetchPendingApprovals } from '@/services/api/approvalApi';
import { ApprovalRequest } from '../../../types';

export const DirectionView: React.FC = () => {
  const [telemetry, setTelemetry] = useState<SiteTelemetrySummary | null>(null);
  // BR-06 makes approving long-duration reservations this role's defining function, but it was
  // absent from its home screen entirely - the pending queue lived only behind the Approbations
  // tab, so nothing here signalled that a decision was waiting.
  const [pending, setPending] = useState<ApprovalRequest[]>([]);

  useEffect(() => {
    const loadPending = () => apiFetchPendingApprovals().then(setPending).catch(() => {});
    loadPending();
    window.addEventListener('xfactory_approvals_changed', loadPending);
    return () => window.removeEventListener('xfactory_approvals_changed', loadPending);
  }, []);

  useEffect(() => {
    // Via the API: Director sits outside p_reservations_owner_read, so computing this in the
    // browser aggregated only this user's own reservations. See services/api/telemetryApi.ts.
    const refresh = () => apiFetchOccupancy().then(setTelemetry);
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
            <span className="text-xs text-slate-400">Direction Générale - Site Safi</span>
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
              <span className="text-xs font-bold text-slate-500">Demandes longue durée</span>
              <CheckCircle2 className="w-4 h-4 text-purple-600" />
            </div>
            <div className={`text-2xl font-black ${pending.length > 0 ? 'text-purple-700' : 'text-slate-900'}`}>
              {pending.length}
            </div>
            <p className="text-[11px] text-slate-500">en attente de votre décision</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Approvals - the Director's actual decision surface */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-600" />
            Demandes longue durée en attente
            {pending.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                {pending.length}
              </span>
            )}
          </h3>

          {pending.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-4 text-center">
              Aucune demande en attente de décision.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {pending.slice(0, 5).map((req) => (
                  <div key={req.id} className="p-3 rounded-xl bg-purple-50/50 border border-purple-200 text-xs">
                    <div className="font-bold text-slate-900">
                      {req.requester_name}
                      {req.user_department && (
                        <span className="ml-2 font-normal text-slate-500">{req.user_department}</span>
                      )}
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      Du {req.reservation_date} au {req.end_date}
                      {req.duration_days ? ` · ${req.duration_days} jours` : ''}
                      {req.workstation_code ? ` · Poste ${req.workstation_code}` : ''}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                Approuver ou refuser depuis l'onglet <strong>Approbations</strong> - un motif est
                obligatoire en cas de refus.
              </p>
            </>
          )}
        </div>

        {/* Cluster usage */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building className="w-4 h-4 text-cyan-600" />
            Utilisation des clusters
          </h3>
          {!telemetry ? (
            <p className="text-xs text-slate-400">Chargement...</p>
          ) : (
            <div className="space-y-2">
              {[...telemetry.clusters]
                .sort((a, b) => b.occupancyRate - a.occupancyRate)
                .map((c) => (
                  <div key={c.clusterId} className="flex items-center gap-3">
                    <div className="w-24 shrink-0 text-xs font-bold text-slate-800 flex items-center gap-1">
                      {c.clusterCode}
                      {c.maintenanceDesks > 0 && (
                        <span title={`${c.maintenanceDesks} en maintenance`}>
                          <Wrench className="w-3 h-3 text-red-500" />
                        </span>
                      )}
                    </div>
                    <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-cyan-500" style={{ width: `${c.occupancyRate}%` }} />
                    </div>
                    <div className="w-24 shrink-0 text-right text-[11px] font-semibold text-slate-600">
                      {c.occupancyRate}% ({c.availableDesks} libres)
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      <DigitalTwin />
      <ReservationsTable />
    </div>
  );
};
