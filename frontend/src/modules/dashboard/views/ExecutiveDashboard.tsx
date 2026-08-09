import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { getRealTimeTelemetry, SiteTelemetrySummary, DailyReservationTrend } from '@/services/telemetry/telemetryService';
import { apiFetchNoShowStats } from '@/services/api/noShowApi';
import { apiFetchReservationTrends } from '@/services/api/telemetryApi';
import { apiLogExport } from '@/services/api/auditApi';
import { BarChart3, TrendingUp, Clock, AlertTriangle, Download, Sparkles, Building, Layers, FileSpreadsheet, Printer, LineChart } from 'lucide-react';

export const ExecutiveDashboard: React.FC = () => {
  const [telemetry, setTelemetry] = useState<SiteTelemetrySummary | null>(null);
  const [noShowStats, setNoShowStats] = useState<{ today: number; thisWeek: number }>({ today: 0, thisWeek: 0 });
  const [trends, setTrends] = useState<DailyReservationTrend[]>([]);

  useEffect(() => {
    const refresh = () => {
      getRealTimeTelemetry().then(setTelemetry);
      apiFetchNoShowStats().then(setNoShowStats);
      apiFetchReservationTrends(14).then(setTrends);
    };

    refresh();

    // Occupancy/no-show KPIs previously only loaded once on mount and went stale until a manual
    // page reload — everywhere else (Digital Twin) already reacts live to these same events via
    // Supabase Realtime (database/realtime.ts), so wire the executive KPIs to them too.
    window.addEventListener('xfactory_reservations_changed', refresh);
    window.addEventListener('xfactory_workstations_changed', refresh);

    return () => {
      window.removeEventListener('xfactory_reservations_changed', refresh);
      window.removeEventListener('xfactory_workstations_changed', refresh);
    };
  }, []);

  if (!telemetry) {
    return <div className="p-8 text-center text-xs text-slate-500">Chargement de la télémetrie...</div>;
  }

  const exportReportCSV = () => {
    let csv = 'Cluster;Total;Occupés;Réservés;Disponibles;Maintenance;Taux Occup %\n';
    telemetry.clusters.forEach((c) => {
      csv += `${c.clusterName};${c.totalDesks};${c.occupiedDesks};${c.reservedDesks};${c.availableDesks};${c.maintenanceDesks};${c.occupancyRate}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Report_XFactory_Telemetry_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();

    apiLogExport('dashboard-telemetry.csv', 'Export CSV du dashboard exécutif (télémétrie clusters).');
  };

  // FR-87 "Export Excel des données agrégées"
  const exportReportExcel = () => {
    const clusterSheet = telemetry.clusters.map((c) => ({
      Cluster: c.clusterName,
      Code: c.clusterCode,
      Total: c.totalDesks,
      Occupés: c.occupiedDesks,
      Réservés: c.reservedDesks,
      Disponibles: c.availableDesks,
      Maintenance: c.maintenanceDesks,
      'Taux Occup. %': c.occupancyRate,
    }));
    const trendSheet = trends.map((t) => ({
      Date: t.date,
      Réservations: t.count,
      'No-Shows': t.noShows,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clusterSheet), 'Clusters');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trendSheet), 'Tendances 14j');
    XLSX.writeFile(wb, `Report_XFactory_Telemetry_${new Date().toISOString().split('T')[0]}.xlsx`);

    apiLogExport('dashboard-telemetry.xlsx', 'Export Excel du dashboard exécutif (clusters + tendances 14j).');
  };

  // FR-87 "Export PDF du dashboard" — print-to-PDF via the browser (no server-side PDF
  // renderer in this stack); user picks "Enregistrer en PDF" in the print dialog.
  const exportReportPDF = () => {
    window.print();
  };

  const maxTrendCount = Math.max(1, ...trends.map((t) => t.count));

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 text-white shadow-lg border border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-black tracking-tight">Dashboard Exécutif & Telemetry</h2>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-[#008751] text-white rounded border border-emerald-400/30">
              OCP SA Safi
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Supervision globale de l'occupation des 7 clusters Open Space</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportReportExcel}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-amber-300" />
            <span>Excel</span>
          </button>
          <button
            onClick={exportReportPDF}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
          >
            <Printer className="w-4 h-4 text-amber-300" />
            <span>PDF</span>
          </button>
          <button
            onClick={exportReportCSV}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#008751] hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
          >
            <Download className="w-4 h-4 text-amber-300" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Taux d'Occupation Live</span>
            <BarChart3 className="w-4 h-4 text-[#008751]" />
          </div>
          <div className="text-2xl font-black text-slate-900">{telemetry.overallOccupancyRate}%</div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-[#008751] h-full transition-all duration-500"
              style={{ width: `${telemetry.overallOccupancyRate}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-400 font-medium">Capacité totale: {telemetry.totalCapacity} postes</p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Occupations Actives</span>
            <TrendingUp className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{telemetry.activeOccupancy} postes</div>
          <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" /> Présences vérifiées
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Heures de Pointe</span>
            <Clock className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{telemetry.peakHourWindow}</div>
          <p className="text-[10px] text-slate-400 font-medium">Fenêtre d'affluence maximale</p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>No-Shows Détectés</span>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{noShowStats.today} aujourd'hui</div>
          <p className="text-[10px] text-slate-400 font-medium">{noShowStats.thisWeek} cette semaine</p>
        </div>
      </div>

      {/* Reservation Trends (FR-86) */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <LineChart className="w-5 h-5 text-[#008751]" />
            <h3 className="font-bold text-sm text-slate-800">Tendance des Réservations (14 derniers jours)</h3>
          </div>
        </div>

        {trends.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">Données insuffisantes pour établir une tendance.</p>
        ) : (
          <div className="flex items-end gap-1.5 h-32">
            {trends.map((t) => (
              <div key={t.date} className="flex-1 flex flex-col items-center justify-end gap-1 group relative">
                <div className="text-[9px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-4">
                  {t.count}
                </div>
                <div className="w-full flex flex-col justify-end" style={{ height: '100px' }}>
                  {t.noShows > 0 && (
                    <div
                      className="w-full bg-red-400 rounded-t"
                      style={{ height: `${(t.noShows / maxTrendCount) * 100}px` }}
                    />
                  )}
                  <div
                    className="w-full bg-[#008751]"
                    style={{ height: `${((t.count - t.noShows) / maxTrendCount) * 100}px` }}
                  />
                </div>
                <div className="text-[8px] text-slate-400 font-medium">
                  {new Date(t.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-4 text-[10px] text-slate-500 pt-1">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[#008751] inline-block" /> Réservations</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-400 inline-block" /> No-shows</span>
        </div>
      </div>

      {/* Cluster Occupancy Heatmap Table */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-[#008751]" />
            <h3 className="font-bold text-sm text-slate-800">Heatmap d'Occupation des Clusters</h3>
          </div>
          <span className="text-xs font-semibold text-slate-400">7 Clusters • 56 Postes</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {telemetry.clusters.map((cluster) => (
            <div
              key={cluster.clusterId}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                    {cluster.clusterCode}
                  </span>
                  <h4 className="font-bold text-xs text-slate-800 mt-1">{cluster.clusterName}</h4>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-[#008751]">{cluster.occupancyRate}%</div>
                  <div className="text-[10px] text-slate-400">Occupé</div>
                </div>
              </div>

              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-[#008751] h-full"
                  style={{ width: `${cluster.occupancyRate}%` }}
                />
              </div>

              <div className="grid grid-cols-4 gap-1 text-center text-[10px] pt-1">
                <div className="p-1 rounded bg-emerald-50 text-emerald-700 font-bold">
                  <div>{cluster.availableDesks}</div>
                  <div className="text-[8px] font-normal">Libres</div>
                </div>
                <div className="p-1 rounded bg-amber-50 text-amber-700 font-bold">
                  <div>{cluster.reservedDesks}</div>
                  <div className="text-[8px] font-normal">Réservés</div>
                </div>
                <div className="p-1 rounded bg-indigo-50 text-indigo-700 font-bold">
                  <div>{cluster.occupiedDesks}</div>
                  <div className="text-[8px] font-normal">Occupés</div>
                </div>
                <div className="p-1 rounded bg-red-50 text-red-700 font-bold">
                  <div>{cluster.maintenanceDesks}</div>
                  <div className="text-[8px] font-normal">Maint.</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
