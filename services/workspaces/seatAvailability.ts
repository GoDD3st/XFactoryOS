import { Reservation, SeatStatus } from '@/frontend/src/types';

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
  status: Extract<SeatStatus, 'disponible' | 'partiel' | 'réservé' | 'occupé'>;
  /** Whether the requested window is bookable as-is. */
  windowFree: boolean;
  /** Someone is physically checked in for the requested window. */
  checkedIn: boolean;
}

/**
 * Derives the overlay for one seat.
 *
 * 'réservé' is deliberately reserved (no pun intended) for seats taken the entire business day - 
 * those are the ones where queuing for a no-show is the only way in. A seat booked 08:00-09:00 is
 * 'partiel': still clickable, because the rest of the day is genuinely bookable.
 *
 * DELIBERATELY has no notion of "recently released". Hours given back by an early check-out are
 * NOT a public slot: they never become bookable ahead of the normal reservation rules, and the
 * only person who may claim them is the holder of the next reservation on this same desk, via the
 * explicit offer in services/reservations/earlyExtensionService.ts. A status here that advertised
 * freed time to the whole floor would re-open exactly the loophole that workflow exists to close.
 */
export function deriveSeatAvailability(
  reservations: Reservation[],
  date: string,
  windowStart: string,
  windowEnd: string,
  businessStartHHMM: string = DEFAULT_BUSINESS_START,
  businessEndHHMM: string = DEFAULT_BUSINESS_END
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

  let status: SeatAvailability['status'];
  if (intervals.length === 0) status = 'disponible';
  else if (checkedIn) status = 'occupé';
  else if (gaps.length === 0) status = 'réservé';
  else status = 'partiel';

  return { intervals, gaps, status, windowFree, checkedIn };
}

/** "08:00 - 09:00, 14:00 - 16:00" for tooltips. */
export function formatIntervals(intervals: Interval[]): string {
  return intervals.map((i) => `${toHHMM(i.start)} - ${toHHMM(i.end)}`).join(', ');
}
