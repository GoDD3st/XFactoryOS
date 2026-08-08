import React, { useEffect, useState } from 'react';
import {
  Cpu,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Network
} from 'lucide-react';
import { apiFetchHardwareDiagnostics, apiResetHardwarePort } from '@/services/api/hardwareApi';
import { HardwareDiagnosticsInfo } from '@/frontend/src/types';

export const ITAdminView: React.FC = () => {
  const [diagnostics, setDiagnostics] = useState<HardwareDiagnosticsInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resettingPort, setResettingPort] = useState<string | null>(null);

  const loadDiagnostics = () => {
    setLoading(true);
    apiFetchHardwareDiagnostics().then((data) => {
      setDiagnostics(data);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadDiagnostics();
  }, []);

  const handleResetPort = async (code: string) => {
    setResettingPort(code);
    try {
      await apiResetHardwarePort(code);
      loadDiagnostics();
    } finally {
      setResettingPort(null);
    }
  };

  const filtered = diagnostics.filter(
    (d) => d.workstation_code.toLowerCase().includes(search.toLowerCase()) || d.cluster_code.toLowerCase().includes(search.toLowerCase())
  );

  const online = diagnostics.filter((d) => d.port_status === 'online').length;
  const degraded = diagnostics.filter((d) => d.port_status === 'degraded').length;
  const offline = diagnostics.filter((d) => d.port_status === 'offline').length;

  return (
    <div className="space-y-6">
      {/* Header Banner — IT/hardware scope only per SRS RBAC (Administration technique = CRUD
          for IT Admin); reservations/occupancy are out of scope for this role's home view. */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold text-xs">
              Rôle : IT Admin Infrastructure
            </span>
            <span className="text-xs text-slate-400">Administration Technique OCP Safi</span>
          </div>
          <h1 className="text-xl font-bold mt-1">Supervision du Parc Matériel</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            État des ports réseau par poste — {diagnostics.length} poste(s) supervisé(s).
          </p>
        </div>

        <button
          onClick={loadDiagnostics}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all border border-slate-700"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Actualiser</span>
        </button>
      </div>

      {/* Real aggregate counts, derived from the same diagnostics list below */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Ports en Ligne</span>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{online}</div>
          <p className="text-[11px] text-emerald-600 font-semibold">Sur {diagnostics.length} postes</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Ports Dégradés</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{degraded}</div>
          <p className="text-[11px] text-amber-600 font-semibold">Postes en maintenance</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Ports Hors Ligne</span>
            <Network className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{offline}</div>
          <p className="text-[11px] text-slate-500">Aucune donnée disponible</p>
        </div>
      </div>

      {/* Per-desk diagnostics table */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#008751]" />
            <h3 className="font-bold text-sm text-slate-800">Diagnostics par Poste</h3>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer par poste/cluster..."
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-medium focus:outline-none focus:border-[#008751]"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-center text-xs text-slate-400">Chargement des diagnostics...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[9px]">
                  <th className="py-2 px-2">Poste</th>
                  <th className="py-2 px-2">Cluster</th>
                  <th className="py-2 px-2">Port RJ45</th>
                  <th className="py-2 px-2">Débit</th>
                  <th className="py-2 px-2">Statut</th>
                  <th className="py-2 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((d) => (
                  <tr key={d.workstation_code} className="hover:bg-slate-50/80">
                    <td className="py-2 px-2 font-bold text-slate-800">{d.workstation_code}</td>
                    <td className="py-2 px-2 text-slate-500">{d.cluster_code}</td>
                    <td className="py-2 px-2 font-mono text-slate-500">{d.rj45_port}</td>
                    <td className="py-2 px-2 text-slate-500">{d.link_speed}</td>
                    <td className="py-2 px-2">
                      <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase ${
                        d.port_status === 'online' ? 'bg-emerald-50 text-emerald-700' :
                        d.port_status === 'degraded' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {d.port_status}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <button
                        onClick={() => handleResetPort(d.workstation_code)}
                        disabled={resettingPort === d.workstation_code}
                        className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[9px] disabled:opacity-50"
                      >
                        {resettingPort === d.workstation_code ? '...' : 'Reset'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">Aucun poste trouvé.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
