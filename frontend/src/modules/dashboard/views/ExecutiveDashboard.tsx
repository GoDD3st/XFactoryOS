import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import {
  SiteTelemetrySummary,
  DailyReservationTrend,
  UserDepartmentStats,
  OccupancyPrediction,
} from '@/services/telemetry/telemetryService';
import { apiFetchNoShowStats } from '@/services/api/noShowApi';
import {
  apiFetchReservationTrends,
  apiFetchOccupancy,
  apiFetchDepartmentStats,
  apiFetchOccupancyPrediction,
  getLastTelemetryFailure,
} from '@/services/api/telemetryApi';
import { apiLogExport } from '@/services/api/auditApi';
import { bucketTrends } from '@/services/telemetry/trendBuckets';
import { useAuth } from '../../auth/context/AuthContext';
import { BarChart3, TrendingUp, Clock, AlertTriangle, Download, Sparkles, Building, Layers, FileSpreadsheet, Printer, LineChart, CheckCircle2, CalendarClock, Users, Sparkle } from 'lucide-react';

const TREND_PRESETS: { label: string; days: number }[] = [
  { label: '7j', days: 7 },
  { label: '14j', days: 14 },
  { label: '30j', days: 30 },
  { label: '90j', days: 90 },
  { label: '6 mois', days: 180 },
  { label: '1 an', days: 365 },
];

export const ExecutiveDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [telemetry, setTelemetry] = useState<SiteTelemetrySummary | null>(null);
  const [noShowStats, setNoShowStats] = useState<{ today: number; thisWeek: number }>({ today: 0, thisWeek: 0 });
  const [trends, setTrends] = useState<DailyReservationTrend[]>([]);
  const [userDeptStats, setUserDeptStats] = useState<UserDepartmentStats | null>(null);
  const [prediction, setPrediction] = useState<OccupancyPrediction | null>(null);
  // Separate from `telemetry` so a failed fetch shows an error instead of spinning forever:
  // apiFetchOccupancy resolves to null on 403/500 rather than rejecting.
  const [occupancyLoaded, setOccupancyLoaded] = useState(false);
  // The trend window is a question the reader asks, not a constant. 14 days is only the opening
  // position; any value between 1 and 730 is accepted by /api/telemetry/trends.
  const [trendDays, setTrendDays] = useState<number>(14);

  useEffect(() => {
    // Every KPI comes from /api/telemetry (BPMN D6 "DASH → API Layer"). Computing them in the
    // browser aggregated an RLS-filtered read, so a Director - outside p_reservations_owner_read
    // - saw the whole dashboard derived from their own bookings. See services/api/telemetryApi.ts.
    const refresh = () => {
      apiFetchOccupancy().then((t) => {
        setTelemetry(t);
        setOccupancyLoaded(true);
      });
      apiFetchOccupancyPrediction().then(setPrediction);
      apiFetchNoShowStats().then(setNoShowStats);
      apiFetchReservationTrends(trendDays).then(setTrends);
      apiFetchDepartmentStats().then(setUserDeptStats);
    };

    refresh();

    // Occupancy/no-show KPIs previously only loaded once on mount and went stale until a manual
    // page reload - everywhere else (Digital Twin) already reacts live to these same events via
    // Supabase Realtime (database/realtime.ts), so wire the executive KPIs to them too.
    window.addEventListener('xfactory_reservations_changed', refresh);
    window.addEventListener('xfactory_workstations_changed', refresh);

    return () => {
      window.removeEventListener('xfactory_reservations_changed', refresh);
      window.removeEventListener('xfactory_workstations_changed', refresh);
    };
  }, [trendDays]);

  if (!telemetry) {
    const cause = getLastTelemetryFailure();
    return occupancyLoaded ? (
      <div className="p-8 text-center text-xs text-slate-500">
        {cause === 'forbidden'
          ? "Vous n'avez pas accès aux analytics."
          : cause === 'unreachable'
          ? 'Serveur injoignable. Vérifiez que le service est démarré, puis rechargez.'
          : "Le service de télémétrie n'a pas répondu. Réessayez dans un instant."}
      </div>
    ) : (
      <div className="p-8 text-center text-xs text-slate-500">Chargement de la télémetrie...</div>
    );
  }

  // ---------------------------------------------------------------------------
  // Report model
  //
  // The three buttons used to disagree about what "the report" was. CSV carried the cluster table
  // and nothing else, Excel carried clusters plus trends, and PDF was a bare window.print() over
  // the live screen - navigation bar, export buttons, hover states and all, which is why it read
  // as a screenshot rather than a document. None of them carried the KPIs shown on the page, the
  // department split, the forecast, or so much as a generation date, so two exports of the same
  // dashboard taken a week apart were indistinguishable.
  //
  // One model, three renderings. Every export now answers the same questions - when, by whom,
  // over which window, and what the figures were - and they cannot drift apart because they all
  // read from here.
  // ---------------------------------------------------------------------------

  /** Header block repeated at the top of every rendering. */
  const reportMeta = (): [string, string][] => [
    ['Site', telemetry.siteName],
    ['Rapport', 'Dashboard Exécutif & Télémétrie'],
    ['Généré le', new Date().toLocaleString('fr-FR')],
    ['Généré par', currentUser.full_name + ' (' + currentUser.department + ')'],
    ['Fenêtre de tendance', trendPeriodLabel],
    ['Relevé télémétrie', new Date(telemetry.timestamp).toLocaleString('fr-FR')],
  ];

  /** The KPI cards on screen, in the order they are read, plus the forecast beneath them. */
  const kpiRows = (): [string, string | number][] => [
    ["Taux d'occupation live (%)", telemetry.overallOccupancyRate],
    ['Capacité totale (postes)', telemetry.totalCapacity],
    ['Occupations actives (postes)', telemetry.activeOccupancy],
    ['Postes disponibles', availableTotal],
    ['Postes réservés', reservedTotal],
    ['Heures de pointe', telemetry.peakHourWindow],
    ["No-shows aujourd'hui", noShowStats.today],
    ['No-shows cette semaine', noShowStats.thisWeek],
    ...(userDeptStats
      ? ([
          ["Utilisateurs actifs aujourd'hui", userDeptStats.activeToday],
          ['Utilisateurs actifs cette semaine', userDeptStats.activeThisWeek],
          ['Utilisateurs actifs ce mois', userDeptStats.activeThisMonth],
        ] as [string, string | number][])
      : []),
    ...(prediction
      ? ([
          ['Prévision - date', prediction.predictedDate],
          ["Prévision - taux d'occupation (%)", prediction.predictedOccupancyRate],
          ['Prévision - forte affluence', prediction.isHighDemand ? 'Oui' : 'Non'],
          ["Prévision - taille d'échantillon", prediction.sampleSize],
        ] as [string, string | number][])
      : []),
  ];

  const clusterRows = () =>
    telemetry.clusters.map((c) => ({
      Cluster: c.clusterName,
      Code: c.clusterCode,
      Total: c.totalDesks,
      Occupés: c.occupiedDesks,
      Réservés: c.reservedDesks,
      Disponibles: c.availableDesks,
      Maintenance: c.maintenanceDesks,
      "Taux d'occupation (%)": c.occupancyRate,
    }));

  const trendRows = () =>
    trends.map((t) => ({
      Date: t.date,
      Réservations: t.count,
      'No-shows': t.noShows,
    }));

  const departmentRows = () =>
    (userDeptStats?.departmentUsage ?? []).map((d) => ({
      Département: d.department,
      Réservations: d.count,
      'Part (%)': d.percentage,
    }));

  const reportFileStem = () =>
    'Rapport_XFactory_' +
    telemetry.siteName.replace(/[^A-Za-z0-9]+/g, '-') +
    '_' +
    new Date().toISOString().split('T')[0];

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    // Without this the object URL - and the blob behind it - is held until a full page reload.
    URL.revokeObjectURL(url);
  };

  // FR-87 "Export CSV". Semicolon-separated because the audience opens these in a French-locale
  // Excel, where the comma is a decimal separator and a comma-separated file lands in one column.
  const exportReportCSV = () => {
    const esc = (v: unknown) => {
      const str = String(v ?? '');
      return /[";\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
    };
    const section = (title: string, header: string[], rows: unknown[][]) =>
      [title, header.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';')), ''].join('\n');

    const clusters = clusterRows();
    const trendsData = trendRows();
    const departments = departmentRows();

    const body = [
      section('# SYNTHÈSE', ['Champ', 'Valeur'], reportMeta().map(([k, v]) => [k, v])),
      section('# INDICATEURS', ['Indicateur', 'Valeur'], kpiRows().map(([k, v]) => [k, v])),
      clusters.length
        ? section('# CLUSTERS', Object.keys(clusters[0]), clusters.map((c) => Object.values(c)))
        : '',
      trendsData.length
        ? section('# TENDANCES', Object.keys(trendsData[0]), trendsData.map((t) => Object.values(t)))
        : '',
      departments.length
        ? section('# DÉPARTEMENTS', Object.keys(departments[0]), departments.map((d) => Object.values(d)))
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    // BOM first: without it Excel reads the file in the system codepage and every accented
    // heading in this report arrives mangled.
    downloadBlob(
      new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }),
      reportFileStem() + '.csv'
    );

    apiLogExport(
      reportFileStem() + '.csv',
      'Export CSV du dashboard exécutif (synthèse, indicateurs, ' +
        clusters.length +
        ' clusters, tendances ' +
        trendDays +
        'j, départements).'
    );
  };

  // FR-87 "Export Excel des données agrégées"
  const exportReportExcel = () => {
    const wb = XLSX.utils.book_new();

    const summary = [
      ...reportMeta().map(([k, v]) => ({ Champ: k, Valeur: v as string | number })),
      { Champ: '', Valeur: '' },
      ...kpiRows().map(([k, v]) => ({ Champ: k, Valeur: v })),
    ];
    const summarySheet = XLSX.utils.json_to_sheet(summary);
    summarySheet['!cols'] = [{ wch: 34 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Synthèse');

    const clusters = clusterRows();
    const clusterSheet = XLSX.utils.json_to_sheet(clusters);
    clusterSheet['!cols'] = [
      { wch: 24 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 14 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, clusterSheet, 'Clusters');

    const trendsData = trendRows();
    if (trendsData.length) {
      const trendSheet = XLSX.utils.json_to_sheet(trendsData);
      trendSheet['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 12 }];
      // Sheet names are capped at 31 characters; "Tendances 730j" is comfortably inside it.
      XLSX.utils.book_append_sheet(wb, trendSheet, 'Tendances ' + trendDays + 'j');
    }

    const departments = departmentRows();
    if (departments.length) {
      const deptSheet = XLSX.utils.json_to_sheet(departments);
      deptSheet['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, deptSheet, 'Départements');
    }

    XLSX.writeFile(wb, reportFileStem() + '.xlsx');

    apiLogExport(
      reportFileStem() + '.xlsx',
      'Export Excel du dashboard exécutif (' +
        wb.SheetNames.length +
        ' feuilles : ' +
        wb.SheetNames.join(', ') +
        ').'
    );
  };

  // FR-87 "Export PDF du dashboard" - still print-to-PDF, because this stack has no server-side
  // PDF renderer and adding one for a single button is not worth the dependency. What changed is
  // WHAT gets printed: the `@media print` block in src/styles.css hides the application shell and
  // reveals the report document rendered at the bottom of this view, so the output is a paginated
  // A4 report rather than a picture of the screen with a navigation bar across the top.
  const exportReportPDF = () => {
    apiLogExport(
      reportFileStem() + '.pdf',
      'Export PDF du dashboard exécutif (rapport imprimable, tendances ' + trendDays + 'j).'
    );
    window.print();
  };

  // Days below a year, months from a year up - see services/telemetry/trendBuckets.ts. The API
  // always answers in days; this only decides how the series is drawn.
  const { buckets: trendBuckets, granularity: trendGranularity } = bucketTrends(trends, trendDays);
  const maxTrendCount = Math.max(1, ...trendBuckets.map((b) => b.count));
  // One label per bar is unreadable past ~30 bars, so show roughly a dozen whatever the window:
  // every bar at 14 days, every other at 30, every fortnight at 90. Monthly buckets never exceed
  // ~24 bars, so they all get a label.
  const labelEvery = Math.max(1, Math.ceil(trendBuckets.length / 12));
  const trendPeriodLabel =
    trendDays === 1
      ? 'dernier jour'
      : trendDays % 365 === 0
      ? `${trendDays / 365} an${trendDays / 365 > 1 ? 's' : ''}`
      : trendDays % 30 === 0
      ? `${trendDays / 30} mois`
      : `${trendDays} derniers jours`;
  const availableTotal = telemetry.clusters.reduce((sum, c) => sum + c.availableDesks, 0);
  const reservedTotal = telemetry.clusters.reduce((sum, c) => sum + c.reservedDesks, 0);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 text-white shadow-lg border border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-black tracking-tight">Dashboard Exécutif & Telemetry</h2>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-[#008751] text-white rounded border border-emerald-400/30">
              Site Safi
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

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Postes Disponibles</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{availableTotal}</div>
          <p className="text-[10px] text-slate-400 font-medium">/ {telemetry.totalCapacity} postes</p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Postes Réservés</span>
            <CalendarClock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{reservedTotal}</div>
          <p className="text-[10px] text-slate-400 font-medium">/ {telemetry.totalCapacity} postes</p>
        </div>
      </div>

      {/* Reservation Trends (FR-86) */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <LineChart className="w-5 h-5 text-[#008751]" />
            <h3 className="font-bold text-sm text-slate-800">
              Tendance des Réservations ({trendPeriodLabel}{trendGranularity === 'month' ? ' · par mois' : ''})
            </h3>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {TREND_PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setTrendDays(p.days)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                  trendDays === p.days
                    ? 'bg-[#008751] border-[#008751] text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {p.label}
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={730}
              value={trendDays}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v)) setTrendDays(Math.min(730, Math.max(1, v)));
              }}
              aria-label="Nombre de jours"
              className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-700"
            />
            <span className="text-[11px] text-slate-400 font-semibold">jours</span>
          </div>
        </div>

        {trendBuckets.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">Données insuffisantes pour établir une tendance.</p>
        ) : (
          <div className={`flex items-end h-32 ${trendBuckets.length > 45 ? 'gap-px' : 'gap-1.5'}`}>
            {trendBuckets.map((b, i) => (
              <div key={b.key} className="flex-1 flex flex-col items-center justify-end gap-1 group relative">
                <div className="text-[9px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-4 whitespace-nowrap">
                  {b.count}
                </div>
                <div className="w-full flex flex-col justify-end" style={{ height: '100px' }}>
                  {b.noShows > 0 && (
                    <div
                      className="w-full bg-red-400 rounded-t"
                      style={{ height: `${(b.noShows / maxTrendCount) * 100}px` }}
                    />
                  )}
                  <div
                    className="w-full bg-[#008751]"
                    style={{ height: `${((b.count - b.noShows) / maxTrendCount) * 100}px` }}
                  />
                </div>
                <div className="text-[8px] text-slate-400 font-medium">
                  {/* Index from map, not indexOf: with monthly buckets two months can hold equal
                      counts, and indexOf on the value would label the wrong bar. */}
                  {i % labelEvery === 0 ? b.label : ''}
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

      {/* User & Department Statistics */}
      {userDeptStats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#008751]" />
              <h3 className="font-bold text-sm text-slate-800">Utilisateurs Actifs</h3>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-black text-slate-900">{userDeptStats.activeToday}</div>
                <div className="text-[10px] text-slate-400">Aujourd'hui</div>
              </div>
              <div>
                <div className="text-lg font-black text-slate-900">{userDeptStats.activeThisWeek}</div>
                <div className="text-[10px] text-slate-400">Cette semaine</div>
              </div>
              <div>
                <div className="text-lg font-black text-slate-900">{userDeptStats.activeThisMonth}</div>
                <div className="text-[10px] text-slate-400">Ce mois</div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-[#008751]" />
                <h3 className="font-bold text-sm text-slate-800">Usage par Département</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-semibold">30 derniers jours</span>
            </div>
            {userDeptStats.departmentUsage.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Données insuffisantes.</p>
            ) : (
              <div className="space-y-2">
                {userDeptStats.departmentUsage.slice(0, 6).map((d) => (
                  <div key={d.department} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 text-xs font-semibold text-slate-600 truncate">{d.department}</span>
                    <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-[#008751] h-full" style={{ width: `${d.percentage}%` }} />
                    </div>
                    <span className="w-10 text-right text-xs font-bold text-slate-700">{d.percentage}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Predictions (statistical forecast, not a live model) */}
      {prediction && (
        <div className="p-5 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkle className="w-5 h-5 text-amber-300" />
              <h3 className="font-bold text-sm">Prévision d'Occupation - Demain</h3>
            </div>
            {prediction.isHighDemand && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Forte demande prévue
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-black">{prediction.predictedOccupancyRate}%</div>
            <div className="flex-1 bg-slate-800 h-2.5 rounded-full overflow-hidden">
              <div
                className={`h-full ${prediction.isHighDemand ? 'bg-amber-400' : 'bg-[#008751]'}`}
                style={{ width: `${prediction.predictedOccupancyRate}%` }}
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            {prediction.sampleSize > 0 ? (
              <>
                Basé sur {prediction.sampleSize} {new Date(`${prediction.predictedDate}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long' })}(s) précédent(s).
                {prediction.peakWindow && ` Affluence habituelle : ${prediction.peakWindow}.`}
              </>
            ) : (
              "Données historiques insuffisantes pour ce jour de la semaine - estimation à confirmer avec plus d'usage."
            )}
          </p>
        </div>
      )}

      {/* Cluster Occupancy Heatmap Table */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-[#008751]" />
            <h3 className="font-bold text-sm text-slate-800">Heatmap d'Occupation des Clusters</h3>
          </div>
          <span className="text-xs font-semibold text-slate-400">
            {telemetry.clusters.length} Clusters • {telemetry.totalCapacity} Postes
          </span>
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

      {/* ---------------------------------------------------------------------
          Printable report document.

          Hidden on screen, and the only thing visible on paper - see the
          `@media print` block in src/styles.css, which hides the application
          shell and reveals this. That is what turns the PDF button from a
          picture of the screen into an actual paginated report.

          Rendered through a portal onto <body> rather than in place. The print
          rules position it absolutely, and left here it would resolve against
          the nearest positioned ancestor and be clipped by any of them that
          scrolls internally - or by .glass-panel, whose backdrop-filter makes
          it a containing block for absolutely positioned descendants. As a
          direct child of <body> none of that can reach it.

          It is plain tables on purpose: bar charts, ring gauges and colour-coded
          tiles are how you read a screen, not how you read a printout, and most
          of them come out as empty rectangles once the browser drops background
          graphics. The figures are the same ones the cards above show, because
          both read from the same model.
      --------------------------------------------------------------------- */}
      {createPortal(
        <div className="xf-print-report hidden">
          <header className="xf-print-header">
            <h1>{telemetry.siteName}</h1>
            <p>Dashboard Exécutif &amp; Télémétrie — Module Smart Open Space Management</p>
          </header>

          <table className="xf-print-table xf-print-meta">
            <tbody>
              {reportMeta().map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Indicateurs</h2>
          <table className="xf-print-table">
            <tbody>
              {kpiRows().map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Occupation par cluster</h2>
          <table className="xf-print-table">
            <thead>
              <tr>
                <th>Cluster</th>
                <th>Code</th>
                <th>Total</th>
                <th>Occupés</th>
                <th>Réservés</th>
                <th>Disponibles</th>
                <th>Maintenance</th>
                <th>Taux</th>
              </tr>
            </thead>
            <tbody>
              {telemetry.clusters.map((c) => (
                <tr key={c.clusterCode}>
                  <td>{c.clusterName}</td>
                  <td>{c.clusterCode}</td>
                  <td>{c.totalDesks}</td>
                  <td>{c.occupiedDesks}</td>
                  <td>{c.reservedDesks}</td>
                  <td>{c.availableDesks}</td>
                  <td>{c.maintenanceDesks}</td>
                  <td>{c.occupancyRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          {trends.length > 0 && (
            <>
              <h2>Tendance des réservations ({trendPeriodLabel})</h2>
              <table className="xf-print-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Réservations</th>
                    <th>No-shows</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.map((t) => (
                    <tr key={t.date}>
                      <td>{t.date}</td>
                      <td>{t.count}</td>
                      <td>{t.noShows}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {(userDeptStats?.departmentUsage?.length ?? 0) > 0 && (
            <>
              <h2>Répartition par département</h2>
              <table className="xf-print-table">
                <thead>
                  <tr>
                    <th>Département</th>
                    <th>Réservations</th>
                    <th>Part</th>
                  </tr>
                </thead>
                <tbody>
                  {userDeptStats!.departmentUsage.map((d) => (
                    <tr key={d.department}>
                      <td>{d.department}</td>
                      <td>{d.count}</td>
                      <td>{d.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <footer className="xf-print-footer">
            {telemetry.siteName} — document généré depuis XFactory OS le{' '}
            {new Date().toLocaleString('fr-FR')} par {currentUser.full_name}. Données internes OCP,
            diffusion restreinte.
          </footer>
        </div>,
        document.body
      )}
    </div>
  );
};
