import React, { useState, useEffect, useMemo } from 'react';
import { AuditLogEntry } from '@/frontend/src/types';
import { apiFetchAuditLogs, apiLogExport } from '@/services/api/auditApi';
import { apiFetchClusters } from '@/services/api/workspaceApi';
import { apiFetchUsers } from '@/services/api/userApi';
import { ShieldCheck, Download, Search, Info, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EntityGroup = 'Clusters' | 'Postes' | 'Utilisateurs' | 'Autres';

interface EntityLabel {
  /** Raw value stored in audit_logs.target_resource — what we actually filter on. */
  value: string;
  label: string;
  group: EntityGroup;
}

// Mirrors backend/routes/audit.routes.ts's AUDIT_CATEGORY_VISIBILITY — display labels only,
// the actual filtering happens server-side (never trust the client to hide sensitive log rows).
const CATEGORY_LABELS: Record<string, string> = {
  auth: 'Connexion',
  reservation: 'Réservation',
  checkinout: 'Check-in/out',
  noshow: 'No-show',
  approval: 'Approbation',
  role_change: 'Rôle',
  settings: 'Paramètres',
  cluster_management: 'Cluster/Poste',
  export: 'Export',
  ai_query: 'IA',
};

export const AuditLogsView: React.FC = () => {
  const { currentRole } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [canSeeAll, setCanSeeAll] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  // target_resource is written by many call sites and is not normalised: some events store a
  // readable code (CL-A-W1), some a raw cluster/user UUID, some a legacy seed id (usr-collab-1).
  // Resolve what we can to real names so the filter is usable; unresolved values stay selectable
  // under "Autres" rather than being hidden.
  const [entityNames, setEntityNames] = useState<Map<string, { label: string; group: EntityGroup }>>(new Map());

  useEffect(() => {
    apiFetchAuditLogs(showAll).then(({ data, canSeeAll: c }) => {
      setLogs(data);
      setCanSeeAll(c);
    });
  }, [showAll]);

  useEffect(() => {
    let cancelled = false;

    const buildLookup = async () => {
      const map = new Map<string, { label: string; group: EntityGroup }>();

      // /api/workspaces/clusters is open to any authenticated user; /api/users is role-gated and
      // resolves to [] for roles without it (Receptionist, Director, Security…), which is fine —
      // those ids simply fall through to "Autres".
      const [clusters, users] = await Promise.all([
        apiFetchClusters().catch(() => []),
        apiFetchUsers().catch(() => []),
      ]);

      clusters.forEach((c) => {
        const label = `${c.name} (${c.code})`;
        map.set(c.id, { label, group: 'Clusters' });
        map.set(c.code, { label, group: 'Clusters' });
        c.workstations.forEach((w) => {
          const seatLabel = `Poste ${w.code}`;
          map.set(w.id, { label: seatLabel, group: 'Postes' });
          if (w.code) map.set(w.code, { label: seatLabel, group: 'Postes' });
        });
      });

      users.forEach((u) => {
        const label = `${u.full_name}${u.email ? ` — ${u.email}` : ''}`;
        map.set(u.id, { label, group: 'Utilisateurs' });
      });

      if (!cancelled) setEntityNames(map);
    };

    buildLookup();
    return () => {
      cancelled = true;
    };
  }, []);

  // LOGIN/LOGOUT rows store the actor's own user id as the entity, and every row already carries
  // actor_id + actor_name. Deriving names from the logs themselves means roles that cannot call
  // /api/users (Director, Security, Receptionist…) still get readable labels instead of UUIDs.
  const resolvedNames = useMemo(() => {
    const map = new Map(entityNames);
    logs.forEach((l) => {
      if (l.actor_id && !map.has(l.actor_id)) {
        map.set(l.actor_id, { label: l.actor_name, group: 'Utilisateurs' });
      }
    });
    return map;
  }, [entityNames, logs]);

  /** Human-readable label for an audit target, falling back to a truncated raw id. */
  const describeEntity = React.useCallback(
    (raw: string): string => {
      const hit = resolvedNames.get(raw);
      if (hit) return hit.label;
      if (UUID_RE.test(raw)) return `Réf. technique ${raw.slice(0, 8)}…`;
      return raw;
    },
    [resolvedNames]
  );

  const uniqueActors = Array.from(new Set(logs.map((l) => l.actor_name))).sort();
  const uniqueActions = Array.from(new Set(logs.map((l) => l.action))).sort();

  const groupedEntities = useMemo(() => {
    const raws = Array.from(new Set(logs.map((l) => l.target_resource))).filter(Boolean);
    const groups: Record<EntityGroup, EntityLabel[]> = {
      Clusters: [],
      Postes: [],
      Utilisateurs: [],
      Autres: [],
    };

    raws.forEach((raw) => {
      const hit = resolvedNames.get(raw);
      groups[hit?.group ?? 'Autres'].push({
        value: raw,
        label: hit?.label ?? (UUID_RE.test(raw) ? `Réf. technique ${raw.slice(0, 8)}…` : raw),
        group: hit?.group ?? 'Autres',
      });
    });

    (Object.keys(groups) as EntityGroup[]).forEach((g) =>
      groups[g].sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    );
    return groups;
  }, [logs, resolvedNames]);

  const filtered = logs.filter((l) => {
    const matchesSearch =
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.actor_name.toLowerCase().includes(search.toLowerCase()) ||
      l.target_resource.toLowerCase().includes(search.toLowerCase()) ||
      describeEntity(l.target_resource).toLowerCase().includes(search.toLowerCase()) ||
      l.details.toLowerCase().includes(search.toLowerCase());

    const logDate = l.timestamp.split('T')[0];
    const matchesDateFrom = !dateFrom || logDate >= dateFrom;
    const matchesDateTo = !dateTo || logDate <= dateTo;
    const matchesActor = !actorFilter || l.actor_name === actorFilter;
    const matchesAction = !actionFilter || l.action === actionFilter;
    const matchesEntity = !entityFilter || l.target_resource === entityFilter;

    return matchesSearch && matchesDateFrom && matchesDateTo && matchesActor && matchesAction && matchesEntity;
  });

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setActorFilter('');
    setActionFilter('');
    setEntityFilter('');
  };

  const hasActiveFilters = !!(dateFrom || dateTo || actorFilter || actionFilter || entityFilter);

  const exportCSV = () => {
    // Keep the raw id alongside the resolved name so the export stays traceable back to the row.
    let csv = 'ID;Date;Catégorie;Action;Acteur;Rôle;Cible;Réf. brute;Détails;IP\n';
    filtered.forEach((l) => {
      csv += `${l.id};${l.timestamp};${l.category || ''};${l.action};${l.actor_name};${l.actor_role};"${describeEntity(
        l.target_resource
      )}";${l.target_resource};"${l.details}";${l.ip_address}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Audit_Logs_XFactory_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();

    apiLogExport('audit_logs.csv', `Export CSV du journal d'audit (${filtered.length} entrées, vue ${showAll ? 'complète' : 'filtrée par rôle'}).`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Journal d'Audit & Traçabilité</h2>
          <p className="text-xs text-slate-500 mt-0.5">Historique immuable des actions sensibles de gouvernance et sécurité</p>
          {!showAll && (
            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Vue filtrée à votre périmètre de rôle — les autres catégories sont suivies par leurs responsables respectifs.
            </p>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer les événements..."
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#008751]"
            />
          </div>

          {canSeeAll && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer border ${
                showAll
                  ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-500'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
              title="Réservé au Super Admin : bascule entre la vue essentielle et le journal complet"
            >
              {showAll ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span>{showAll ? 'Tout affiché' : 'Afficher tout'}</span>
            </button>
          )}

          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-[#008751] hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer"
          >
            <Download className="w-4 h-4 text-amber-300" />
            <span>Exporter CSV</span>
          </button>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase block">Du</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-[#008751]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase block">Au</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-[#008751]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase block">Acteur</label>
          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:border-[#008751] max-w-[160px]"
          >
            <option value="">Tous</option>
            {uniqueActors.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase block">Action</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:border-[#008751]"
          >
            <option value="">Toutes</option>
            {uniqueActions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase block">Entité / Cible</label>
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:border-[#008751] max-w-[260px]"
          >
            <option value="">Toutes</option>
            {(Object.keys(groupedEntities) as EntityGroup[])
              .filter((g) => groupedEntities[g].length > 0)
              .map((g) => (
                <optgroup key={g} label={g}>
                  {groupedEntities[g].map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </div>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Réinitialiser les filtres
          </button>
        )}
        <span className="text-[11px] text-slate-400 ml-auto">{filtered.length} événement(s)</span>
      </div>

      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
              <th className="py-2.5 px-3">Horodatage</th>
              <th className="py-2.5 px-3">Catégorie</th>
              <th className="py-2.5 px-3">Action</th>
              <th className="py-2.5 px-3">Acteur</th>
              <th className="py-2.5 px-3">Cible</th>
              <th className="py-2.5 px-3">Détails</th>
              <th className="py-2.5 px-3 text-right">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="py-3 px-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                    {log.category ? CATEGORY_LABELS[log.category] || log.category : '—'}
                  </span>
                </td>
                <td className="py-3 px-3">
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-900 text-amber-300">
                    {log.action}
                  </span>
                </td>
                <td className="py-3 px-3 font-bold text-slate-800">
                  {log.actor_name} <span className="text-[10px] text-slate-400 font-normal">({log.actor_role})</span>
                </td>
                <td className="py-3 px-3 font-semibold text-[#008751]" title={log.target_resource}>
                  {describeEntity(log.target_resource)}
                </td>
                <td className="py-3 px-3 text-slate-600 text-[11px] max-w-xs truncate">{log.details}</td>
                <td className="py-3 px-3 text-right font-mono text-[10px] text-slate-400">{log.ip_address}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
