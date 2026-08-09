import React, { useState, useEffect } from 'react';
import { Workstation } from '@/frontend/src/types';
import { WorkspaceService } from '@/services/workspaces/workspaceService';
import { apiToggleSeatMaintenance, apiToggleSeatVisibility } from '@/services/api/workspaceApi';
import { Wrench, Monitor, Eye, EyeOff, CheckCircle2, AlertTriangle, Cpu, Edit3 } from 'lucide-react';
import { WorkstationEditModal } from '../../../shared/components/WorkstationEditModal';

export const WorkstationsAdminView: React.FC = () => {
  const [wsMap, setWsMap] = useState<Record<string, Workstation[]>>({});
  const [editingWorkstation, setEditingWorkstation] = useState<Workstation | null>(null);

  const loadWorkstations = () => {
    // Read the live-fetched result directly rather than WorkspaceService.getSavedWorkstations(),
    // which returns its localStorage cache synchronously and only refreshes it in the
    // background — that left this admin table permanently one fetch cycle stale.
    WorkspaceService.fetchClustersWithOverlays().then((clusters) => {
      const map: Record<string, Workstation[]> = {};
      clusters.forEach((c) => { map[c.id] = c.workstations; });
      setWsMap(map);
    });
  };

  useEffect(() => {
    loadWorkstations();
    window.addEventListener('xfactory_workstations_changed', loadWorkstations);
    return () => window.removeEventListener('xfactory_workstations_changed', loadWorkstations);
  }, []);

  const handleToggleMaintenance = async (clusterId: string, seatId: string, currentStatus: string) => {
    const isMaint = currentStatus === 'maintenance';
    await apiToggleSeatMaintenance(clusterId, seatId, !isMaint);
    loadWorkstations();
  };

  const handleToggleExtensionVisible = async (clusterId: string, seatId: string, currentVisible?: boolean) => {
    await apiToggleSeatVisibility(clusterId, seatId, !currentVisible);
    loadWorkstations();
  };

  // wsMap keys each workstation under both its cluster UUID and cluster code (for lookup
  // flexibility elsewhere), so a naive flatten double-counts every seat — dedupe by id.
  const allWorkstations: Workstation[] = Array.from(
    new Map((Object.values(wsMap) as Workstation[][]).flat().map((w) => [w.id, w])).values()
  );

  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  const handleRunNoShowScan = async () => {
    setIsScanning(true);
    setScanResult(null);
    try {
      const { NoShowService } = await import('@/services/noshow/noShowService');
      const count = await NoShowService.detectNoShows();
      if (count > 0) {
        setScanResult(`Scan terminé : ${count} réservation(s) sans check-in annulée(s) et poste(s) libéré(s).`);
      } else {
        setScanResult('Scan terminé : Aucun no-show détecté sur les créneaux actuels.');
      }
      loadWorkstations();
    } catch (err: any) {
      setScanResult(`Erreur lors du scan : ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Gestion &amp; Modification des Postes</h2>
          <p className="text-xs text-slate-500 mt-0.5">Administration des 56 postes Open Space, maintenance et statut extension</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleRunNoShowScan}
            disabled={isScanning}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{isScanning ? 'Scan en cours...' : 'Scanner No-Show (Exécuter)'}</span>
          </button>
          <span className="px-3 py-1 bg-slate-900 text-white font-bold text-xs rounded-full">
            {allWorkstations.length} Postes Enregistrés
          </span>
        </div>
      </div>

      {scanResult && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{scanResult}</span>
          </div>
          <button onClick={() => setScanResult(null)} className="text-amber-700 hover:text-amber-900 text-xs font-bold ml-3 cursor-pointer">
            Fermer
          </button>
        </div>
      )}

      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
              <th className="py-2.5 px-3">Code Poste</th>
              <th className="py-2.5 px-3">Cluster ID</th>
              <th className="py-2.5 px-3">Statut</th>
              <th className="py-2.5 px-3">Extension Admin</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allWorkstations.map((ws) => (
              <tr key={ws.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3 px-3 font-bold text-slate-800">{ws.code}</td>
                <td className="py-3 px-3 text-slate-600">{ws.cluster_id.toUpperCase()}</td>
                <td className="py-3 px-3">
                  <span
                    className={`px-2 py-0.5 rounded font-bold text-[10px] capitalize ${
                      ws.status === 'disponible'
                        ? 'bg-emerald-100 text-emerald-800'
                        : ws.status === 'maintenance'
                        ? 'bg-red-100 text-red-800'
                        : ws.status === 'occupé'
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {ws.status}
                  </span>
                </td>
                <td className="py-3 px-3 font-semibold text-slate-600">
                  {ws.is_extension ? (
                    <span className="text-amber-700 font-bold">Extension (Poste {ws.seat_number})</span>
                  ) : (
                    'Standard'
                  )}
                </td>
                <td className="py-3 px-3 text-right space-x-1.5">
                  <button
                    onClick={() => setEditingWorkstation(ws)}
                    className="px-2.5 py-1 rounded bg-[#008751] hover:bg-[#007043] text-white font-bold text-[11px] inline-flex items-center space-x-1 shadow-sm transition-all cursor-pointer"
                    title="Modifier ce poste"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Modifier</span>
                  </button>

                  {ws.is_extension && (
                    <button
                      onClick={() => handleToggleExtensionVisible(ws.cluster_id, ws.id, ws.visibleToUsers)}
                      className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                      title="Basculer visibilité utilisateur"
                    >
                      {ws.visibleToUsers ? <Eye className="w-3.5 h-3.5 text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                    </button>
                  )}

                  <button
                    onClick={() => handleToggleMaintenance(ws.cluster_id, ws.id, ws.status)}
                    className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                    title="Basculer statut maintenance"
                  >
                    <Wrench className="w-3.5 h-3.5 text-amber-600" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Workstation Modal */}
      {editingWorkstation && (
        <WorkstationEditModal
          workstation={editingWorkstation}
          clusterId={editingWorkstation.cluster_id}
          isOpen={!!editingWorkstation}
          onClose={() => setEditingWorkstation(null)}
          onSaved={loadWorkstations}
        />
      )}
    </div>
  );
};
