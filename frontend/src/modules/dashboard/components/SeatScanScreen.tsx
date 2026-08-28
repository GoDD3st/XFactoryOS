import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, LogIn, LogOut, Clock, MapPin, CalendarDays, UserCheck } from 'lucide-react';
import {
  apiResolveSeatScan,
  apiCheckIn,
  apiCheckOut,
  apiBookWalkIn,
  SeatScanResolution,
} from '@/services/api/checkinoutApi';

interface SeatScanScreenProps {
  seatToken: string;
  onDone: () => void;
}

/**
 * The screen a desk badge leads to.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE FLOW, AND WHY IT HAS THESE STEPS
 *
 *   scan → (login if needed, the scan survives it - see AuthGate) → resolve → confirm identity
 *        → reservation details → explicit CHECK IN → fresh server validation → OCCUPIED
 *
 * Scanning does NOT check anybody in. It used to, and that was wrong twice over: a passer-by
 * pointing a phone at a desk would occupy it, and someone already checked in who scanned again
 * would silently be checked OUT of their own session. The scan now only asks the server what the
 * signed-in user holds on that desk; every state change waits for a button.
 *
 * The identity step exists because a badge is scanned on a shared phone as often as on a personal
 * one. It states plainly whose session is about to be used before anything is recorded against
 * that person's name.
 *
 * When the desk is not the user's, the server answers about the DESK only. Either it is free - in
 * which case the person standing at it is offered it, from now until the next reservation or close
 * of business - or it is not, and the refusal names nobody. The badge is public, and an endpoint
 * that named the occupant would turn every sticker in the building into a directory of who sits
 * where.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
type Phase =
  | { name: 'resolving' }
  | { name: 'confirm-identity'; resolution: SeatScanResolution }
  | { name: 'ready'; resolution: SeatScanResolution }
  | { name: 'submitting'; resolution: SeatScanResolution }
  | { name: 'checked-in'; resolution: SeatScanResolution; at?: string }
  | { name: 'checked-out'; resolution: SeatScanResolution }
  /** The desk is free: choose how long to take it for, then book. */
  | { name: 'walk-in'; resolution: SeatScanResolution; until: string; booking?: boolean }
  | { name: 'error'; message: string };

/** A stored ISO instant shown as a wall clock. Never the browser's own idea of "now". */
function asClock(iso?: string): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '--:--'
    : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * End times offered for a walk-in: half-hour marks inside the free window, plus the window's own
 * end. Bounded by the site's minimum reservation length, so the screen never offers a choice the
 * server would then refuse.
 */
function endChoices(window: { start: string; end: string; minMinutes: number }): string[] {
  const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const asClockTime = (m: number) =>
    String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

  const start = toMin(window.start);
  const end = toMin(window.end);
  const earliest = start + window.minMinutes;

  const choices: number[] = [];
  for (let m = Math.ceil(earliest / 30) * 30; m < end; m += 30) choices.push(m);
  choices.push(end);

  return Array.from(new Set(choices)).map(asClockTime);
}

const Row: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
    <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
      {icon}
      {label}
    </span>
    <span className="text-xs font-extrabold text-slate-900 text-right">{value}</span>
  </div>
);

export const SeatScanScreen: React.FC<SeatScanScreenProps> = ({ seatToken, onDone }) => {
  const [phase, setPhase] = useState<Phase>({ name: 'resolving' });

  useEffect(() => {
    let cancelled = false;
    apiResolveSeatScan(seatToken)
      .then((resolution) => {
        if (!cancelled) setPhase({ name: 'confirm-identity', resolution });
      })
      .catch((err: Error) => {
        if (!cancelled) setPhase({ name: 'error', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [seatToken]);

  const act = async (resolution: SeatScanResolution) => {
    setPhase({ name: 'submitting', resolution });
    try {
      if (resolution.availableAction === 'check-in') {
        // The server re-validates ownership, status and the check-in window here, and answers
        // with the timestamp it stored. Anything the scan established a moment ago is irrelevant.
        const { checkInAt } = await apiCheckIn(resolution.reservation.id);
        setPhase({ name: 'checked-in', resolution, at: checkInAt });
      } else {
        await apiCheckOut(resolution.reservation.id);
        setPhase({ name: 'checked-out', resolution });
      }
      // Repaints the floor plan and the caller's own lists, the same event the dashboard uses.
      window.dispatchEvent(new CustomEvent('xfactory_reservations_changed'));
    } catch (err: any) {
      setPhase({ name: 'error', message: err.message });
    }
  };

  /**
   * Books the desk, then re-resolves the scan so the screen lands on the check-in button for the
   * reservation that now exists. Deliberately two acts: taking a desk and sitting down at it are
   * different things, and check-in is never automatic.
   */
  const bookWalkIn = async (resolution: SeatScanResolution, until: string) => {
    setPhase({ name: 'walk-in', resolution, until, booking: true });
    try {
      // The full window is sent as "no preference": the server recomputes it anyway, and a value
      // that has drifted by a minute in the meantime would be refused for no good reason.
      await apiBookWalkIn(seatToken, until === resolution.walkIn?.end ? undefined : until);
      window.dispatchEvent(new CustomEvent('xfactory_reservations_changed'));
      setPhase({ name: 'ready', resolution: await apiResolveSeatScan(seatToken) });
    } catch (err: any) {
      setPhase({ name: 'error', message: err.message });
    }
  };

  const details = (r: SeatScanResolution) => (
    <div className="text-left bg-slate-50 border border-slate-200 rounded-xl px-3 py-1">
      <Row icon={<MapPin className="w-3.5 h-3.5" />} label="Cluster" value={r.reservation.clusterName} />
      <Row icon={<MapPin className="w-3.5 h-3.5" />} label="Poste" value={r.reservation.workstationCode} />
      <Row icon={<CalendarDays className="w-3.5 h-3.5" />} label="Date" value={r.reservation.date} />
      <Row
        icon={<Clock className="w-3.5 h-3.5" />}
        label="Créneau"
        value={`${r.reservation.startTime} - ${r.reservation.endTime}`}
      />
    </div>
  );

  return (
    <div className="min-h-dvh bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center space-y-4">
        {phase.name === 'resolving' && (
          <>
            <div className="w-10 h-10 mx-auto border-2 border-slate-300 border-t-emerald-600 rounded-full animate-spin" />
            <p className="text-sm font-bold text-slate-700">Lecture du badge du poste...</p>
          </>
        )}

        {phase.name === 'confirm-identity' && (
          <>
            <UserCheck className="w-12 h-12 mx-auto text-teal-700" />
            <h2 className="text-base font-black text-slate-900">Confirmez votre identité</h2>
            <p className="text-xs text-slate-500">
              Vous êtes connecté en tant que{' '}
              <span className="font-extrabold text-slate-800">{phase.resolution.userName || 'utilisateur'}</span>.
              Le check-in sera enregistré à ce nom.
            </p>
            <button
              onClick={() =>
                setPhase(
                  phase.resolution.walkIn
                    ? { name: 'walk-in', resolution: phase.resolution, until: phase.resolution.walkIn.end }
                    : { name: 'ready', resolution: phase.resolution }
                )
              }
              className="w-full px-4 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold rounded-xl transition-all"
            >
              C'est bien moi
            </button>
            <button onClick={onDone} className="w-full text-xs font-bold text-slate-500 hover:text-slate-800 py-1">
              Ce n'est pas moi
            </button>
          </>
        )}

        {(phase.name === 'ready' || phase.name === 'submitting') && (
          <>
            <h2 className="text-base font-black text-slate-900">
              {phase.resolution.availableAction === 'check-in' ? 'Votre réservation' : 'Session en cours'}
            </h2>
            {details(phase.resolution)}

            {phase.resolution.availableAction === 'check-in' ? (
              <button
                onClick={() => act(phase.resolution)}
                disabled={phase.name === 'submitting'}
                className="w-full px-4 py-3.5 bg-[#00b050] hover:bg-[#009040] disabled:opacity-60 text-white text-base font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <LogIn className="w-5 h-5" />
                {phase.name === 'submitting' ? 'Enregistrement...' : 'CHECK IN'}
              </button>
            ) : (
              <button
                onClick={() => act(phase.resolution)}
                disabled={phase.name === 'submitting'}
                className="w-full px-4 py-3.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-white text-base font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <LogOut className="w-5 h-5" />
                {phase.name === 'submitting' ? 'Enregistrement...' : 'CHECK OUT'}
              </button>
            )}

            <button onClick={onDone} className="w-full text-xs font-bold text-slate-500 hover:text-slate-800 py-1">
              Annuler
            </button>
          </>
        )}

        {phase.name === 'walk-in' && phase.resolution.walkIn && (
          <>
            <h2 className="text-base font-black text-slate-900">Poste libre</h2>
            <div className="text-left bg-slate-50 border border-slate-200 rounded-xl px-3 py-1">
              <Row
                icon={<MapPin className="w-3.5 h-3.5" />}
                label="Cluster"
                value={phase.resolution.walkIn.clusterName}
              />
              <Row
                icon={<MapPin className="w-3.5 h-3.5" />}
                label="Poste"
                value={phase.resolution.walkIn.workstationCode}
              />
              <Row
                icon={<CalendarDays className="w-3.5 h-3.5" />}
                label="Date"
                value={phase.resolution.walkIn.date}
              />
              <Row
                icon={<Clock className="w-3.5 h-3.5" />}
                label="Libre de"
                value={`${phase.resolution.walkIn.start} à ${phase.resolution.walkIn.end}`}
              />
            </div>

            {/* Saying WHY the window ends where it does: "until 14:00" means something different
                if somebody else arrives then than if the building simply closes. */}
            <p className="text-[11px] text-slate-500">
              {phase.resolution.walkIn.endReason === 'next_reservation'
                ? 'Ce poste est réservé par un autre collaborateur à partir de cette heure.'
                : "Fin de la journée d'ouverture de l'Open Space."}
            </p>

            <div className="space-y-1.5 text-left">
              <label
                htmlFor="walk-in-until"
                className="text-[11px] font-bold uppercase tracking-wide text-slate-500"
              >
                Jusqu'à
              </label>
              <select
                id="walk-in-until"
                value={phase.until}
                onChange={(e) => setPhase({ ...phase, until: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                {endChoices(phase.resolution.walkIn).map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => bookWalkIn(phase.resolution, phase.until)}
              disabled={phase.booking}
              className="w-full px-4 py-3.5 bg-[#00b050] hover:bg-[#009040] disabled:opacity-60 text-white text-base font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
            >
              <CalendarDays className="w-5 h-5" />
              {phase.booking ? 'Réservation...' : 'RÉSERVER CE POSTE'}
            </button>

            <button onClick={onDone} className="w-full text-xs font-bold text-slate-500 hover:text-slate-800 py-1">
              Annuler
            </button>
          </>
        )}

        {phase.name === 'checked-in' && (
          <>
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
            <h2 className="text-base font-black text-slate-900">
              Bienvenue, {phase.resolution.userName || ''} !
            </h2>
            {details(phase.resolution)}
            {/* The time the DATABASE recorded, returned by the check-in call. */}
            <p className="text-xs font-bold text-emerald-700">Check-in enregistré à {asClock(phase.at)}</p>
          </>
        )}

        {phase.name === 'checked-out' && (
          <>
            <LogOut className="w-12 h-12 mx-auto text-slate-700" />
            <h2 className="text-base font-black text-slate-900">Check-out confirmé</h2>
            {details(phase.resolution)}
            <p className="text-xs text-slate-500">Le poste {phase.resolution.reservation.workstationCode} est libéré.</p>
          </>
        )}

        {phase.name === 'error' && (
          <>
            <XCircle className="w-12 h-12 mx-auto text-red-500" />
            <h2 className="text-base font-black text-slate-900">Accès impossible</h2>
            <p className="text-xs text-slate-500">{phase.message}</p>
          </>
        )}

        {(phase.name === 'checked-in' || phase.name === 'checked-out' || phase.name === 'error') && (
          <button
            onClick={onDone}
            className="w-full mt-2 px-4 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold rounded-xl transition-all"
          >
            Continuer
          </button>
        )}
      </div>
    </div>
  );
};
