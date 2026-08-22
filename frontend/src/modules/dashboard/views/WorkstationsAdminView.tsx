import React, { useState, useEffect } from 'react';
import { Workstation } from '@/frontend/src/types';
import { WorkspaceService } from '@/services/workspaces/workspaceService';
import {
  apiToggleSeatVisibility,
  apiCreateWorkstation,
  apiSetWorkstationEnabled,
  apiFetchClusters,
} from '@/services/api/workspaceApi';
import { Wrench, Monitor, Eye, EyeOff, CheckCircle2, AlertTriangle, Cpu, QrCode, Plus, Ban, RotateCcw, X } from 'lucide-react';
import { WorkstationEditModal } from '../../../shared/components/WorkstationEditModal';
import { SeatQRModal } from '../../../shared/components/SeatQRModal';
import { useAuth } from '../../auth/context/AuthContext';

export const WorkstationsAdminView: React.FC = () => {
  const { isAdminOrSuperAdmin } = useAuth();
  const [wsMap, setWsMap] = useState<Record<string, Workstation[]>>({});
  const [editingWorkstation, setEditingWorkstation] = useState<Workstation | null>(null);
  const [qrWorkstation, setQrWorkstation] = useState<Workstation | null>(null);

  const loadWorkstations = () => {
    // Read the live-fetched result directly rather than WorkspaceService.getSavedWorkstations(),
    // which returns its localStorage cache synchronously and only refreshes it in the
    // background - that left this admin table permanently one fetch cycle stale.
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

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // SRS §13 "Gérer postes" = CRUD for Admin/Super Admin only; Building/GCI Manager stay at RU,
  // matching the backend gate on the create/enabled endpoints.
  const [clusterOptions, setClusterOptions] = useState<{ id: string; code: string; name: string; seats: number }[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createClusterId, setCreateClusterId] = useState('');
  const [createCode, setCreateCode] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isAdminOrSuperAdmin) return;
    apiFetchClusters()
      .then((cls) =>
        setClusterOptions(
          cls.map((c) => ({ id: c.id, code: c.code, name: c.name, seats: c.workstations.length }))
        )
      )
      .catch(() => {});
  }, [isAdminOrSuperAdmin]);

  const handleCreateWorkstation = async () => {
    if (!createClusterId) {
      setErrorMessage('Sélectionnez un cluster.');
      return;
    }
    setCreating(true);
    setErrorMessage(null);
    try {
      await apiCreateWorkstation(createClusterId, createCode.trim() ? { code: createCode.trim() } : {});
      setActionMessage('Poste créé avec succès.');
      setCreateOpen(false);
      setCreateCode('');
      loadWorkstations();
    } catch (err: any) {
      setErrorMessage(err.message || 'Échec de la création du poste.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleWorkstationEnabled = async (ws: Workstation) => {
    const disabling = ws.status !== 'disabled';
    if (disabling) {
      const ok = window.confirm(
        `Désactiver le poste ${ws.code} ?\n\n` +
          "Il disparaîtra des réservations et du Digital Twin, mais son historique de réservations et d'audit est conservé. L'action est réversible."
      );
      if (!ok) return;
    }
    setErrorMessage(null);
    try {
      await apiSetWorkstationEnabled(ws.cluster_id, ws.id, !disabling);
      setActionMessage(`Poste ${ws.code} ${disabling ? 'désactivé' : 'réactivé'}.`);
      loadWorkstations();
    } catch (err: any) {
      setErrorMessage(err.message || 'Échec de la mise à jour du poste.');
    }
  };

  const handleToggleSeatVisible = async (ws: Workstation) => {
    const nextVisible = !ws.visibleToUsers;
    await apiToggleSeatVisibility(ws.cluster_id, ws.id, nextVisible);
    setActionMessage(`Poste ${ws.code} : ${nextVisible ? 'rendu visible aux' : 'masqué aux'} collaborateurs.`);
    loadWorkstations();
  };

  const handleWorkstationSaved = (code: string) => {
    setActionMessage(`Poste ${code} : modifications enregistrées.`);
    loadWorkstations();
  };

  // wsMap keys each workstation under both its cluster UUID and cluster code (for lookup
  // flexibility elsewhere), so a naive flatten double-counts every seat - dedupe by id.
  const allWorkstations: Workstation[] = Array.from(
    new Map((Object.values(wsMap) as Workstation[][]).flat().map((w) => [w.id, w])).values()
  );
  const maintenanceCount = allWorkstations.filter((w) => w.status === 'maintenance').length;

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
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">
            {isAdminOrSuperAdmin ? 'Administration des Postes' : 'Gestion Opérationnelle des Postes'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAdminOrSuperAdmin
              ? 'Administration des postes Open Space, maintenance et statut extension'
              : 'Supervision et gestion opérationnelle des postes Open Space - maintenance et visibilité'}
          </p>
        </div>
        {/* Wraps on a phone: two buttons plus the stat pills came to more than a 375px screen. */}
        <div className="flex flex-wrap items-center gap-2">
          {isAdminOrSuperAdmin && (
            <button
              onClick={() => {
                setCreateOpen(true);
                setErrorMessage(null);
              }}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-[#008751] hover:bg-[#007043] text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ajouter un poste</span>
            </button>
          )}
          <button
            onClick={handleRunNoShowScan}
            disabled={isScanning}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{isScanning ? 'Scan en cours...' : 'Scanner No-Show (Exécuter)'}</span>
          </button>
          {maintenanceCount > 0 && (
            <span className="px-3 py-1 bg-red-100 text-red-700 font-bold text-xs rounded-full flex items-center gap-1">
              <Wrench className="w-3 h-3" />
              {maintenanceCount} en maintenance
            </span>
          )}
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

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-700 hover:text-rose-900 text-xs font-bold ml-3 cursor-pointer">
            Fermer
          </button>
        </div>
      )}

      {actionMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionMessage}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-emerald-700 hover:text-emerald-900 text-xs font-bold ml-3 cursor-pointer">
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
                    onClick={() => handleToggleSeatVisible(ws)}
                    className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                    title={ws.visibleToUsers ? 'Masquer aux collaborateurs' : 'Rendre visible aux collaborateurs'}
                  >
                    {ws.visibleToUsers ? <Eye className="w-3.5 h-3.5 text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                  </button>

                  <button
                    onClick={() => setEditingWorkstation(ws)}
                    className="px-2.5 py-1 rounded bg-[#008751] hover:bg-[#007043] text-white font-bold text-[11px] inline-flex items-center space-x-1 shadow-sm transition-all cursor-pointer"
                    title="Modifier ce poste (statut, maintenance, visibilité)"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Modifier</span>
                  </button>

                  <button
                    onClick={() => setQrWorkstation(ws)}
                    className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                    title="Générer le badge QR du poste"
                  >
                    <QrCode className="w-3.5 h-3.5 text-teal-600" />
                  </button>

                  {isAdminOrSuperAdmin && (
                    <button
                      onClick={() => handleToggleWorkstationEnabled(ws)}
                      className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                      title={
                        ws.status === 'disabled'
                          ? 'Réactiver ce poste'
                          : 'Désactiver ce poste (suppression logique, historique conservé)'
                      }
                    >
                      {ws.status === 'disabled' ? (
                        <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Ban className="w-3.5 h-3.5 text-rose-600" />
                      )}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <Plus className="w-5 h-5 text-[#008751]" />
                <span>Ajouter un poste</span>
              </div>
              <button onClick={() => setCreateOpen(false)} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">Cluster *</label>
              <select
                value={createClusterId}
                onChange={(e) => setCreateClusterId(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-[#008751] outline-none"
              >
                <option value="">Sélectionner un cluster...</option>
                {clusterOptions.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.seats >= 8}>
                    {c.code} - {c.name} ({c.seats}/8 postes){c.seats >= 8 ? ' - complet' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">Code du poste</label>
              <input
                type="text"
                value={createCode}
                onChange={(e) => setCreateCode(e.target.value)}
                placeholder="Laisser vide pour générer automatiquement (ex : CL-A-W5)"
                className="w-full p-2.5 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-[#008751] outline-none"
              />
              <p className="text-[10px] text-slate-400">
                Généré à partir du code du cluster et du prochain numéro de poste libre si non renseigné.
              </p>
            </div>

            {errorMessage && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Annuler
              </button>
              <button
                onClick={handleCreateWorkstation}
                disabled={creating}
                className="px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md bg-[#008751] hover:bg-[#00703f] disabled:opacity-60 disabled:cursor-wait"
              >
                {creating ? 'Création...' : 'Créer le poste'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Workstation Modal */}
      {editingWorkstation && (
        <WorkstationEditModal
          workstation={editingWorkstation}
          clusterId={editingWorkstation.cluster_id}
          isOpen={!!editingWorkstation}
          onClose={() => setEditingWorkstation(null)}
          onSaved={() => handleWorkstationSaved(editingWorkstation.code)}
        />
      )}

      {/* Seat QR Badge Modal */}
      {qrWorkstation && (
        <SeatQRModal workstation={qrWorkstation} onClose={() => setQrWorkstation(null)} />
      )}
    </div>
  );
};
