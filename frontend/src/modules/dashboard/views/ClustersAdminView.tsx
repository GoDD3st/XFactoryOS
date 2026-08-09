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
import { UserRole } from '../../../types';
import {
  Lock,
  Unlock,
  Shield,
  Building,
  Sparkles,
  Star,
  StarOff,
  UserPlus,
  X,
  Plus,
  ChevronDown,
  ChevronUp,
  Globe,
  Clock,
  AlertCircle,
} from 'lucide-react';

// SRS 8.1/8.4/8.6/8.7: seat-adding authority mirrors the backend's VIP_ROLES gate
// (backend/routes/workspaces.routes.ts) — Building Manager can view this screen but does not
// have this specific authority, so the button/form must not appear for them either.
const SEAT_MANAGEMENT_ROLES: UserRole[] = ['director', 'executive_assistant', 'gci_manager', 'admin', 'super_admin'];

const DURATION_PRESETS: { label: string; minutes: number }[] = [
  { label: '30 min', minutes: 30 },
  { label: '1 h', minutes: 60 },
  { label: '2 h', minutes: 120 },
  { label: '4 h', minutes: 240 },
  { label: '8 h', minutes: 480 },
];

interface SeatFormState {
  reason: string;
  visibility: 'public' | 'private';
  durationType: 'permanent' | 'temporary';
  tempMode: 'preset' | 'range';
  presetMinutes: number;
  startAt: string; // datetime-local value
  endAt: string; // datetime-local value
}

const EMPTY_SEAT_FORM: SeatFormState = {
  reason: '',
  visibility: 'public',
  durationType: 'permanent',
  tempMode: 'preset',
  presetMinutes: 60,
  startAt: '',
  endAt: '',
};

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
  const { currentUser, currentRole } = useAuth();
  const canManageSeats = SEAT_MANAGEMENT_ROLES.includes(currentRole);
  const [clusters, setClusters] = useState(INITIAL_CLUSTERS);
  const [pending, setPending] = useState<string | null>(null);
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>(null);
  const [membersByCluster, setMembersByCluster] = useState<Record<string, VipMember[]>>({});
  const [userLookup, setUserLookup] = useState<UserLookupEntry[]>([]);
  const [memberSearch, setMemberSearch] = useState<string>('');
  const [seatModalClusterId, setSeatModalClusterId] = useState<string | null>(null);
  const [seatForm, setSeatForm] = useState<SeatFormState>(EMPTY_SEAT_FORM);
  const [seatFormError, setSeatFormError] = useState<string | null>(null);

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

  const openSeatModal = (clusterId: string) => {
    setSeatForm(EMPTY_SEAT_FORM);
    setSeatFormError(null);
    setSeatModalClusterId(clusterId);
  };

  const closeSeatModal = () => {
    setSeatModalClusterId(null);
    setSeatFormError(null);
  };

  const submitSeatForm = async () => {
    if (!seatModalClusterId) return;

    const reason = seatForm.reason.trim();
    if (reason.length < 3) {
      setSeatFormError('Le motif doit contenir au moins 3 caractères.');
      return;
    }

    let startAt: string | undefined;
    let endAt: string | undefined;

    if (seatForm.durationType === 'temporary') {
      if (seatForm.tempMode === 'preset') {
        // The timer starts when Valider is pressed, not when the form was opened.
        const start = new Date();
        startAt = start.toISOString();
        endAt = new Date(start.getTime() + seatForm.presetMinutes * 60000).toISOString();
      } else {
        if (!seatForm.startAt || !seatForm.endAt) {
          setSeatFormError('Précisez une heure de début et une heure de fin.');
          return;
        }
        startAt = new Date(seatForm.startAt).toISOString();
        endAt = new Date(seatForm.endAt).toISOString();
        if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
          setSeatFormError('L\'heure de fin doit être postérieure à l\'heure de début.');
          return;
        }
      }
    }

    setPending(`seat-${seatModalClusterId}`);
    setSeatFormError(null);
    try {
      await apiAddExtensionSeat(seatModalClusterId, {
        reason,
        isPublic: seatForm.visibility === 'public',
        isTemporary: seatForm.durationType === 'temporary',
        startAt,
        endAt,
      });
      await loadClusters();
      closeSeatModal();
    } catch (err: any) {
      setSeatFormError(err.message || "Échec de l'ajout du poste.");
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

              {canManageSeats && (
                <button
                  onClick={() => openSeatModal(cl.id)}
                  disabled={seatCount >= 8 || pending === `seat-${cl.id}`}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {seatCount >= 8 ? 'Capacité maximale (8)' : `Ajouter un poste (${seatCount}/8)`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {seatModalClusterId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <Plus className="w-5 h-5 text-[#008751]" />
                <span>
                  Ajouter un poste — {clusters.find((c) => c.id === seatModalClusterId)?.name || ''}
                </span>
              </div>
              <button onClick={closeSeatModal} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">Motif de l'ajout *</label>
              <textarea
                rows={2}
                value={seatForm.reason}
                onChange={(e) => setSeatForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Ex : Renfort ponctuel pour l'équipe projet X"
                className="w-full p-3 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-[#008751] outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">Visibilité</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSeatForm((f) => ({ ...f, visibility: 'public' }))}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                    seatForm.visibility === 'public'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  Public
                </button>
                <button
                  type="button"
                  onClick={() => setSeatForm((f) => ({ ...f, visibility: 'private' }))}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                    seatForm.visibility === 'private'
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  Privé
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                {seatForm.visibility === 'public'
                  ? 'Réservable par tout collaborateur.'
                  : 'Réservé aux rôles VIP et aux membres explicitement assignés au cluster.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">Durée</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSeatForm((f) => ({ ...f, durationType: 'permanent' }))}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                    seatForm.durationType === 'permanent'
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Permanent
                </button>
                <button
                  type="button"
                  onClick={() => setSeatForm((f) => ({ ...f, durationType: 'temporary' }))}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                    seatForm.durationType === 'temporary'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  Temporaire
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                {seatForm.durationType === 'permanent'
                  ? "Le poste reste actif jusqu'à sa désactivation manuelle."
                  : "Le poste se désactive automatiquement à la fin de la période choisie."}
              </p>
            </div>

            {seatForm.durationType === 'temporary' && (
              <div className="space-y-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSeatForm((f) => ({ ...f, tempMode: 'preset' }))}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                      seatForm.tempMode === 'preset'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-amber-800 border-amber-300'
                    }`}
                  >
                    Durée rapide
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeatForm((f) => ({ ...f, tempMode: 'range' }))}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                      seatForm.tempMode === 'range'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-amber-800 border-amber-300'
                    }`}
                  >
                    Plage horaire
                  </button>
                </div>

                {seatForm.tempMode === 'preset' ? (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-1.5">
                      {DURATION_PRESETS.map((p) => (
                        <button
                          key={p.minutes}
                          type="button"
                          onClick={() => setSeatForm((f) => ({ ...f, presetMinutes: p.minutes }))}
                          className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all ${
                            seatForm.presetMinutes === p.minutes
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-100'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-amber-700">
                      Le chronomètre démarre au clic sur "Valider" et s'arrête automatiquement {DURATION_PRESETS.find((p) => p.minutes === seatForm.presetMinutes)?.label.toLowerCase()} plus tard.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-amber-800 block mb-0.5">Début</label>
                      <input
                        type="datetime-local"
                        value={seatForm.startAt}
                        onChange={(e) => setSeatForm((f) => ({ ...f, startAt: e.target.value }))}
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-amber-800 block mb-0.5">Fin</label>
                      <input
                        type="datetime-local"
                        value={seatForm.endAt}
                        onChange={(e) => setSeatForm((f) => ({ ...f, endAt: e.target.value }))}
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {seatFormError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{seatFormError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={closeSeatModal}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Annuler
              </button>
              <button
                onClick={submitSeatForm}
                disabled={pending === `seat-${seatModalClusterId}`}
                className="px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md bg-[#008751] hover:bg-[#00703f] disabled:opacity-60 disabled:cursor-wait"
              >
                {pending === `seat-${seatModalClusterId}` ? 'Ajout...' : 'Valider'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
