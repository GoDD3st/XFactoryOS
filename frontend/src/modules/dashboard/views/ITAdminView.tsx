import React, { useEffect, useState } from 'react';
import {
  Cpu,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Network,
  Activity,
  ShieldCheck,
  FileText
} from 'lucide-react';
import { apiFetchHardwareDiagnostics, apiResetHardwarePort } from '@/services/api/hardwareApi';
import { apiFetchHealth, HealthReport, HealthStatus } from '@/services/api/healthApi';
import { apiFetchAuditLogs } from '@/services/api/auditApi';
import { HardwareDiagnosticsInfo, AuditLogEntry } from '@/frontend/src/types';

/**
 * SRS §8: the IT Administrator owns "Administration technique" (CRUD) and is read-only on every
 * business domain. This screen therefore covers platform health, security-relevant activity,
 * integrations and the hardware estate — not postes/clusters/reservations management.
 *
 * Deliberately NOT shown: CPU/RAM/latency gauges and integration uptime. The SRS defines no such
 * metrics, and the CDVI/Hager/Philips integrations are explicitly future scope for Module 1 —
 * inventing green "Online" badges for them would misrepresent the system.
 */
const HEALTH_LABELS: Record<string, string> = {
  api: 'API',
  database: 'Base de données',
  authentication: 'Authentification',
  rbac: 'Politique RBAC',
};

const HEALTH_STYLES: Record<HealthStatus, { label: string; dot: string; className: string }> = {
  ok: { label: 'Opérationnel', dot: 'bg-emerald-500', className: 'text-emerald-700' },
  degraded: { label: 'Dégradé', dot: 'bg-amber-500', className: 'text-amber-700' },
  down: { label: 'Hors service', dot: 'bg-rose-500', className: 'text-rose-700' },
};

// SRS-declared future integrations — surfaced so the scope is visible, labelled honestly.
const FUTURE_INTEGRATIONS = [
  { name: 'CDVI Centaur', purpose: 'Contrôle d\'accès / badges' },
  { name: 'Hager', purpose: 'Domotique bâtiment' },
  { name: 'Écrans Philips', purpose: 'Affichage dynamique' },
];

// Audit actions that matter to technical/security supervision, as opposed to business activity.
const SECURITY_ACTIONS = new Set(['LOGIN', 'LOGOUT', 'ROLE_CHANGE', 'SETTINGS_CHANGE', 'EXPORT']);

export const ITAdminView: React.FC = () => {
  const [diagnostics, setDiagnostics] = useState<HardwareDiagnosticsInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resettingPort, setResettingPort] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const loadDiagnostics = () => {
    setLoading(true);
    apiFetchHardwareDiagnostics().then((data) => {
      setDiagnostics(data);
      setLoading(false);
    });
    apiFetchHealth().then(setHealth);
    apiFetchAuditLogs(true)
      .then(({ data }) => setAuditLogs(data))
      .catch(() => {});
  };

  useEffect(() => {
    loadDiagnostics();
    // Health is a live signal — poll it rather than showing a boot-time snapshot forever.
    const id = setInterval(() => apiFetchHealth().then(setHealth), 60000);
    return () => clearInterval(id);
  }, []);

  const securityEvents = auditLogs.filter((l) => SECURITY_ACTIONS.has(l.action));
  const todayKey = new Date().toDateString();
  const loginsToday = securityEvents.filter(
    (l) => l.action === 'LOGIN' && new Date(l.timestamp).toDateString() === todayKey
  ).length;
  const roleChanges = securityEvents.filter((l) => l.action === 'ROLE_CHANGE').length;
  const settingsChanges = securityEvents.filter((l) => l.action === 'SETTINGS_CHANGE').length;

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
            <span className="text-xs text-slate-400">Administration Technique — Site Safi</span>
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

      {/* Platform health — every line comes from an actual probe in /api/health */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#008751]" />
            État de la plateforme
          </h3>
          {health && (
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 ${
                health.status === 'ok'
                  ? 'bg-emerald-50 text-emerald-700'
                  : health.status === 'degraded'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-rose-50 text-rose-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${HEALTH_STYLES[health.status].dot}`} />
              {HEALTH_STYLES[health.status].label}
            </span>
          )}
        </div>

        {!health ? (
          <p className="text-xs text-slate-400">Vérification en cours…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(health.components).map(([key, comp]) => {
              const style = HEALTH_STYLES[comp.status];
              return (
                <div key={key} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                    <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                    {HEALTH_LABELS[key] || key}
                  </div>
                  <div className={`text-[11px] font-semibold mt-1 ${style.className}`}>{style.label}</div>
                  {comp.detail && <div className="text-[10px] text-slate-400 mt-0.5">{comp.detail}</div>}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
          Sondes réelles (round-trip base de données, mode d'authentification, chargement de la
          politique RBAC). Aucune métrique CPU/mémoire n'est affichée : le SRS n'en définit pas.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Security-relevant activity, derived from real audit records */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            Activité sécurité &amp; configuration
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <div className="text-xl font-black text-slate-900">{loginsToday}</div>
              <div className="text-[10px] font-bold uppercase text-slate-500">Connexions (jour)</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <div className="text-xl font-black text-slate-900">{roleChanges}</div>
              <div className="text-[10px] font-bold uppercase text-slate-500">Chgt. de rôle</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <div className="text-xl font-black text-slate-900">{settingsChanges}</div>
              <div className="text-[10px] font-bold uppercase text-slate-500">Chgt. paramètres</div>
            </div>
          </div>
          <p className="text-[10px] text-slate-400">
            Les échecs d'authentification ne sont pas comptabilisés : aucune action de ce type
            n'existe dans le journal d'audit (voir l'énumération <code>audit_action</code>).
          </p>
        </div>

        {/* Integrations — future scope, labelled as such rather than faked green */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Network className="w-4 h-4 text-purple-600" />
            Intégrations
          </h3>
          <div className="space-y-1.5">
            {FUTURE_INTEGRATIONS.map((i) => (
              <div key={i.name} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
                <div>
                  <div className="font-bold text-slate-800">{i.name}</div>
                  <div className="text-[10px] text-slate-400">{i.purpose}</div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600 shrink-0">
                  Module ultérieur
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400">
            Architecture préparée par le SRS ; ces intégrations ne sont pas actives dans le Module 1.
          </p>
        </div>
      </div>

      {/* Recent technical/security audit events */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-500" />
          Événements récents (sécurité &amp; configuration)
        </h3>
        {securityEvents.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Aucun événement de ce type enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-[10px] uppercase text-slate-400 border-b border-slate-200">
                  <th className="py-1.5 pr-3 font-bold">Horodatage</th>
                  <th className="py-1.5 pr-3 font-bold">Action</th>
                  <th className="py-1.5 pr-3 font-bold">Acteur</th>
                  <th className="py-1.5 font-bold">Détail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {securityEvents.slice(0, 10).map((l) => (
                  <tr key={l.id}>
                    <td className="py-1.5 pr-3 font-mono text-slate-500 whitespace-nowrap">
                      {new Date(l.timestamp).toLocaleString('fr-FR')}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-900 text-amber-300">
                        {l.action}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 font-semibold text-slate-800">{l.actor_name}</td>
                    <td className="py-1.5 text-slate-500 max-w-xs truncate">{l.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
