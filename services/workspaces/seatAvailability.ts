import { Reservation, SeatStatus } from '@/frontend/src/types';
import { siteClockAt, SiteClock } from '@/services/time/siteTime';

/**
 * Time-window availability for a single seat on a single day.
 *
 * The seat overlay used to be a flat "does any active reservation mention this seat" lookup, with
 * no date and no time comparison at all - so booking 08:00-09:00 painted the seat red on every
 * date forever, and a second booking on the same seat silently replaced the first in the map.
 * Everything here works in minutes-from-midnight on one calendar day, which is all the seat grid
 * ever needs to answer: is this seat free for the window I asked for, and if not, is it taken for
 * the whole day or only part of it?
 */

/** Half-open interval [start, end) in minutes from midnight. */
export interface Interval {
  start: number;
  end: number;
}

export const DEFAULT_BUSINESS_START = '08:00';
export const DEFAULT_BUSINESS_END = '18:00';

/** Reservation statuses that actually hold a seat. A cancelled or no-show booking frees it. */
/** Statuses that actually hold a seat. Exported so callers deciding "is this booking
 * live?" cannot drift from the occupancy calculation that colours the grid. */
export const HOLDING_STATUSES = new Set(['confirmée', 'check-in', 'en attente']);

/**
 * Statuses that mean a desk was handed back BEFORE its slot was over.
 *
 * 'rejetée' sits with 'annulée' because a refused pending booking frees a slot nobody ever used,
 * exactly like a cancellation.
 *
 * 'no-show' is deliberately absent. Nobody released that desk - the booking expired unclaimed,
 * and the no-show sweep already hands it to the waiting list. Adding it here is a one-line change
 * if the site decides an expired booking should also be grabbable without lead time.
 *
 * 'terminée' is deliberately absent too, but only because it cannot be judged by status alone: it
 * covers BOTH leaving early and the automatic check-out that runs after the end time, and only
 * the first frees anything. releasedIntervalOnDate() reads check_out_at to tell them apart.
 */
export const CANCELLING_STATUSES = new Set(['annulée', 'rejetée']);

/** Freed time is offered from the next whole 5 minutes, so nobody has to type 11:37. */
const RELEASE_START_STEP = 5;

function roundUpToStep(minutes: number, step: number = RELEASE_START_STEP): number {
  if (!Number.isFinite(minutes)) return minutes;
  return Math.ceil(minutes / step) * step;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = (hhmm || '').split(':');
  const hours = Number(h);
  const mins = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return NaN;
  return hours * 60 + mins;
}

export function toHHMM(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Merges overlapping/adjacent intervals so gap detection doesn't see false gaps between them. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const valid = intervals
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .sort((a, b) => a.start - b.start);

  const merged: Interval[] = [];
  for (const cur of valid) {
    const last = merged[merged.length - 1];
    if (last && cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

/**
 * The slice of `date` a reservation occupies, accounting for multi-day bookings: the first day
 * runs from its start time to close, middle days are fully occupied, and the last day runs from
 * open to its end time. Returns null when the reservation doesn't touch `date` at all.
 */
export function reservationIntervalOnDate(
  reservation: Reservation,
  date: string,
  businessStart: number,
  businessEnd: number
): Interval | null {
  const first = reservation.reservation_date;
  const last = reservation.end_date || reservation.reservation_date;
  if (!first || date < first || date > last) return null;

  const isFirstDay = date === first;
  const isLastDay = date === last;

  const start = isFirstDay ? toMinutes(reservation.start_time) : businessStart;
  const end = isLastDay ? toMinutes(reservation.end_time) : businessEnd;

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

/**
 * The stretch of `date` a booking gave back by ending early, or null when it gave back nothing.
 *
 * A cancelled or rejected booking frees its whole slice of the day - it was never used. An early
 * check-out frees only what was left after the person walked out, which is why check_out_at is
 * read rather than trusted to equal the booking's end: the automatic sweep also writes 'terminée',
 * but it runs AFTER the end time, so the arithmetic below returns null for it without needing to
 * know which code path wrote the row.
 *
 * `floor` clips the result to what is still ahead (site-local minutes when `date` is today, null
 * otherwise). Offering hours that have already passed would let someone book a window whose
 * check-in deadline is behind them - the booking would be marked a no-show before they sat down.
 */
export function releasedIntervalOnDate(
  reservation: Reservation,
  date: string,
  businessStart: number,
  businessEnd: number,
  floor: number | null
): Interval | null {
  const base = reservationIntervalOnDate(reservation, date, businessStart, businessEnd);
  if (!base) return null;

  let freed: Interval | null = null;

  if (CANCELLING_STATUSES.has(reservation.status)) {
    freed = { start: base.start, end: base.end };
  } else if (reservation.status === 'terminée' && reservation.check_out_at) {
    const out = siteClockAt(new Date(reservation.check_out_at));
    // Checked out on a later day than this one: every hour of THIS day was actually used.
    if (!out.date || out.date > date) return null;
    const from = out.date === date ? Math.max(base.start, out.minutes) : base.start;
    freed = { start: from, end: base.end };
  }

  if (!freed) return null;
  if (floor !== null) freed = { start: Math.max(freed.start, floor), end: freed.end };

  // Rounded up, never down: the offer may be smaller than what was freed, never larger. It also
  // spares whoever takes it from transcribing the minute somebody happened to walk out on.
  freed = { start: roundUpToStep(freed.start), end: freed.end };
  return freed.end > freed.start ? freed : null;
}

/** Merged occupied intervals on `date` for the given reservations (already scoped to one seat). */
export function occupiedIntervalsOnDate(
  reservations: Reservation[],
  date: string,
  businessStart: number,
  businessEnd: number
): Interval[] {
  const raw: Interval[] = [];
  for (const r of reservations) {
    if (!HOLDING_STATUSES.has(r.status)) continue;
    const interval = reservationIntervalOnDate(r, date, businessStart, businessEnd);
    if (interval) raw.push(interval);
  }
  return mergeIntervals(raw);
}

/** True when nothing occupied overlaps [start, end). Touching endpoints do not overlap. */
export function isWindowFree(intervals: Interval[], start: number, end: number): boolean {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  return !intervals.some((i) => start < i.end && end > i.start);
}

/** The still-bookable stretches inside the business day. */
export function freeGaps(intervals: Interval[], businessStart: number, businessEnd: number): Interval[] {
  const gaps: Interval[] = [];
  let cursor = businessStart;

  for (const i of intervals) {
    const from = Math.max(i.start, businessStart);
    const to = Math.min(i.end, businessEnd);
    if (to <= from) continue;
    if (from > cursor) gaps.push({ start: cursor, end: from });
    cursor = Math.max(cursor, to);
  }

  if (cursor < businessEnd) gaps.push({ start: cursor, end: businessEnd });
  return gaps;
}

/** True when the occupied intervals leave no bookable gap in the business day. */
export function coversWholeDay(intervals: Interval[], businessStart: number, businessEnd: number): boolean {
  return freeGaps(intervals, businessStart, businessEnd).length === 0;
}

export interface SeatAvailability {
  /** Merged occupied intervals for the day. */
  intervals: Interval[];
  /** Bookable stretches left in the business day. */
  gaps: Interval[];
  /** Overlay status: 'réservé' only when the whole day is taken, 'partiel' when gaps remain. */
  status: Extract<SeatStatus, 'disponible' | 'partiel' | 'réservé' | 'occupé' | 'libéré'>;
  /** Whether the requested window is bookable as-is. */
  windowFree: boolean;
  /** Someone is physically checked in for the requested window. */
  checkedIn: boolean;
  /** Stretches handed back early that are still ahead. Empty unless a ReleaseContext is given. */
  released: Interval[];
  /** The requested window sits inside one of them, so the lead-time rule is waived for it. */
  windowReleased: boolean;
}

/**
 * What the release overlay needs to know about real time and the lead-time rule.
 *
 * Both are passed in rather than read here: this module is pure arithmetic over one seat and one
 * day, and the booking window is an admin setting that must be read live (the site can change the
 * 48h at any moment) instead of being frozen into a constant.
 */
export interface ReleaseContext {
  /** The site's own clock, from siteClockAt(). */
  now: SiteClock;
  /**
   * The first date a booking may normally start - today + settings.bookingWindowDays.
   *
   * Freed time from that date onward is NOT flagged: it books the ordinary way, so calling it out
   * would be noise. The status exists to mark the one case the ordinary rules cannot serve - a
   * desk freed inside the lead time, which nobody could otherwise take.
   */
  earliestNormalDate: string;
}

/**
 * Derives the overlay for one seat.
 *
 * 'réservé' is deliberately reserved (no pun intended) for seats taken the entire business day - 
 * those are the ones where queuing for a no-show is the only way in. A seat booked 08:00-09:00 is
 * 'partiel': still clickable, because the rest of the day is genuinely bookable.
 *
 * 'libéré' overrides whatever the live bookings say when the seat has time handed back early and
 * the asked window is free. It has to override rather than blend in, because those hours are the
 * only ones inside the lead time anybody can book: to the occupancy maths a cancelled booking is
 * simply absent, so without this the desk would read 'disponible' - indistinguishable from the
 * desk next to it that looks just as free and cannot be booked at all before the 48h are up.
 */
export function deriveSeatAvailability(
  reservations: Reservation[],
  date: string,
  windowStart: string,
  windowEnd: string,
  businessStartHHMM: string = DEFAULT_BUSINESS_START,
  businessEndHHMM: string = DEFAULT_BUSINESS_END,
  release?: ReleaseContext
): SeatAvailability {
  const businessStart = toMinutes(businessStartHHMM);
  const businessEnd = toMinutes(businessEndHHMM);

  const intervals = occupiedIntervalsOnDate(reservations, date, businessStart, businessEnd);
  const gaps = freeGaps(intervals, businessStart, businessEnd);

  const wStart = toMinutes(windowStart);
  const wEnd = toMinutes(windowEnd);
  const windowFree = isWindowFree(intervals, wStart, wEnd);

  // A check-in only reads as "occupé" when it actually overlaps the window being viewed - 
  // otherwise a morning check-in would paint the seat occupied for an afternoon search.
  const checkedIn = reservations.some((r) => {
    if (r.status !== 'check-in') return false;
    const i = reservationIntervalOnDate(r, date, businessStart, businessEnd);
    return !!i && wStart < i.end && wEnd > i.start;
  });

  // Time given back early, and still ahead. Skipped entirely for dates the ordinary rules already
  // reach, and for a day already over at the site.
  let released: Interval[] = [];
  if (release && date < release.earliestNormalDate && date >= release.now.date) {
    const floor = date === release.now.date ? release.now.minutes : null;
    released = mergeIntervals(
      reservations
        .map((r) => releasedIntervalOnDate(r, date, businessStart, businessEnd, floor))
        .filter((i): i is Interval => i !== null)
    );
    // Hours freed by one booking and taken by another are not free at all. Subtracting the live
    // occupancy keeps the offer honest: a desk cancelled 08:00-18:00 and rebooked 10:00-12:00
    // advertises 08:00-10:00 and 12:00-18:00, not the whole day.
    released = released.flatMap((r) =>
      freeGaps(intervals, r.start, r.end).filter((g) => g.end > g.start)
    );
  }

  const windowReleased =
    windowFree && released.some((r) => wStart >= r.start && wEnd <= r.end);

  let status: SeatAvailability['status'];
  if (intervals.length === 0) status = 'disponible';
  else if (checkedIn) status = 'occupé';
  else if (gaps.length === 0) status = 'réservé';
  else status = 'partiel';

  if (windowFree && released.length > 0) status = 'libéré';

  return { intervals, gaps, status, windowFree, checkedIn, released, windowReleased };
}

/** "08:00 - 09:00, 14:00 - 16:00" for tooltips. */
export function formatIntervals(intervals: Interval[]): string {
  return intervals.map((i) => `${toHHMM(i.start)} - ${toHHMM(i.end)}`).join(', ');
}
