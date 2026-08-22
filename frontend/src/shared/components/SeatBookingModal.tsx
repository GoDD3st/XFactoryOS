import React, { useEffect, useMemo, useState } from 'react';
import { Check, X, RefreshCw, Sparkles, AlertCircle, Clock, CalendarDays } from 'lucide-react';
import { Workstation, Cluster, UserProfile } from '../../types';
import { WORKING_HOURS_24H_SLOTS } from '../utils/dateValidation';

/**
 * Floating booking form, opened by picking a seat from either reservation path.
 *
 * Replaces the panel that used to render underneath the floor plan. That panel was ~870px below
 * the fold once the Open Space was zoomed, so clicking a seat looked like it did nothing.
 *
 * The collaborator is never asked who they are: identity comes from the session and is shown
 * read-only. Everything that can be a choice is a button - date, slot and motif are all
 * one-click, with free text kept for the cases the presets don't cover.
 */

const SLOT_PRESETS: { label: string; start: string; end: string }[] = [
  { label: 'Matin', start: '08:00', end: '12:00' },
  { label: 'Après-midi', start: '13:00', end: '17:00' },
  { label: 'Journée', start: '08:00', end: '18:00' },
];

const MOTIF_PRESETS = [
  'Session de travail',
  'Réunion / atelier',
  'Mission projet',
  'Formation',
  'Support technique',
];

const isoDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface SeatBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  workstation: Workstation;
  cluster: Cluster;
  user: UserProfile;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  purpose: string;
  notes: string;
  businessDays: number;
  requiresExtension: boolean;
  isSubmitting: boolean;
  validationError?: string;
  conflictAlternatives: { code: string; cluster_name: string }[];
  onSlotChange: (next: { startDate: string; endDate: string; startTime: string; endTime: string }) => void;
  onPurposeChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onConfirm: () => void;
}

export const SeatBookingModal: React.FC<SeatBookingModalProps> = ({
  isOpen,
  onClose,
  workstation,
  cluster,
  user,
  startDate,
  endDate,
  startTime,
  endTime,
  purpose,
  notes,
  businessDays,
  requiresExtension,
  isSubmitting,
  validationError,
  conflictAlternatives,
  onSlotChange,
  onPurposeChange,
  onNotesChange,
  onConfirm,
}) => {
  const matchesPreset = SLOT_PRESETS.some((s) => s.start === startTime && s.end === endTime);
  const [showCustom, setShowCustom] = useState<boolean>(!matchesPreset);

  // Escape closes, and the page behind stops scrolling while the dialog is up.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [isOpen, onClose]);

  /**
   * What the seat is actually free for on the chosen day, straight from the overlay.
   *
   * The overlay the parent loads covers the START date only. Over a multi-day range this answer is
   * therefore about the first day, and the caption below says so rather than implying the whole
   * span was checked - the server validates every day of the range on confirm, and answers with
   * the conflicting seat if one is taken.
   */
  const availability = useMemo(() => {
    const info = workstation.availability;
    if (workstation.status === 'maintenance') return { text: 'Poste en maintenance', tone: 'bad' as const };
    // A seat with no bookings at all carries no overlay, so fall back to its status rather than
    // showing nothing - the whole point of the dialog is to answer "is this free?" before booking.
    if (!info) {
      return workstation.status === 'disponible'
        ? { text: `Libre de ${startTime} à ${endTime}`, tone: 'good' as const }
        : { text: 'Occupé sur ce créneau', tone: 'bad' as const };
    }
    if (info.windowFree) return { text: `Libre de ${startTime} à ${endTime}`, tone: 'good' as const };
    if (info.gaps.length > 0) {
      return { text: `Occupé ${info.busy.map((b) => `${b.start}-${b.end}`).join(', ')}`, tone: 'warn' as const };
    }
    return { text: 'Occupé sur ce créneau', tone: 'bad' as const };
  }, [workstation, startTime, endTime]);

  if (!isOpen) return null;

  const slotActive = (s: { start: string; end: string }) => startTime === s.start && endTime === s.end;
  const isMultiDay = endDate && endDate !== startDate;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Réserver le poste ${workstation.code}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150"
      >
        <div className="sticky top-0 bg-slate-900 text-white px-5 py-4 flex items-center justify-between sm:rounded-t-2xl">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#00b050] flex items-center justify-center font-black text-sm border-2 border-white/30 shrink-0">
              {workstation.code.split('-')[2] || 'WS'}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black truncate">{workstation.code}</h3>
              <p className="text-[11px] text-slate-300 truncate">{cluster.name}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-white/10 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Identity is taken from the session - never typed. */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="w-8 h-8 rounded-full bg-[#008751] text-white flex items-center justify-center text-xs font-black shrink-0">
              {(user.full_name || '?').charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate">{user.full_name}</p>
              <p className="text-[11px] text-slate-500 truncate">{user.department}</p>
            </div>
          </div>

          {/* Du / Au.
              The quick "Aujourd'hui" / "Demain" buttons are gone. They only ever set both ends to
              the same day, which meant the one thing this dialog could not express was the booking
              the rest of the stack was already built for: validateReservationConstraints has taken
              a start and an end from the beginning, counts business days across them, and decides
              from that span whether the request needs extension approval. Two fields say what one
              field plus two shortcuts could not. */}
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-2">
              <CalendarDays className="w-3.5 h-3.5" /> Dates
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Du</span>
                <input
                  type="date"
                  value={startDate}
                  min={isoDay(0)}
                  onChange={(e) => {
                    const nextStart = e.target.value;
                    // A start dragged past the end would submit a backwards range that only the
                    // server would reject. Carry the end along instead of letting it go stale -
                    // same rule the hour selects below already follow.
                    const nextEnd = !endDate || endDate < nextStart ? nextStart : endDate;
                    onSlotChange({ startDate: nextStart, endDate: nextEnd, startTime, endTime });
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-700"
                  aria-label="Date de début"
                />
              </div>

              <span className="pb-2 text-xs text-slate-400 font-bold">→</span>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Au</span>
                <input
                  type="date"
                  value={endDate || startDate}
                  min={startDate}
                  onChange={(e) =>
                    onSlotChange({ startDate, endDate: e.target.value || startDate, startTime, endTime })
                  }
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-700"
                  aria-label="Date de fin"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-2">
              <Clock className="w-3.5 h-3.5" /> Créneau
            </label>
            <div className="flex flex-wrap gap-2">
              {SLOT_PRESETS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    setShowCustom(false);
                    onSlotChange({ startDate, endDate, startTime: s.start, endTime: s.end });
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    slotActive(s) && !showCustom
                      ? 'bg-[#008751] border-[#008751] text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {s.label}
                  <span className="block text-[10px] font-medium opacity-80">
                    {s.start} - {s.end}
                  </span>
                </button>
              ))}

              <button
                type="button"
                onClick={() => setShowCustom((v) => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  showCustom
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                Personnaliser
                <span className="block text-[10px] font-medium opacity-80">heure exacte</span>
              </button>
            </div>

            {showCustom && (
              <div className="mt-2 flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <select
                  value={startTime}
                  onChange={(e) => {
                    const nextStart = e.target.value;
                    // Keep the window coherent: a start pushed past the end would otherwise submit
                    // a negative duration that only the server would catch.
                    const nextEnd =
                      WORKING_HOURS_24H_SLOTS.indexOf(nextStart) >= WORKING_HOURS_24H_SLOTS.indexOf(endTime)
                        ? WORKING_HOURS_24H_SLOTS[
                            Math.min(
                              WORKING_HOURS_24H_SLOTS.indexOf(nextStart) + 1,
                              WORKING_HOURS_24H_SLOTS.length - 1
                            )
                          ]
                        : endTime;
                    onSlotChange({ startDate, endDate, startTime: nextStart, endTime: nextEnd });
                  }}
                  className="flex-1 bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800"
                  aria-label="Heure de début"
                >
                  {WORKING_HOURS_24H_SLOTS.slice(0, -1).map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>

                <span className="text-xs text-slate-400 font-bold">→</span>

                <select
                  value={endTime}
                  onChange={(e) =>
                    onSlotChange({ startDate, endDate, startTime, endTime: e.target.value })
                  }
                  className="flex-1 bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800"
                  aria-label="Heure de fin"
                >
                  {WORKING_HOURS_24H_SLOTS.filter(
                    (h) => WORKING_HOURS_24H_SLOTS.indexOf(h) > WORKING_HOURS_24H_SLOTS.indexOf(startTime)
                  ).map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {availability && (
            <div
              className={`px-3 py-2 rounded-xl text-xs font-bold border ${
                availability.tone === 'good'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : availability.tone === 'warn'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {availability.text}
              {isMultiDay && (
                <span className="block mt-0.5 font-medium opacity-80">
                  Disponibilité vérifiée pour le {startDate} - les autres jours sont contrôlés à la
                  confirmation.
                </span>
              )}
            </div>
          )}

          <div>
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-2 block">Motif</label>
            <div className="flex flex-wrap gap-2">
              {MOTIF_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onPurposeChange(purpose === m ? '' : m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    purpose === m
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            {!MOTIF_PRESETS.includes(purpose) && (
              <input
                type="text"
                value={purpose}
                onChange={(e) => onPurposeChange(e.target.value)}
                placeholder="Autre motif (optionnel)"
                className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800"
              />
            )}
          </div>

          <details className="group">
            <summary className="text-[11px] font-bold text-slate-500 cursor-pointer list-none hover:text-slate-700">
              + Notes complémentaires
            </summary>
            <input
              type="text"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800"
            />
          </details>

          {validationError && (
            <p className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-2.5 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              {validationError}
            </p>
          )}

          {conflictAlternatives.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-500">Autres postes libres :</span>
              {conflictAlternatives.map((alt) => (
                <span
                  key={alt.code}
                  className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold"
                >
                  {alt.code}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 py-3.5 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">
            {businessDays} jour{businessDays > 1 ? 's' : ''} ouvré{businessDays > 1 ? 's' : ''}
          </span>
          <button
            onClick={onConfirm}
            disabled={isSubmitting || !!validationError}
            className={`px-5 py-2.5 rounded-xl text-xs font-extrabold shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
              requiresExtension
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : 'bg-[#00b050] hover:bg-[#009040] text-white'
            }`}
          >
            {isSubmitting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : requiresExtension ? (
              <Sparkles className="w-4 h-4" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {requiresExtension ? "Demander l'extension" : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
};
