import React, { useState } from 'react';
import {
  Cpu,
  Monitor,
  Wifi,
  HardDrive,
  Activity,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Search
} from 'lucide-react';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { ReservationsTable } from '../../../shared/components/ReservationsTable';

export const ITAdminView: React.FC = () => {
  const [ipFilter, setIpFilter] = useState<string>('');

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold text-xs">
              Rôle : IT Admin Infrastructure
            </span>
            <span className="text-xs text-slate-400">Support IT & Parc Matériel OCP Safi</span>
          </div>
          <h1 className="text-xl font-bold mt-1">Supervision Équipements IT & Réseau Bâtiment</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Diagnostic des docks USB-C, commutateurs Ethernet Gigabit, écrans 4K et capteurs d'occupation IoT.
          </p>
        </div>

        <div className="bg-slate-800 px-4 py-2 rounded-xl border border-slate-700 text-center">
          <div className="text-xs text-slate-400">Status Réseau Local</div>
          <div className="text-sm font-black text-emerald-400 flex items-center gap-1">
            <CheckCircle className="w-4 h-4" /> 1 Gbps Actif (Safi VLAN 12)
          </div>
        </div>
      </div>

      {/* IT Hardware Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold text-slate-500">Écrans UltraSharp 4K</span>
          <div className="text-2xl font-black text-slate-900">84 Écrans</div>
          <p className="text-[11px] text-emerald-600 font-semibold">100% Opérationnels</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold text-slate-500">Docking Stations USB-C</span>
          <div className="text-2xl font-black text-slate-900">56 Docks</div>
          <p className="text-[11px] text-emerald-600 font-semibold">Alimentation 100W OK</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold text-slate-500">Ports RJ45 Brassés</span>
          <div className="text-2xl font-black text-slate-900">112 Ports</div>
          <p className="text-[11px] text-slate-500">Commutateurs Cisco Catalyst</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold text-slate-500">Capteurs IoT Bâtiment</span>
          <div className="text-2xl font-black text-slate-900">56 Capteurs</div>
          <p className="text-[11px] text-emerald-600 font-semibold">Précision détection 99%</p>
        </div>
      </div>

      <DigitalTwin />
      <ReservationsTable />
    </div>
  );
};
