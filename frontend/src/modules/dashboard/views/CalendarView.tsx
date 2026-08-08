import React, { useState, useEffect, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { getLocalReservations, syncReservationsFromDb } from '@/services/reservations/reservationService';
import { INITIAL_CLUSTERS } from '@/services/workspaces/workspaceService';
import { Reservation } from '@/frontend/src/types';

type ViewMode = 'day' | 'week' | 'month';

const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/** Monday of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // shift Sunday(0) back to the previous Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

export const CalendarView: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [clusterFilter, setClusterFilter] = useState<string>('');
  const [reservations, setReservations] = useState<Reservation[]>(getLocalReservations());

  useEffect(() => {
    syncReservationsFromDb().then(setReservations);
    const handler = () => setReservations(getLocalReservations());
    window.addEventListener('xfactory_reservations_changed', handler);
    return () => window.removeEventListener('xfactory_reservations_changed', handler);
  }, []);

  const filtered = useMemo(
    () => reservations.filter((r) => !clusterFilter || r.cluster_name === clusterFilter),
    [reservations, clusterFilter]
  );

  const weekDates = useMemo(() => {
    const start = startOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [currentDate]);

  const navigate = (direction: -1 | 1) => {
    const next = new Date(currentDate);
    if (viewMode === 'day') next.setDate(next.getDate() + direction);
    else if (viewMode === 'week') next.setDate(next.getDate() + direction * 7);
    else next.setMonth(next.getMonth() + direction);
    setCurrentDate(next);
  };

  const reservationsFor = (dateStr: string) => filtered.filter((r) => r.reservation_date === dateStr);

  const renderDayCell = (date: Date, compact = false) => {
    const dateStr = toDateStr(date);
    const dayRes = reservationsFor(dateStr);
    const isToday = dateStr === toDateStr(new Date());

    return (
      <div
        key={dateStr}
        className={`p-2 rounded-xl border space-y-1.5 ${compact ? 'min-h-[90px]' : 'min-h-[260px]'} ${
          isToday ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50/50 border-slate-100'
        }`}
      >
        <div className={`text-[10px] font-bold ${isToday ? 'text-emerald-700' : 'text-slate-500'}`}>
          {date.toLocaleDateString('fr-FR', { day: '2-digit', month: compact ? undefined : 'short' })}
        </div>
        <div className="space-y-1 overflow-y-auto" style={{ maxHeight: compact ? '60px' : '210px' }}>
          {dayRes.slice(0, compact ? 3 : 20).map((res) => (
            <div
              key={res.id}
              className="p-1.5 rounded-lg bg-[#008751]/10 text-[#008751] border border-emerald-500/20 text-[9px] leading-tight"
              title={`${res.workstation_code} — ${res.user_name} (${res.start_time}-${res.end_time})`}
            >
              <div className="font-bold truncate">{res.workstation_code}</div>
              {!compact && <div className="text-slate-600 truncate">{res.user_name}</div>}
              <div className="text-slate-400">{res.start_time}-{res.end_time}</div>
            </div>
          ))}
          {dayRes.length > (compact ? 3 : 20) && (
            <div className="text-[9px] text-slate-400 font-semibold">+{dayRes.length - (compact ? 3 : 20)} autres</div>
          )}
        </div>
      </div>
    );
  };

  const monthGrid = useMemo(() => {
    if (viewMode !== 'month') return [];
    const firstOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const gridStart = startOfWeek(firstOfMonth);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [currentDate, viewMode]);

  const headerLabel =
    viewMode === 'day'
      ? currentDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : viewMode === 'week'
      ? `Semaine du ${weekDates[0].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} au ${weekDates[6].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`
      : currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Calendrier des Réservations Open Space</h2>
          <p className="text-xs text-slate-500 mt-0.5">Planning des 28 postes et 7 clusters Safi — vues jour, semaine, mois</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Cluster filter (FR-37) */}
          <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={clusterFilter}
              onChange={(e) => setClusterFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="">Tous les clusters</option>
              {INITIAL_CLUSTERS.map((c) => (
                <option key={c.id} value={c.name}>{c.code}</option>
              ))}
            </select>
          </div>

          {/* Day / Week / Month toggle (FR-34/35/36) */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  viewMode === mode ? 'bg-[#008751] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {mode === 'day' ? 'Jour' : mode === 'week' ? 'Semaine' : 'Mois'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between p-3 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800 capitalize">
          <CalendarIcon className="w-4 h-4 text-[#008751]" />
          {headerLabel}
        </div>
        <button onClick={() => navigate(1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Grid */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
        {viewMode === 'day' && (
          <div className="min-w-[280px] max-w-md">{renderDayCell(currentDate)}</div>
        )}

        {viewMode === 'week' && (
          <div className="min-w-[700px] space-y-3">
            <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-600">
              {DAY_LABELS.map((day, idx) => (
                <div key={idx} className="p-2 rounded-lg bg-slate-50 border border-slate-100">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {weekDates.map((d) => renderDayCell(d))}
            </div>
          </div>
        )}

        {viewMode === 'month' && (
          <div className="min-w-[700px] space-y-2">
            <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-slate-600">
              {DAY_LABELS.map((day, idx) => (
                <div key={idx} className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">{day.slice(0, 3)}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {monthGrid.map((d) => {
                const inMonth = d.getMonth() === currentDate.getMonth();
                return (
                  <div key={toDateStr(d)} className={inMonth ? '' : 'opacity-40'}>
                    {renderDayCell(d, true)}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
