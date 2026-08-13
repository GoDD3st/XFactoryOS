import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Lock, Layers, Armchair, ShieldCheck, Clock, AlertCircle } from 'lucide-react';
import { Cluster, ClusterAuthorization } from '../../../types';
import { apiFetchClusters, apiFetchClusterAccessHistory } from '@/services/api/workspaceApi';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';

/**
 * GCI Manager home — SRS §8.4: "Responsable de la gouvernance Growth Culture & Collaborative
 * Innovation. Il peut autoriser les réservations de clusters management et suivre la valeur
 * d'usage."
 *
 * Every figure below is computed from live cluster/seat/authorization data. The previous
 * version of this screen displayed hardcoded values (a fixed "8/8 postes", a "99.8%" audit
 * score, "16 postes protégés par RLS") that were not read from anything.
 */

/** Seats that are actually occupied right now, for the usage bars. */
const IN_USE_STATUSES = new Set(['réservé', 'occupé']);

export const GCIView: React.FC = () => {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [authorizations, setAuthorizations] = useState<ClusterAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cls, auths] = await Promise.all([apiFetchClusters(), apiFetchClusterAccessHistory()]);
      setClusters(cls);
      setAuthorizations(auths);
    } catch (err: any) {
      setError(err.message || 'Échec du chargement des données de gouvernance.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('xfactory_workstations_changed', load);
    return () => window.removeEventListener('xfactory_workstations_changed', load);
  }, [load]);

  const stats = useMemo(() => {
    const allSeats = clusters.flatMap((c) => c.workstations);
    const managementClusters = clusters.filter((c) => c.is_management_only);
    const now = Date.now();

    const activeAuths = authorizations.filter(
      (a) => a.status === 'APPROVED' && a.ends_at && new Date(a.ends_at).getTime() > now
    );

    return {
      clusterCount: clusters.length,
      managementCount: managementClusters.length,
      seatCount: allSeats.length,
      availableSeats: allSeats.filter((w) => w.status === 'disponible').length,
      inUseSeats: allSeats.filter((w) => IN_USE_STATUSES.has(w.status)).length,
      maintenanceSeats: allSeats.filter((w) => w.status === 'maintenance').length,
      pendingCount: authorizations.filter((a) => a.status === 'PENDING').length,
      activeAuthCount: activeAuths.length,
      unlockedManagement: managementClusters.filter(
        (c) => c.workstations.length > 0 && c.workstations.some((w) => w.status !== 'management_reserved')
      ).length,
    };
  }, [clusters, authorizations]);

  const occupancyRate = stats.seatCount > 0 ? Math.round((stats.inUseSeats / stats.seatCount) * 100) : 0;

  const clusterUsage = useMemo(
    () =>
      clusters
        .map((c) => {
          const total = c.workstations.length;
          const used = c.workstations.filter((w) => IN_USE_STATUSES.has(w.status)).length;
          return {
            id: c.id,
            code: c.code,
            name: c.name,
            isManagement: c.is_management_only,
            total,
            used,
            rate: total > 0 ? Math.round((used / total) * 100) : 0,
          };
        })
        .sort((a, b) => b.rate - a.rate),
    [clusters]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-lg">
        <div className="flex items-center space-x-2">
          <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold text-xs">
            Rôle : GCI Manager
          </span>
          <span className="text-xs text-slate-400">Growth Culture &amp; Collaborative Innovation — Site Safi</span>
        </div>
        <h1 className="text-xl font-bold mt-1">Gouvernance des espaces &amp; clusters Management</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Autorisation temporaire des clusters Management (BR-09) et suivi de la valeur d'usage.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Clusters</span>
            <Layers className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{loading ? '…' : stats.clusterCount}</div>
          <p className="text-[11px] text-purple-700 font-semibold">
            {loading ? '' : `${stats.managementCount} Management`}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Postes</span>
            <Armchair className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{loading ? '…' : stats.seatCount}</div>
          <p className="text-[11px] text-emerald-700 font-semibold">
            {loading ? '' : `${stats.availableSeats} disponibles`}
            {!loading && stats.maintenanceSeats > 0 && (
              <span className="text-red-600"> · {stats.maintenanceSeats} maint.</span>
            )}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Demandes en attente</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className={`text-2xl font-black ${stats.pendingCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
            {loading ? '…' : stats.pendingCount}
          </div>
          <p className="text-[11px] text-slate-500">à traiter</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Autorisations actives</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700">{loading ? '…' : stats.activeAuthCount}</div>
          <p className="text-[11px] text-slate-500">
            {loading ? '' : `${stats.unlockedManagement}/${stats.managementCount} cluster(s) Management ouvert(s)`}
          </p>
        </div>
      </div>

      {/* Management cluster status — SRS §2156: locked by default, so make that state loud. */}
      {!loading && stats.managementCount > 0 && (
        <div
          className={`p-5 rounded-2xl border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 ${
            stats.unlockedManagement > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`p-2 rounded-xl ${
                stats.unlockedManagement > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-white'
              }`}
            >
              {stats.unlockedManagement > 0 ? <KeyRound className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {stats.unlockedManagement > 0
                  ? `${stats.unlockedManagement} cluster(s) Management autorisé(s) temporairement`
                  : 'Tous les clusters Management sont désactivés'}
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                {stats.unlockedManagement > 0
                  ? "L'accès se referme automatiquement à la fin de chaque autorisation."
                  : "Ces clusters ne sont pas réservables tant qu'aucune demande n'a été autorisée."}
              </p>
            </div>
          </div>
          {stats.pendingCount > 0 && (
            <span className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold shrink-0">
              {stats.pendingCount} demande(s) en attente — onglet Autorisations
            </span>
          )}
        </div>
      )}

      {/* Cluster usage */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Usage des clusters</h3>
          <span className="text-xs font-bold text-slate-500">
            Occupation globale : <span className="text-slate-900">{loading ? '…' : `${occupancyRate}%`}</span>
          </span>
        </div>
        {loading && <p className="text-xs text-slate-400">Chargement…</p>}
        {!loading && clusterUsage.length === 0 && (
          <p className="text-xs text-slate-400 italic">Aucun cluster à afficher.</p>
        )}
        <div className="space-y-2">
          {clusterUsage.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <div className="w-40 shrink-0 text-xs">
                <span className="font-bold text-slate-800">{c.code}</span>
                {c.isManagement && (
                  <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                    MGMT
                  </span>
                )}
              </div>
              <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${c.isManagement ? 'bg-purple-500' : 'bg-cyan-500'}`}
                  style={{ width: `${c.rate}%` }}
                />
              </div>
              <div className="w-24 shrink-0 text-right text-[11px] font-semibold text-slate-600">
                {c.rate}% ({c.used}/{c.total})
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Digital Twin */}
      <div>
        <h2 className="text-sm font-bold text-slate-900 mb-2">Cartographie des clusters — vue gouvernance GCI</h2>
        <DigitalTwin />
      </div>
    </div>
  );
};
