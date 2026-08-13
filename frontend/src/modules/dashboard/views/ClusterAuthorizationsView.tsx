import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Lock, Unlock, Clock, ShieldCheck, XCircle, History } from 'lucide-react';
import { ClusterAuthorization } from '../../../types';
import { apiFetchClusterAccessHistory, apiFetchClusters } from '@/services/api/workspaceApi';
import { ClusterAccessRequestsPanel } from '../../../shared/components/ClusterAccessRequestsPanel';

/**
 * BR-09 / SRS §14.4 + §2156-2158 — the GCI Manager's defining screen.
 *
 * Management clusters are locked by default; access is granted per request, for a bounded
 * window, and every decision is auditable. This view shows the three states that matter:
 * what is waiting on a decision, what is currently open (and until when), and what was
 * decided before.
 */

function formatRemaining(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return 'expirée';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} j ${hours} h restantes`;
  if (hours > 0) return `${hours} h ${minutes} min restantes`;
  return `${minutes} min restantes`;
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  APPROVED: { label: 'Autorisée', className: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'Refusée', className: 'bg-rose-100 text-rose-700' },
  PENDING: { label: 'En attente', className: 'bg-amber-100 text-amber-700' },
  INFO_REQUESTED: { label: 'Info demandée', className: 'bg-sky-100 text-sky-700' },
};

export const ClusterAuthorizationsView: React.FC = () => {
  const [history, setHistory] = useState<ClusterAuthorization[]>([]);
  const [managementClusters, setManagementClusters] = useState<{ id: string; code: string; name: string; unlocked: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  // Re-render once a minute so the "restantes" countdowns stay honest without a refresh.
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, clusters] = await Promise.all([apiFetchClusterAccessHistory(), apiFetchClusters()]);
      setHistory(rows);
      setManagementClusters(
        clusters
          .filter((c) => c.is_management_only)
          .map((c) => ({
            id: c.id,
            code: c.code,
            name: c.name,
            unlocked: c.workstations.length > 0 && c.workstations.some((w) => w.status !== 'management_reserved'),
          }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();

  const active = useMemo(
    () => history.filter((a) => a.status === 'APPROVED' && a.ends_at && new Date(a.ends_at).getTime() > now),
    [history, now]
  );

  const decided = useMemo(() => history.filter((a) => a.status !== 'PENDING'), [history]);

  const pendingCount = useMemo(() => history.filter((a) => a.status === 'PENDING').length, [history]);

  const refusedToday = useMemo(() => {
    const today = new Date().toDateString();
    return history.filter(
      (a) => a.status === 'REJECTED' && a.decided_at && new Date(a.decided_at).toDateString() === today
    ).length;
  }, [history]);

  return (
    <div className="space-y-6">
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-purple-600" />
          Autorisations Management
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Les clusters Management sont verrouillés par défaut (SRS §2156). Chaque accès est accordé pour une
          durée limitée, puis le cluster se reverrouille automatiquement.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Demandes en attente</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{loading ? '…' : pendingCount}</div>
          <p className="text-[11px] text-slate-500">à traiter</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Autorisations actives</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700">{loading ? '…' : active.length}</div>
          <p className="text-[11px] text-slate-500">en cours de validité</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Refusées aujourd'hui</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{loading ? '…' : refusedToday}</div>
          <p className="text-[11px] text-slate-500">décisions négatives</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Clusters Management</span>
            <Lock className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{loading ? '…' : managementClusters.length}</div>
          <p className="text-[11px] text-slate-500">
            {loading ? '' : `${managementClusters.filter((c) => c.unlocked).length} actuellement déverrouillé(s)`}
          </p>
        </div>
      </div>

      {/* Pending decisions */}
      <ClusterAccessRequestsPanel showEmptyState onDecided={load} />

      {/* Management cluster state */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-900">État des clusters Management</h3>
        {managementClusters.length === 0 && !loading && (
          <p className="text-xs text-slate-400 italic">Aucun cluster Management configuré.</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {managementClusters.map((cl) => {
            const openWindows = active.filter((a) => a.cluster_id === cl.id);
            return (
              <div
                key={cl.id}
                className={`p-4 rounded-xl border ${
                  cl.unlocked ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200">
                      {cl.code}
                    </span>
                    <h4 className="font-bold text-sm text-slate-800 mt-1">{cl.name}</h4>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 ${
                      cl.unlocked ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-white'
                    }`}
                  >
                    {cl.unlocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    {cl.unlocked ? 'Autorisé temporairement' : 'Désactivé'}
                  </span>
                </div>

                {openWindows.length > 0 ? (
                  <div className="mt-2.5 space-y-1.5">
                    {openWindows.map((a) => (
                      <div key={a.id} className="text-[11px] bg-white rounded-lg px-2.5 py-1.5 border border-emerald-200">
                        <div className="font-bold text-slate-800">{a.requester_name || a.requested_by}</div>
                        <div className="text-slate-500">
                          {a.starts_at ? new Date(a.starts_at).toLocaleString('fr-FR') : '—'} →{' '}
                          {a.ends_at ? new Date(a.ends_at).toLocaleString('fr-FR') : '—'}
                        </div>
                        <div className="text-emerald-700 font-semibold mt-0.5">
                          {a.ends_at ? formatRemaining(a.ends_at) : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic mt-2">
                    Aucune autorisation active — ce cluster n'est pas réservable.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Decision history */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" />
          Historique des décisions
        </h3>
        {loading && <p className="text-xs text-slate-400">Chargement…</p>}
        {!loading && decided.length === 0 && (
          <p className="text-xs text-slate-400 italic">Aucune décision enregistrée pour l'instant.</p>
        )}
        {decided.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase text-slate-400 border-b border-slate-200">
                  <th className="py-2 pr-3 font-bold">Décidée le</th>
                  <th className="py-2 pr-3 font-bold">Cluster</th>
                  <th className="py-2 pr-3 font-bold">Demandeur</th>
                  <th className="py-2 pr-3 font-bold">Statut</th>
                  <th className="py-2 pr-3 font-bold">Créneau accordé</th>
                  <th className="py-2 font-bold">Motif</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((a) => {
                  const style = STATUS_STYLES[a.status] || STATUS_STYLES.PENDING;
                  return (
                    <tr key={a.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">
                        {a.decided_at ? new Date(a.decided_at).toLocaleString('fr-FR') : '—'}
                      </td>
                      <td className="py-2 pr-3 font-bold text-slate-800">{a.cluster_code || a.cluster_id}</td>
                      <td className="py-2 pr-3 text-slate-700">{a.requester_name || a.requested_by}</td>
                      <td className="py-2 pr-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${style.className}`}>
                          {style.label}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">
                        {a.status === 'APPROVED' && a.ends_at
                          ? `${a.starts_at ? new Date(a.starts_at).toLocaleString('fr-FR') : '—'} → ${new Date(
                              a.ends_at
                            ).toLocaleString('fr-FR')}`
                          : '—'}
                      </td>
                      <td className="py-2 text-slate-500">{a.decision_note || a.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
