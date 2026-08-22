import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Armchair,
  Layers,
  Users,
  Wrench,
  AlertTriangle,
  Activity,
  Ban,
} from 'lucide-react';
import { Cluster } from '../../../types';
import { apiFetchClusters } from '@/services/api/workspaceApi';
import { apiFetchUsers } from '@/services/api/userApi';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { ReservationsTable } from '../../../shared/components/ReservationsTable';

/**
 * Administrator home - SRS §13 Administrator column: CRUD on postes/clusters/utilisateurs/
 * paramètres, R on analytics/audit/roles. This is functional administration of the Open Space
 * referential, not technical administration (that is IT Admin's mandate, "X" for this role).
 *
 * The previous version of this screen was themed entirely around the "Mode 8 Postes Extension"
 * toggle and carried no administrative figures at all.
 */

const IN_USE_STATUSES = new Set(['réservé', 'occupé']);

export const AdminView: React.FC = () => {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [userCount, setUserCount] = useState<{ total: number; active: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cls, users] = await Promise.all([apiFetchClusters().catch(() => []), apiFetchUsers().catch(() => [])]);
      setClusters(cls);
      setUserCount({
        total: users.length,
        active: users.filter((u) => u.status === 'active').length,
      });
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
    const seats = clusters.flatMap((c) => c.workstations);
    return {
      clusterCount: clusters.length,
      clustersEnabled: clusters.filter((c) => c.enabled !== false).length,
      seatCount: seats.length,
      available: seats.filter((w) => w.status === 'disponible').length,
      reserved: seats.filter((w) => w.status === 'réservé').length,
      occupied: seats.filter((w) => w.status === 'occupé').length,
      maintenance: seats.filter((w) => w.status === 'maintenance').length,
      disabled: seats.filter((w) => w.status === 'disabled').length,
      inUse: seats.filter((w) => IN_USE_STATUSES.has(w.status)).length,
    };
  }, [clusters]);

  const occupancy = stats.seatCount > 0 ? Math.round((stats.inUse / stats.seatCount) * 100) : 0;

  const clusterUsage = useMemo(
    () =>
      clusters
        .map((c) => {
          const total = c.workstations.length;
          const used = c.workstations.filter((w) => IN_USE_STATUSES.has(w.status)).length;
          return {
            id: c.id,
            code: c.code,
            enabled: c.enabled !== false,
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
      <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-6 border border-slate-800 shadow-lg">
        <div className="flex items-center space-x-2">
          <span className="px-2.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold text-xs">
            Rôle : Administrator
          </span>
          <span className="text-xs text-slate-400">Administration fonctionnelle - Site Safi</span>
        </div>
        <h1 className="text-xl font-bold mt-1">Gestion des ressources &amp; règles Open Space</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Postes, clusters, utilisateurs et paramètres de réservation. L'administration technique
          relève de l'IT Administrator.
        </p>
      </div>

      {/* Referential counts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Postes</span>
            <Armchair className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{loading ? '...' : stats.seatCount}</div>
          <p className="text-[11px] text-slate-500">
            {loading ? '' : `${stats.seatCount - stats.disabled} actifs`}
            {!loading && stats.disabled > 0 && <span className="text-slate-400"> · {stats.disabled} désactivés</span>}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Clusters</span>
            <Layers className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{loading ? '...' : stats.clusterCount}</div>
          <p className="text-[11px] text-slate-500">{loading ? '' : `${stats.clustersEnabled} actifs`}</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Utilisateurs</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{loading ? '...' : userCount?.total ?? ''}</div>
          <p className="text-[11px] text-slate-500">
            {loading || !userCount ? '' : `${userCount.active} actifs`}
          </p>
        </div>
      </div>

      {/* Live occupancy */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#008751]" />
            Occupation live
          </h3>
          <span className="text-xs font-bold text-slate-500">
            Taux d'occupation : <span className="text-slate-900">{loading ? '...' : `${occupancy}%`}</span>
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Disponibles', value: stats.available, className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
            { label: 'Réservés', value: stats.reserved, className: 'text-amber-700 bg-amber-50 border-amber-200' },
            { label: 'Occupés', value: stats.occupied, className: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
            { label: 'Maintenance', value: stats.maintenance, className: 'text-red-700 bg-red-50 border-red-200' },
            { label: 'Désactivés', value: stats.disabled, className: 'text-slate-600 bg-slate-50 border-slate-200' },
          ].map((s) => (
            <div key={s.label} className={`p-3 rounded-xl border text-center ${s.className}`}>
              <div className="text-xl font-black">{loading ? '...' : s.value}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cluster usage */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Utilisation des clusters</h3>
          {loading && <p className="text-xs text-slate-400">Chargement...</p>}
          {!loading && clusterUsage.length === 0 && (
            <p className="text-xs text-slate-400 italic">Aucun cluster enregistré.</p>
          )}
          <div className="space-y-2">
            {clusterUsage.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-xs font-bold text-slate-800 flex items-center gap-1">
                  {c.code}
                  {!c.enabled && <Ban className="w-3 h-3 text-slate-400" />}
                </div>
                <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${c.enabled ? 'bg-cyan-500' : 'bg-slate-300'}`}
                    style={{ width: `${c.rate}%` }}
                  />
                </div>
                <div className="w-20 shrink-0 text-right text-[11px] font-semibold text-slate-600">
                  {c.rate}% ({c.used}/{c.total})
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Anomalies */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Alertes &amp; anomalies
          </h3>
          {loading ? (
            <p className="text-xs text-slate-400">Chargement...</p>
          ) : (
            <div className="space-y-2">
              {stats.maintenance > 0 && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800">
                  <Wrench className="w-3.5 h-3.5 shrink-0" />
                  {stats.maintenance} poste(s) en maintenance
                </div>
              )}
              {stats.disabled > 0 && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
                  <Ban className="w-3.5 h-3.5 shrink-0" />
                  {stats.disabled} poste(s) désactivé(s)
                </div>
              )}
              {stats.clusterCount - stats.clustersEnabled > 0 && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  {stats.clusterCount - stats.clustersEnabled} cluster(s) désactivé(s)
                </div>
              )}
              {stats.maintenance === 0 && stats.disabled === 0 && stats.clusterCount === stats.clustersEnabled && (
                <p className="text-xs text-slate-400 italic">
                  Aucune anomalie détectée sur le référentiel Open Space.
                </p>
              )}
            </div>
          )}
          <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
            Le scan des no-shows s'exécute depuis l'onglet Postes.
          </p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-slate-900 mb-2">Digital Twin - référentiel Open Space</h2>
        <DigitalTwin />
      </div>

      <ReservationsTable />
    </div>
  );
};
