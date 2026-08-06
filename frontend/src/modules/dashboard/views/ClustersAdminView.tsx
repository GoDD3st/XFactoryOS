import React, { useState, useEffect, useCallback } from 'react';
import { INITIAL_CLUSTERS } from '@/services/workspaces/workspaceService';
import { apiFetchClusters, apiToggleClusterLock } from '@/services/api/workspaceApi';
import { useAuth } from '../../auth/context/AuthContext';
import { Lock, Unlock, Shield, Building, Sparkles } from 'lucide-react';

export const ClustersAdminView: React.FC = () => {
  const { currentUser } = useAuth();
  const [clusters, setClusters] = useState(INITIAL_CLUSTERS);
  const [pending, setPending] = useState<string | null>(null);

  const loadClusters = useCallback(async () => {
    const data = await apiFetchClusters();
    if (data.length > 0) setClusters(data);
  }, []);

  useEffect(() => {
    loadClusters();
  }, [loadClusters]);

  // A management cluster is "unlocked" once at least one of its seats is reservable again.
  const isClusterUnlocked = (cl: (typeof clusters)[number]) =>
    cl.workstations.length > 0 && cl.workstations.some((w) => w.status !== 'management_reserved');

  const toggleClusterLock = async (clusterId: string) => {
    const cl = clusters.find((c) => c.id === clusterId);
    if (!cl) return;
    const nextState = !isClusterUnlocked(cl);
    setPending(clusterId);
    try {
      await apiToggleClusterLock(clusterId, nextState);
      await loadClusters();
    } catch (err) {
      console.error('Cluster lock toggle failed:', err);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Gestion des Clusters & Autorisations VIP</h2>
          <p className="text-xs text-slate-500 mt-0.5">7 Clusters initiaux, déblocage des clusters réservés Management (CL-F & CL-G)</p>
        </div>
        <span className="px-3 py-1 bg-[#008751] text-white font-bold text-xs rounded-full">
          Gouvernance Safi Active
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clusters.map((cl) => {
          const isUnlocked = isClusterUnlocked(cl);
          return (
            <div key={cl.id} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    {cl.code}
                  </span>
                  <h3 className="font-bold text-sm text-slate-800 mt-1">{cl.name}</h3>
                </div>
                {cl.is_management_only ? (
                  <span className="p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
                    <Lock className="w-4 h-4" />
                  </span>
                ) : (
                  <span className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
                    <Building className="w-4 h-4" />
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{cl.description}</p>
              <div className="text-[11px] font-semibold text-slate-400">{cl.location_zone} • {cl.desk_count} postes</div>

              {cl.is_management_only && (
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-700">Accès VIP Direction</span>
                  <button
                    onClick={() => toggleClusterLock(cl.id)}
                    disabled={pending === cl.id}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      pending === cl.id ? 'opacity-60 cursor-wait' : 'cursor-pointer'
                    } ${
                      isUnlocked
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                        : 'bg-amber-500 text-white hover:bg-amber-600'
                    }`}
                  >
                    {isUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    <span>{isUnlocked ? 'Débloqué' : 'Autoriser Accès'}</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
