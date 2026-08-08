import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { INITIAL_CLUSTERS } from '@/services/workspaces/workspaceService';
import {
  apiFetchClusters,
  apiToggleClusterLock,
  apiSetClusterVip,
  apiGetClusterVipMembers,
  apiAddClusterVipMember,
  apiRemoveClusterVipMember,
  apiAddExtensionSeat,
  apiLookupUsers,
} from '@/services/api/workspaceApi';
import { useAuth } from '../../auth/context/AuthContext';
import { Lock, Unlock, Shield, Building, Sparkles, Star, StarOff, UserPlus, X, Plus, ChevronDown, ChevronUp } from 'lucide-react';

interface VipMember {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  assigned_at: string;
}

interface UserLookupEntry {
  id: string;
  full_name: string;
  email: string;
  department: string;
}

export const ClustersAdminView: React.FC = () => {
  const { currentUser } = useAuth();
  const [clusters, setClusters] = useState(INITIAL_CLUSTERS);
  const [pending, setPending] = useState<string | null>(null);
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>(null);
  const [membersByCluster, setMembersByCluster] = useState<Record<string, VipMember[]>>({});
  const [userLookup, setUserLookup] = useState<UserLookupEntry[]>([]);
  const [memberSearch, setMemberSearch] = useState<string>('');

  const loadClusters = useCallback(async () => {
    const data = await apiFetchClusters();
    if (data.length > 0) setClusters(data);
  }, []);

  useEffect(() => {
    loadClusters();
    apiLookupUsers().then(setUserLookup);
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

  const toggleVip = async (clusterId: string, currentlyVip: boolean) => {
    setPending(clusterId);
    try {
      await apiSetClusterVip(clusterId, !currentlyVip);
      await loadClusters();
    } catch (err: any) {
      alert(err.message || 'Échec du changement de statut VIP.');
    } finally {
      setPending(null);
    }
  };

  const openMembers = async (clusterId: string) => {
    if (expandedClusterId === clusterId) {
      setExpandedClusterId(null);
      return;
    }
    setExpandedClusterId(clusterId);
    setMemberSearch('');
    if (!membersByCluster[clusterId]) {
      const members = await apiGetClusterVipMembers(clusterId);
      setMembersByCluster((prev) => ({ ...prev, [clusterId]: members }));
    }
  };

  const addMember = async (clusterId: string, userId: string) => {
    setPending(`member-${clusterId}`);
    try {
      await apiAddClusterVipMember(clusterId, userId);
      const members = await apiGetClusterVipMembers(clusterId);
      setMembersByCluster((prev) => ({ ...prev, [clusterId]: members }));
      setMemberSearch('');
    } catch (err: any) {
      alert(err.message || "Échec de l'assignation.");
    } finally {
      setPending(null);
    }
  };

  const removeMember = async (clusterId: string, userId: string) => {
    setPending(`member-${clusterId}`);
    try {
      await apiRemoveClusterVipMember(clusterId, userId);
      const members = await apiGetClusterVipMembers(clusterId);
      setMembersByCluster((prev) => ({ ...prev, [clusterId]: members }));
    } catch (err: any) {
      alert(err.message || 'Échec du retrait.');
    } finally {
      setPending(null);
    }
  };

  const addSeat = async (clusterId: string) => {
    setPending(`seat-${clusterId}`);
    try {
      await apiAddExtensionSeat(clusterId);
      await loadClusters();
    } catch (err: any) {
      alert(err.message || "Échec de l'ajout du poste.");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Gestion des Clusters & Autorisations VIP</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            7 Clusters initiaux — marquer un cluster VIP, assigner des membres, ajouter des postes (max 8/cluster)
          </p>
        </div>
        <span className="px-3 py-1 bg-[#008751] text-white font-bold text-xs rounded-full">
          Gouvernance Safi Active
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clusters.map((cl) => {
          const isUnlocked = isClusterUnlocked(cl);
          const seatCount = cl.workstations.length;
          const isExpanded = expandedClusterId === cl.id;
          const members = membersByCluster[cl.id] || [];
          const memberIds = new Set(members.map((m) => m.user_id));
          const filteredCandidates = userLookup.filter(
            (u) =>
              !memberIds.has(u.id) &&
              (u.full_name.toLowerCase().includes(memberSearch.toLowerCase()) ||
                u.email.toLowerCase().includes(memberSearch.toLowerCase()))
          );

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
              <div className="text-[11px] font-semibold text-slate-400">
                {cl.location_zone} • {seatCount}/8 postes
              </div>

              {/* VIP toggle — available to Super Admin/Admin/Director/EA for any cluster */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500">Statut VIP</span>
                <button
                  onClick={() => toggleVip(cl.id, cl.is_management_only)}
                  disabled={pending === cl.id}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                    pending === cl.id ? 'opacity-60 cursor-wait' : 'cursor-pointer'
                  } ${
                    cl.is_management_only
                      ? 'bg-purple-600 text-white hover:bg-purple-500'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cl.is_management_only ? <Star className="w-3.5 h-3.5" /> : <StarOff className="w-3.5 h-3.5" />}
                  <span>{cl.is_management_only ? 'VIP Actif' : 'Marquer VIP'}</span>
                </button>
              </div>

              {cl.is_management_only && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-amber-700">Accès Cluster</span>
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
                      <span>{isUnlocked ? 'Débloqué' : 'Verrouillé'}</span>
                    </button>
                  </div>

                  <button
                    onClick={() => openMembers(cl.id)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-purple-50 border border-purple-200 text-purple-800 text-xs font-bold hover:bg-purple-100 transition-all"
                  >
                    <span className="flex items-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5" />
                      Membres assignés ({members.length || (membersByCluster[cl.id] ? 0 : '…')})
                    </span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {isExpanded && (
                    <div className="space-y-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                      {members.length === 0 && (
                        <p className="text-[11px] text-slate-400 italic">Aucun membre assigné pour l'instant.</p>
                      )}
                      {members.map((m) => (
                        <div key={m.id} className="flex items-center justify-between text-xs bg-white rounded-lg px-2.5 py-1.5 border border-slate-200">
                          <div>
                            <div className="font-bold text-slate-800">{m.full_name}</div>
                            <div className="text-slate-400 text-[10px]">{m.email}</div>
                          </div>
                          <button
                            onClick={() => removeMember(cl.id, m.user_id)}
                            disabled={pending === `member-${cl.id}`}
                            className="p-1 rounded hover:bg-rose-50 text-rose-500"
                            title="Retirer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}

                      <div className="relative pt-1">
                        <input
                          type="text"
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          placeholder="Rechercher un collaborateur à assigner..."
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-400/40"
                        />
                        {memberSearch.trim() && (
                          <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                            {filteredCandidates.length === 0 && (
                              <p className="text-[11px] text-slate-400 italic px-2.5 py-1.5">Aucun résultat.</p>
                            )}
                            {filteredCandidates.slice(0, 8).map((u) => (
                              <button
                                key={u.id}
                                onClick={() => addMember(cl.id, u.id)}
                                disabled={pending === `member-${cl.id}`}
                                className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-purple-50 flex items-center justify-between"
                              >
                                <span>
                                  <span className="font-bold text-slate-800">{u.full_name}</span>{' '}
                                  <span className="text-slate-400">({u.department})</span>
                                </span>
                                <Plus className="w-3 h-3 text-purple-600" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              <button
                onClick={() => addSeat(cl.id)}
                disabled={seatCount >= 8 || pending === `seat-${cl.id}`}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              >
                <Plus className="w-3.5 h-3.5" />
                {seatCount >= 8 ? 'Capacité maximale (8)' : `Ajouter un poste (${seatCount}/8)`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
