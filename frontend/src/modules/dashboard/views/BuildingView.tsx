import React, { useState } from 'react';
import {
  Building,
  Wrench,
  Thermometer,
  Zap,
  Activity,
  Sliders,
  CheckCircle,
  AlertTriangle,
  Flame,
  Wind,
  Edit3
} from 'lucide-react';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { ReservationsTable } from '../../../shared/components/ReservationsTable';
import { WorkstationEditModal } from '../../../shared/components/WorkstationEditModal';
import { Workstation, Cluster } from '../../../types';
import { WorkspaceService } from '@/services/workspaces/workspaceService';

export const BuildingView: React.FC = () => {
  const [tempSafi, setTempSafi] = useState<number>(22.5);
  const [editingWorkstation, setEditingWorkstation] = useState<Workstation | null>(null);

  const handleSeatClick = (ws: Workstation, cl: Cluster) => {
    setEditingWorkstation(ws);
  };

  const handleRefresh = () => {
    window.dispatchEvent(new CustomEvent('xfactory_workstations_changed'));
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-xs">
              Rôle : Building Manager
            </span>
            <span className="text-xs text-slate-400">Gestion Technique Bâtiment XFactory Safi</span>
          </div>
          <h1 className="text-xl font-bold mt-1">Supervision Technique &amp; Maintenance Bâtiment</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Pilotage énergétique, climatisation centralisée, basculement en mode maintenance et modification des postes.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="bg-slate-800 px-3.5 py-2 rounded-xl border border-slate-700 flex items-center space-x-2">
            <Thermometer className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-slate-200">Temp. Consigne: <strong>{tempSafi}°C</strong></span>
          </div>

          <div className="bg-slate-800 px-3.5 py-2 rounded-xl border border-slate-700 flex items-center space-x-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-200">Efficacité Énergétique: <strong>94%</strong></span>
          </div>
        </div>
      </div>

      {/* Building Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Taux d'occupation global</span>
            <Activity className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">71.4%</div>
          <p className="text-[11px] text-emerald-600 font-semibold">40/56 postes occupés ou réservés</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Consommation Énergie</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">14.2 kWh</div>
          <p className="text-[11px] text-slate-500">Optimum écologique OCP Safi</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Qualité de l'air (IAQ)</span>
            <Wind className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">410 ppm</div>
          <p className="text-[11px] text-blue-600 font-semibold">Excellente (CO2 Safi)</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Postes en Maintenance</span>
            <Wrench className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-600">2 postes</div>
          <p className="text-[11px] text-slate-500">Cliquez sur un poste pour le modifier</p>
        </div>
      </div>

      {/* Digital Twin with Full Admin Interactivity for Maintenance */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-amber-600" />
            <span>Digital Twin - Cliquez sur n'importe quel poste pour lancer l'action Modifier</span>
          </h2>
        </div>
        <DigitalTwin onSelectSeat={handleSeatClick} />
      </div>

      <ReservationsTable />

      {/* Workstation Edit Modal for Building Manager */}
      {editingWorkstation && (
        <WorkstationEditModal
          workstation={editingWorkstation}
          clusterId={editingWorkstation.cluster_id}
          isOpen={!!editingWorkstation}
          onClose={() => setEditingWorkstation(null)}
          onSaved={handleRefresh}
        />
      )}
    </div>
  );
};
