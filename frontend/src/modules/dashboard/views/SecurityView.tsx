import React, { useCallback, useEffect, useState } from 'react';
import {
  Printer,
  Radio,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { apiFetchEvacuationRoster, OccupantRosterItem } from '@/services/api/securityApi';
import { apiFetchAuditLogs } from '@/services/api/auditApi';
import { AuditLogEntry } from '../../../types';
import { useAuth } from '../../auth/context/AuthContext';

/**
 * Security home - SRS §13 matrix, Security column: R on Audit logs and Analytics, R (view only)
 * on postes/clusters, and X on Dashboard exécutif, Réserver poste standard, Approuver, Autoriser
 * cluster management, Utilisateurs, Rôles, Paramètres and Administration technique.
 *
 * The seat map is rendered read-only: this role is X on "Réserver poste standard", so offering a
 * clickable booking flow would contradict the matrix.
 */
export const SecurityView: React.FC = () => {
  const { currentUser } = useAuth();
  const [roster, setRoster] = useState<OccupantRosterItem[] | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setRosterError(null);
    try {
      setRoster(await apiFetchEvacuationRoster());
    } catch (err: any) {
      // Never fall back to an empty list here - "nobody is in the building" must not be the
      // failure mode of an evacuation roster.
      setRoster(null);
      setRosterError(err?.message || "Registre indisponible.");
    }
    apiFetchAuditLogs(true)
      .then(({ data }) => setAuditLogs(data))
      .catch(() => {});
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('xfactory_reservations_changed', load);
    // Presence changes with every check-in/out; refresh so the roster is current if it is needed.
    const id = setInterval(load, 60000);
    return () => {
      window.removeEventListener('xfactory_reservations_changed', load);
      clearInterval(id);
    };
  }, [load]);

  /** Opens a printable roster in a new window - replaces an alert() that produced nothing. */
  const handlePrintEvacuationList = () => {
    if (!roster || roster.length === 0) return;
    const printed = new Date().toLocaleString('fr-FR');
    const rows = roster
      .map(
        (o) =>
          `<tr><td>${o.workstation_code}</td><td>${o.user_name}</td><td>${o.department}</td><td>${o.cluster_name}</td><td>${new Date(
            o.check_in_at
          ).toLocaleTimeString('fr-FR')}</td></tr>`
      )
      .join('');

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Registre d'évacuation - Site Safi</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;color:#0f172a}
        h1{font-size:18px;margin:0 0 4px}
        p{font-size:12px;color:#475569;margin:0 0 16px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
        th{background:#f1f5f9}
      </style></head>
      <body>
        <h1>Registre d'évacuation d'urgence - Site Safi</h1>
        <p>${roster.length} personne(s) présente(s) · édité le ${printed}</p>
        <table>
          <thead><tr><th>Poste</th><th>Nom</th><th>Département</th><th>Cluster</th><th>Check-in</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  const recentEvents = auditLogs.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-6 border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded bg-slate-700 text-slate-200 font-bold text-xs">
              Rôle : Sécurité
            </span>
          </div>
          <h1 className="text-xl font-bold mt-2">
            Bienvenue {currentUser.full_name}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all border border-slate-700"
          >
            <RefreshCw className="w-4 h-4" />
            Actualiser
          </button>
          <button
            onClick={handlePrintEvacuationList}
            disabled={!roster || roster.length === 0}
            className="bg-rose-700 hover:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-2"
          >
            <Printer className="w-4 h-4" />
            <span>Registre d'évacuation ({roster?.length ?? ''})</span>
          </button>
        </div>
      </div>

      {rosterError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Registre d'évacuation indisponible : {rosterError} - ne considérez pas le site comme vide.
          </span>
        </div>
      )}

      {/* Presence */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
            <span>Présents sur site</span>
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
          </div>
          <div className="text-2xl font-black text-emerald-400">
            {loading ? '...' : roster === null ? 'Indisponible' : `${roster.length} personne(s)`}
          </div>
          <p className="text-[11px] text-slate-400">Check-in confirmé, non encore reparties</p>
        </div>

        <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
            <span>Événements d'audit</span>
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-white">{loading ? '...' : auditLogs.length}</div>
          <p className="text-[11px] text-slate-400">Consultables dans l'onglet Audit</p>
        </div>
      </div>

      {/* Live roster */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-600" />
          Registre de présence en direct
        </h3>

        {loading && <p className="text-xs text-slate-400">Chargement...</p>}
        {!loading && roster !== null && roster.length === 0 && (
          <p className="text-xs text-slate-400 italic">Aucune personne actuellement enregistrée sur site.</p>
        )}
        {roster && roster.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase text-slate-400 border-b border-slate-200">
                  <th className="py-2 pr-3 font-bold">Poste</th>
                  <th className="py-2 pr-3 font-bold">Nom</th>
                  <th className="py-2 pr-3 font-bold">Département</th>
                  <th className="py-2 pr-3 font-bold">Cluster</th>
                  <th className="py-2 font-bold">Check-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roster.map((o) => (
                  <tr key={o.reservation_id}>
                    <td className="py-2 pr-3 font-bold text-slate-800">{o.workstation_code}</td>
                    <td className="py-2 pr-3 text-slate-700">{o.user_name}</td>
                    <td className="py-2 pr-3 text-slate-500">{o.department}</td>
                    <td className="py-2 pr-3 text-slate-500">{o.cluster_name}</td>
                    <td className="py-2 font-mono text-slate-500">
                      {new Date(o.check_in_at).toLocaleTimeString('fr-FR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent audit activity */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-500" />
          Activité récente
        </h3>
        {recentEvents.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Aucun événement enregistré.</p>
        ) : (
          <div className="space-y-1.5">
            {recentEvents.map((l) => (
              <div key={l.id} className="flex items-center gap-3 text-[11px] py-1 border-b border-slate-100 last:border-0">
                <span className="font-mono text-slate-400 w-32 shrink-0">
                  {new Date(l.timestamp).toLocaleString('fr-FR')}
                </span>
                <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-900 text-amber-300 shrink-0">
                  {l.action}
                </span>
                <span className="font-semibold text-slate-700 truncate">{l.actor_name}</span>
                <span className="text-slate-500 truncate">{l.details}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Seat map, read-only - this role is X on "Réserver poste standard" */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-2">Plan du site (consultation)</h3>
        <DigitalTwin readOnly />
      </div>
    </div>
  );
};
