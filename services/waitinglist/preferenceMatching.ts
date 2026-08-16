import { WaitingListEntry, WaitingListPreferences, WorkstationMetadata } from '@/frontend/src/types';

/**
 * BPMN D5 "Moteur matching - Vérifier compatibilité préférence" and the GWMATCH gate that
 * follows it.
 *
 * The queue used to be FIFO and nothing else: the first waiting entry for the right date was
 * offered whatever desk had just been freed. D5 requires the freed desk to be checked against
 * what the person actually asked for first - "cluster, zone, periode, equipement futur" - and
 * routes an incompatible desk back to WAITING rather than burning the offer on it.
 *
 * Everything here is pure. Loading the entry, the seat and the settings is the caller's job, so
 * the rules can be read (and reasoned about) without a database.
 */

/** Minutes past midnight for "HH:mm". Returns NaN for anything unparseable. */
function toMinutes(hhmm: string): number {
  const m = hhmm?.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

function fromMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export interface TimeWindow {
  start: string; // HH:mm
  end: string; // HH:mm
}

/**
 * Parses "08:30 - 17:30" into its two ends, defaulting to a full business day.
 *
 * Mirrors the identical helper in waitingListRepository - entries carry the window as this one
 * display string, so both the write and the match path have to read it the same way.
 */
export function parseTimeSlot(timeSlot?: string): TimeWindow {
  const match = timeSlot?.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  return match ? { start: match[1], end: match[2] } : { start: '08:00', end: '18:00' };
}

/** The overlap between two windows, or null when they don't overlap at all. */
export function intersectWindows(a: TimeWindow, b: TimeWindow): TimeWindow | null {
  const start = Math.max(toMinutes(a.start), toMinutes(b.start));
  const end = Math.min(toMinutes(a.end), toMinutes(b.end));
  if (Number.isNaN(start) || Number.isNaN(end) || start >= end) return null;
  return { start: fromMinutes(start), end: fromMinutes(end) };
}

export function windowMinutes(w: TimeWindow): number {
  return toMinutes(w.end) - toMinutes(w.start);
}

/** The desk that just came free, described in the terms the queue is matched against. */
export interface FreedSeat {
  workstationId: string;
  /** Cluster CODE ("CL-A"), already resolved - entries store the code, not the uuid. */
  clusterCode?: string;
  /** YYYY-MM-DD, local. */
  date: string;
  /** The hours the desk is actually free for - not the whole day. */
  window: TimeWindow;
  attributes?: WorkstationMetadata;
}

export type MatchRejection = 'status' | 'date' | 'seat' | 'cluster' | 'window' | 'attributes';

export interface MatchResult {
  compatible: boolean;
  /** Why this entry was passed over. Present iff `compatible` is false. */
  rejection?: MatchRejection;
  /**
   * The window the offer is actually good for: the entry's requested hours ∩ the desk's free
   * hours. This is what the reservation must be created for - see acceptOffer.
   */
  grantedWindow?: TimeWindow;
  /** Preference keys the desk failed to satisfy, for the rejection notice and for audit. */
  unmetPreferences?: (keyof WaitingListPreferences)[];
}

/** Human-readable labels for the preference flags, used in notification copy. */
export const PREFERENCE_LABELS: Record<keyof WaitingListPreferences, string> = {
  nearWindow: 'près d’une fenêtre',
  isPMR: 'accessible PMR',
  isQuietZone: 'en zone calme',
};

/**
 * Which requested preferences this desk fails to satisfy.
 *
 * Only `true` is a constraint. A preference left undefined or false means "no opinion", not
 * "must not have it" - someone who didn't ask for a quiet desk is happy to be given one.
 */
export function unmetPreferences(
  prefs: WaitingListPreferences | undefined,
  attributes: WorkstationMetadata | undefined
): (keyof WaitingListPreferences)[] {
  if (!prefs) return [];
  const unmet: (keyof WaitingListPreferences)[] = [];
  if (prefs.nearWindow && !attributes?.near_window) unmet.push('nearWindow');
  if (prefs.isPMR && !attributes?.is_pmr) unmet.push('isPMR');
  if (prefs.isQuietZone && !attributes?.is_quiet_zone) unmet.push('isQuietZone');
  return unmet;
}

/**
 * The GWMATCH decision for one entry against one freed desk.
 *
 * `minOfferMinutes` comes from settings.minReservationMinutes: an overlap shorter than the
 * shortest bookable reservation cannot be turned into one, so offering it would only burn the
 * offer window and push the entry to EXPIRED for nothing.
 */
export function matchEntryToFreedSeat(
  entry: WaitingListEntry,
  freed: FreedSeat,
  minOfferMinutes = 30
): MatchResult {
  if (entry.status !== 'waiting') return { compatible: false, rejection: 'status' };
  if (entry.reservation_date !== freed.date) return { compatible: false, rejection: 'date' };

  // Seat-specific entries are bound to their desk; cluster-wide entries must not be handed a
  // desk outside the cluster they named. An entry with neither is happy anywhere.
  if (entry.requested_workstation_id) {
    if (entry.requested_workstation_id !== freed.workstationId) {
      return { compatible: false, rejection: 'seat' };
    }
  } else if (entry.cluster_preference && entry.cluster_preference !== freed.clusterCode) {
    return { compatible: false, rejection: 'cluster' };
  }

  // "periode" - the desk is free for a window, not for the day. Someone queued 08:00 - 12:00 must
  // not be offered a desk that only frees up at 14:00.
  const granted = intersectWindows(parseTimeSlot(entry.time_slot), freed.window);
  if (!granted || windowMinutes(granted) < minOfferMinutes) {
    return { compatible: false, rejection: 'window' };
  }

  // "zone / equipement" - every attribute the person asked for has to be present on this desk.
  const unmet = unmetPreferences(entry.preferences, freed.attributes);
  if (unmet.length > 0) {
    return { compatible: false, rejection: 'attributes', unmetPreferences: unmet };
  }

  return { compatible: true, grantedWindow: granted };
}

/**
 * Walks the queue in FIFO order and returns the first entry the freed desk actually suits.
 *
 * Seat-first, as before: someone who queued for THIS exact desk outranks someone waiting on the
 * cluster generally, because a desk booked for the whole day has no other route in. Within each
 * group the order is whatever `entries` arrives in, which the repository sorts by fifo_rank.
 *
 * Entries the desk doesn't suit are skipped, not resolved - they stay WAITING for a desk that
 * does (BPMN D5 GWMATCH "NON" → WAIT).
 */
export function selectNextCompatibleEntry(
  entries: WaitingListEntry[],
  freed: FreedSeat,
  minOfferMinutes = 30
): { entry: WaitingListEntry; grantedWindow: TimeWindow } | null {
  const evaluate = (candidates: WaitingListEntry[]) => {
    for (const entry of candidates) {
      const result = matchEntryToFreedSeat(entry, freed, minOfferMinutes);
      if (result.compatible && result.grantedWindow) {
        return { entry, grantedWindow: result.grantedWindow };
      }
    }
    return null;
  };

  const seatSpecific = entries.filter((e) => e.requested_workstation_id === freed.workstationId);
  const clusterWide = entries.filter((e) => !e.requested_workstation_id);

  return evaluate(seatSpecific) || evaluate(clusterWide);
}
