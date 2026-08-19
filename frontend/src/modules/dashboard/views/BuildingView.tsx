import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  CalendarClock,
  AlertTriangle,
  Wrench,
  KeyRound,
  Bell
} from 'lucide-react';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { ReservationsTable } from '../../../shared/components/ReservationsTable';
import { WorkstationEditModal } from '../../../shared/components/WorkstationEditModal';
import { Workstation, Cluster, ClusterAuthorization } from '../../../types';
import { SiteTelemetrySummary } from '@/services/telemetry/telemetryService';
import { apiFetchOccupancy } from '@/services/api/telemetryApi';
import { apiFetchNoShowStats, NoShowStats } from '@/services/api/noShowApi';
import { apiFetchPendingClusterAccessRequests } from '@/services/api/workspaceApi';

export const BuildingView: React.FC = () => {
  const [editingWorkstation, setEditingWorkstation] = useState<Workstation | null>(null);
  const [telemetry, setTelemetry] = useState<SiteTelemetrySummary | null>(null);
  const [noShowStats, setNoShowStats] = useState<NoShowStats>({ today: 0, thisWeek: 0, perCluster: {} });
  const [pendingAccessRequests, setPendingAccessRequests] = useState<ClusterAuthorization[]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadOverview = () => {
    apiFetchOccupancy().then(setTelemetry);
    apiFetchNoShowStats().then(setNoShowStats);
    apiFetchPendingClusterAccessRequests().then(setPendingAccessRequests);
  };

  useEffect(() => {
    loadOverview();
    window.addEventListener('xfactory_reservations_changed', loadOverview);
    window.addEventListener('xfactory_workstations_changed', loadOverview);
    return () => {
      window.removeEventListener('xfactory_reservations_changed', loadOverview);
      window.removeEventListener('xfactory_workstations_changed', loadOverview);
    };
  }, []);

  const handleSeatClick = (ws: Workstation, cl: Cluster) => {
    setEditingWorkstation(ws);
  };

  const handleWorkstationSaved = () => {
    setActionMessage(`Poste ${editingWorkstation?.code} : modifications enregistrées.`);
    window.dispatchEvent(new CustomEvent('xfactory_workstations_changed'));
  };

  const availableTotal = telemetry?.clusters.reduce((sum, c) => sum + c.availableDesks, 0) ?? 0;
  const reservedTotal = telemetry?.clusters.reduce((sum, c) => sum + c.reservedDesks, 0) ?? 0;
  const clustersInMaintenance = telemetry?.clusters.filter((c) => c.maintenanceDesks > 0) ?? [];

  const alerts: { key: string; label: string }[] = [
    ...pendingAccessRequests.map((r) => ({
      key: `req-${r.id}`,
      label: `Cluster ${r.cluster_code || r.cluster_id} - accès demandé par ${r.requester_name || 'un collaborateur'}`,
    })),
    ...(noShowStats.today > 0
      ? [{ key: 'noshow', label: `${noShowStats.today} no-show${noShowStats.today > 1 ? 's' : ''} aujourd'hui` }]
      : []),
    ...clustersInMaintenance.map((c) => ({
      key: `maint-${c.clusterId}`,
      label: `Cluster ${c.clusterCode} - ${c.maintenanceDesks} poste${c.maintenanceDesks > 1 ? 's' : ''} en maintenance`,
    })),
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-xs">
              Rôle : Building Manager
            </span>
            <span className="text-xs text-slate-400">Gestion Opérationnelle Open Space Safi</span>
          </div>
          <h1 className="text-xl font-bold mt-1">Supervision de l'Occupation &amp; des Réservations</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Disponibilité, discipline et reporting de l'Open Space - occupation, réservations, anomalies et clusters réservés.
          </p>
        </div>

        <div className="bg-slate-800 px-3.5 py-2 rounded-xl border border-slate-700 flex items-center space-x-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span className="text-xs text-slate-200">Temps réel</span>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-emerald-700 hover:text-emerald-900 text-xs font-bold ml-3 cursor-pointer">
            Fermer
          </button>
        </div>
      )}

      {/* Operational KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Occupation</span>
            <Activity className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{telemetry?.overallOccupancyRate ?? ''}%</div>
          <p className="text-[11px] text-slate-500">{telemetry?.activeOccupancy ?? 0}/{telemetry?.totalCapacity ?? 0} postes occupés ou réservés</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Disponibles</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{availableTotal}</div>
          <p className="text-[11px] text-slate-500">postes libres maintenant</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Réservés</span>
            <CalendarClock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{reservedTotal}</div>
          <p className="text-[11px] text-slate-500">réservations actives</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">No-Show</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-600">{noShowStats.today}</div>
          <p className="text-[11px] text-slate-500">aujourd'hui · {noShowStats.thisWeek} cette semaine</p>
        </div>
      </div>

      {/* Digital Twin */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-amber-600" />
            <span>Digital Twin - Cliquez sur un poste pour le modifier</span>
          </h2>
        </div>
        <DigitalTwin onSelectSeat={handleSeatClick} adminEditMode />
      </div>

      {/* Alerts / Actions */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-600" />
          <span>Alertes / Actions</span>
        </h3>
        {alerts.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">Aucune anomalie détectée pour le moment.</p>
        ) : (
          <ul className="space-y-1.5">
            {alerts.map((a) => (
              <li key={a.key} className="flex items-center gap-2 text-xs text-slate-700">
                {a.key.startsWith('req-') ? (
                  <KeyRound className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                ) : a.key === 'noshow' ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                ) : (
                  <Wrench className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                )}
                <span>{a.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ReservationsTable />

      {/* Workstation Edit Modal for Building Manager */}
      {editingWorkstation && (
        <WorkstationEditModal
          workstation={editingWorkstation}
          clusterId={editingWorkstation.cluster_id}
          isOpen={!!editingWorkstation}
          onClose={() => setEditingWorkstation(null)}
          onSaved={handleWorkstationSaved}
        />
      )}
    </div>
  );
};
