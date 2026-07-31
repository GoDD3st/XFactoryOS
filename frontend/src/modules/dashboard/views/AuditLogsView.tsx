import React, { useState } from 'react';
import { AuditLogEntry } from '@/frontend/src/types';
import { AuditService } from '@/services/audit/auditService';
import { ShieldCheck, Download, Search, Filter } from 'lucide-react';

export const AuditLogsView: React.FC = () => {
  const [logs] = useState<AuditLogEntry[]>(AuditService.getAuditLogs());
  const [search, setSearch] = useState('');

  const filtered = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.actor_name.toLowerCase().includes(search.toLowerCase()) ||
      l.target_resource.toLowerCase().includes(search.toLowerCase()) ||
      l.details.toLowerCase().includes(search.toLowerCase())
  );

  const exportCSV = () => {
    let csv = 'ID;Date;Action;Acteur;Rôle;Cible;Détails;IP\n';
    filtered.forEach((l) => {
      csv += `${l.id};${l.timestamp};${l.action};${l.actor_name};${l.actor_role};${l.target_resource};"${l.details}";${l.ip_address}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Audit_Logs_XFactory_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Journal d'Audit & Traçabilité</h2>
          <p className="text-xs text-slate-500 mt-0.5">Historique immuable des actions sensibles de gouvernance et sécurité</p>
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

          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-[#008751] hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer"
          >
            <Download className="w-4 h-4 text-amber-300" />
            <span>Exporter CSV</span>
          </button>
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
              <th className="py-2.5 px-3">Horodatage</th>
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
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-900 text-amber-300">
                    {log.action}
                  </span>
                </td>
                <td className="py-3 px-3 font-bold text-slate-800">
                  {log.actor_name} <span className="text-[10px] text-slate-400 font-normal">({log.actor_role})</span>
                </td>
                <td className="py-3 px-3 font-semibold text-[#008751]">{log.target_resource}</td>
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
