import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  UserCheck,
  Clock,
  Users,
  Check,
  ScanLine,
  AlertTriangle,
  Armchair,
  CalendarDays,
} from 'lucide-react';
import { ReservationsTable } from '../../../shared/components/ReservationsTable';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { ReceptionSeatScanModal } from '../../../shared/components/ReceptionSeatScanModal';
import { fetchReservations } from '@/services/reservations/reservationService';
import { apiCheckInForReservation } from '@/services/api/checkinoutApi';
import { SettingsService } from '@/services/settings/settingsService';
import { apiFetchClusters } from '@/services/api/workspaceApi';
import { Reservation, SystemSettings } from '../../../types';
import { useAuth } from '../../auth/context/AuthContext';

/**
 * Receptionist home - SRS §8.5: front-office support. The §13 matrix makes this role X on
 * Dashboard exécutif, Analytics and Audit logs, so this screen deliberately carries no KPI/
 * heatmap/trend content. It answers only the three questions the desk actually needs:
 * who is expected today, who has arrived, and which seats are free to offer someone.
 *
 * Reservations are fetched from the database here. The previous version read
 * getLocalReservations(), which only returns the localStorage cache and never fetches - on a
 * fresh session this screen showed "Aucune réservation aujourd'hui" even when the day was full.
 */

const CHECKED_IN_STATUSES = new Set<Reservation['status']>(['check-in', 'check-out', 'terminée']);
const AWAITING_STATUSES = new Set<Reservation['status']>(['confirmée', 'en attente']);

/**
 * Minutes until this reservation flips to no-show; negative once the window has passed.
 *
 * Reconstructed with Date.UTC, NOT setHours, and the difference is not cosmetic.
 *
 * `start_time` is a wall-clock string, and it is rendered by the SERVER
 * (ReservationRepository.mapRowToReservation → formatTime, which uses getHours() in the server's
 * own zone) while `reservation_date` next to it comes from toISOString(), which is UTC. Rebuilding
 * an instant from those two with setHours re-interprets that string in the BROWSER's zone. On a
 * UTC+1 client that shifted every reservation an hour earlier than the server believes it starts,
 * so the desk was told "délai dépassé - passage en no-show imminent" a full hour before
 * NoShowService.detectNoShows would agree - a 08:00 booking flagged as overdue at 08:15 when the
 * server saw 15 of its 30 minutes elapsed.
 *
 * Date.UTC reads the same clock time the server wrote, so this countdown and the sweep that
 * actually flips the status now measure from the same instant.
 *
 * BEFORE YOU CHANGE THIS: the fix belongs here only while start_time stays a server-rendered wall
 * clock. If the domain object ever carries the raw start_at instant, use that instead - it removes
 * the ambiguity rather than compensating for it. See README §22, "floating local times".
 */
function minutesUntilNoShow(res: Reservation, delayMinutes: number): number {
  const [h, m] = (res.start_time || '00:00').split(':').map(Number);
  const [y, mo, d] = (res.reservation_date || '').split('-').map(Number);
  if (!y || !mo || !d) return Number.POSITIVE_INFINITY;
  const startMs = Date.UTC(y, mo - 1, d, h || 0, m || 0, 0, 0);
  return Math.round((startMs + delayMinutes * 60000 - Date.now()) / 60000);
}

export const ReceptionView: React.FC = () => {
  const { currentUser } = useAuth();
  const [todaysReservations, setTodaysReservations] = useState<Reservation[]>([]);
  const [clusters, setClusters] = useState<{ code: string; name: string; available: number; total: number }[]>([]);
  const [noShowDelay, setNoShowDelay] = useState(30);
  const [showScanModal, setShowScanModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Re-render each minute so the no-show countdowns stay truthful.
  const [, setTick] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const all = await fetchReservations().catch(() => [] as Reservation[]);
      const today = new Date().toISOString().split('T')[0];
      setTodaysReservations(all.filter((r) => r.reservation_date === today));

      const cls = await apiFetchClusters().catch(() => []);
      setClusters(
        cls.map((c) => ({
          code: c.code,
          name: c.name,
          available: c.workstations.filter((w) => w.status === 'disponible').length,
          total: c.workstations.length,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    window.addEventListener('xfactory_reservations_changed', loadData);
    return () => window.removeEventListener('xfactory_reservations_changed', loadData);
  }, [loadData]);

  useEffect(() => {
    const applySettings = (s: SystemSettings) => setNoShowDelay(s.noShowDelayMinutes ?? 30);
    const result = SettingsService.getSettings();
    if (result instanceof Promise) result.then(applySettings).catch(() => {});
    else applySettings(result);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const handleQuickCheckin = async (res: Reservation) => {
    setPendingId(res.id);
    setError(null);
    try {
      await apiCheckInForReservation(res.id);
      setMessage(`Check-in enregistré pour ${res.user_name || 'le collaborateur'} (${res.workstation_code}).`);
      await loadData();
    } catch (err: any) {
      // Must surface: the previous client-side call returned false instead of throwing, so a
      // failed check-in was reported to the desk as a success.
      setError(err?.message || 'Échec du check-in.');
    } finally {
      setPendingId(null);
    }
  };

  const arrived = todaysReservations.filter((r) => CHECKED_IN_STATUSES.has(r.status));
  const awaiting = todaysReservations.filter((r) => AWAITING_STATUSES.has(r.status));
  const noShows = todaysReservations.filter((r) => r.status === 'no-show');

  /** Awaiting arrivals, most urgent first - the desk's actual work queue. */
  const actionQueue = useMemo(
    () =>
      awaiting
        .map((r) => ({ res: r, minutesLeft: minutesUntilNoShow(r, noShowDelay) }))
        .sort((a, b) => a.minutesLeft - b.minutesLeft),
    [awaiting, noShowDelay]
  );

  const totalAvailable = clusters.reduce((sum, c) => sum + c.available, 0);
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const statusPill = (status: Reservation['status']) => {
    if (CHECKED_IN_STATUSES.has(status)) return { label: 'Arrivé', className: 'bg-emerald-100 text-emerald-700' };
    if (status === 'no-show') return { label: 'No-show', className: 'bg-rose-100 text-rose-700' };
    if (status === 'annulée' || status === 'rejetée') return { label: 'Annulée', className: 'bg-slate-200 text-slate-600' };
    return { label: 'En attente', className: 'bg-amber-100 text-amber-700' };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-6 border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded bg-teal-500/20 text-teal-300 font-bold text-xs">
              Rôle : Réceptionniste
            </span>
          </div>
          <h1 className="text-xl font-bold mt-2">
            Bienvenue {currentUser.full_name}
          </h1>
          {/* The date stays - it is information the desk actually uses, not a claim about the
              product like the taglines that were removed from these banners. */}
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{today}</p>
        </div>

        <button
          onClick={() => setShowScanModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold rounded-xl transition-all"
          title="Scanner le badge d'un poste pour aider un collaborateur"
        >
          <ScanLine className="w-4 h-4" />
          Scanner un poste (aide collaborateur)
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            {error}
          </span>
          <button onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900 font-bold ml-3">
            Fermer
          </button>
        </div>
      )}

      {message && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            {message}
          </span>
          <button onClick={() => setMessage(null)} className="text-emerald-700 hover:text-emerald-900 font-bold ml-3">
            Fermer
          </button>
        </div>
      )}

      {/* The three questions the desk needs answered */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Réservations aujourd'hui</span>
            <CalendarDays className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{loading ? '...' : todaysReservations.length}</div>
          <p className="text-[11px] text-slate-500">{loading ? '' : `${noShows.length} no-show`}</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Arrivées</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700">{loading ? '...' : arrived.length}</div>
          <p className="text-[11px] text-slate-500">check-in effectué</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Check-in en attente</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className={`text-2xl font-black ${awaiting.length > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
            {loading ? '...' : awaiting.length}
          </div>
          <p className="text-[11px] text-slate-500">à accueillir</p>
        </div>
      </div>

      {/* Action queue */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-teal-600" />
          Actions immédiates
          {actionQueue.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              {actionQueue.length}
            </span>
          )}
        </h3>

        {loading && <p className="text-xs text-slate-400">Chargement...</p>}
        {!loading && actionQueue.length === 0 && (
          <p className="text-xs text-slate-400 italic py-4 text-center">
            Personne en attente de check-in. Tout le monde attendu est arrivé.
          </p>
        )}

        <div className="space-y-2">
          {actionQueue.map(({ res, minutesLeft }) => {
            const overdue = minutesLeft <= 0;
            // Only a CONFIRMED reservation can be checked in. CheckInOutService.performCheckIn
            // refuses anything else, so offering the button on a reservation still waiting for a
            // Director's or an Assistant's decision produced a control that could not work - it
            // reported a failure the receptionist had no way to resolve from this screen.
            // Such a reservation is also never marked no-show by the sweep, which only acts on
            // CONFIRMED, so the no-show countdown does not apply to it either.
            const awaitingApproval = res.status === 'en attente';
            return (
              <div
                key={res.id}
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                  awaitingApproval
                    ? 'bg-slate-50 border-slate-200'
                    : overdue
                    ? 'bg-rose-50 border-rose-200'
                    : 'bg-amber-50 border-amber-200'
                }`}
              >
                <div className="text-xs min-w-0">
                  <div className="font-bold text-slate-900 truncate">
                    {res.user_name || 'Collaborateur'}
                    {res.user_department && (
                      <span className="ml-2 font-normal text-slate-500">{res.user_department}</span>
                    )}
                  </div>
                  <div className="text-slate-600 mt-0.5">
                    {res.start_time} → {res.end_time} · Poste{' '}
                    <strong className="text-slate-900">{res.workstation_code}</strong>
                    {res.cluster_name && <span className="text-slate-400"> ({res.cluster_name})</span>}
                  </div>
                  <div
                    className={`mt-1 flex items-center gap-1 font-bold ${
                      overdue ? 'text-rose-700' : 'text-amber-700'
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {awaitingApproval
                      ? `En attente d'approbation - check-in impossible tant que la demande n'est pas validée`
                      : overdue
                      ? `Délai dépassé - passage en no-show imminent`
                      : `Il reste ${minutesLeft} min avant le no-show`}
                  </div>
                </div>

                {awaitingApproval ? (
                  <span className="shrink-0 px-3.5 py-2 rounded-lg text-xs font-bold bg-slate-200 text-slate-600">
                    À approuver
                  </span>
                ) : (
                  <button
                    onClick={() => handleQuickCheckin(res)}
                    disabled={pendingId === res.id}
                    className="shrink-0 bg-[#008751] hover:bg-[#005f38] disabled:opacity-60 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {pendingId === res.id ? 'Enregistrement...' : 'Check-in'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Today's list + free seats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Réservations du jour</h3>
          {!loading && todaysReservations.length === 0 && (
            <p className="text-xs text-slate-400 italic">Aucune réservation aujourd'hui.</p>
          )}
          <div className="max-h-80 overflow-y-auto overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-[10px] uppercase text-slate-400 border-b border-slate-200">
                  <th className="py-2 pr-3 font-bold">Horaire</th>
                  <th className="py-2 pr-3 font-bold">Collaborateur</th>
                  <th className="py-2 pr-3 font-bold">Poste</th>
                  <th className="py-2 font-bold">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...todaysReservations]
                  .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
                  .map((r) => {
                    const pill = statusPill(r.status);
                    return (
                      <tr key={r.id}>
                        <td className="py-2 pr-3 font-mono text-slate-500">{r.start_time}</td>
                        <td className="py-2 pr-3 font-semibold text-slate-800">{r.user_name || ''}</td>
                        <td className="py-2 pr-3 text-slate-600">{r.workstation_code}</td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${pill.className}`}>
                            {pill.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Armchair className="w-4 h-4 text-emerald-600" />
            Postes disponibles
            <span className="ml-auto text-lg font-black text-emerald-700">{loading ? '...' : totalAvailable}</span>
          </h3>
          <div className="space-y-1.5">
            {clusters.map((c) => (
              <div key={c.code} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                <span className="font-bold text-slate-700">{c.code}</span>
                <span className={c.available > 0 ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                  {c.available} / {c.total} libres
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
            Cliquez un poste disponible sur le plan ci-dessous pour réserver au nom d'un collaborateur.
          </p>
        </div>
      </div>

      {/* Seat map - selectable: the §13 matrix gives this role "C" on Réserver poste standard,
          and the UML use-case diagram gives it "Réserver un poste". It was rendered read-only,
          which blocked exactly that. */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3">Plan des postes - réserver pour un collaborateur</h3>
        <DigitalTwin />
      </div>

      <div>
        <ReservationsTable />
      </div>

      {showScanModal && (
        <ReceptionSeatScanModal
          todaysReservations={todaysReservations}
          onClose={() => setShowScanModal(false)}
          onDone={loadData}
        />
      )}
    </div>
  );
};
