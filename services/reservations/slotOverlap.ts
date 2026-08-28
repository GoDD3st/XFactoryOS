import { Reservation } from '@/frontend/src/types';
import {
  DEFAULT_BUSINESS_START,
  DEFAULT_BUSINESS_END,
  HOLDING_STATUSES,
  reservationIntervalOnDate,
  toMinutes,
} from '@/services/workspaces/seatAvailability';

/**
 * One person, one desk at a time.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * Nobody sits at two desks at once, so nobody may hold two reservations that overlap in time -
 * on the same desk or on any other. Booking WS-A from 08:00 to 10:00 puts the whole 08:00-10:00
 * window out of reach; 10:00 onwards is free again, on that desk or another.
 *
 * This is a physical impossibility rather than a planning policy, which is why - unlike the lead
 * time, the weekend rule or the quotas - it is NOT waived for the bypass roles. A director cannot
 * be in two chairs any more than a collaborator can.
 *
 * The comparison is half-open on both sides: a booking ending at 10:00 and one starting at 10:00
 * do not overlap. Back-to-back slots are exactly what a desk change looks like, and refusing them
 * would make the rule punish the behaviour it is meant to allow.
 *
 * Compared DAY BY DAY, not as one instant range, because that is what a multi-day booking means
 * here: the first day runs from its start time to close, whole days in between, and the last day
 * from open to its end time (reservationIntervalOnDate). Comparing raw instants would count the
 * overnight hours as held and refuse an early booking the following morning.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

export interface RequestedSlot {
  startDate: string;
  /** Absent or equal to startDate for a single-day booking. */
  endDate?: string;
  startTime: string;
  endTime: string;
}

export interface SlotClashOptions {
  /** The reservation being MODIFIED, so a booking never collides with itself. Omit on create. */
  excludeReservationId?: string;
  businessStart?: string;
  businessEnd?: string;
}

/** A span this long is a data error, not a booking - bounded so a bad end_date cannot spin here. */
const MAX_SPAN_DAYS = 90;

/** Every calendar day a span touches, first and last included. */
function daysInSpan(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(cursor.getTime())) return days;

  const pad = (n: number) => String(n).padStart(2, '0');
  for (let i = 0; i < MAX_SPAN_DAYS; i++) {
    const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
    days.push(key);
    if (key >= endDate) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * The caller's own reservation that collides with `requested`, or null when the slot is free of
 * their other bookings.
 *
 * `ownReservations` must already be scoped to one person - this function does not read user ids,
 * so handing it someone else's bookings would refuse a booking for the wrong reason. Only
 * HOLDING_STATUSES count: a cancelled booking holds nothing, and a booking already checked out of
 * has ended, so the person is free to sit elsewhere for the hours they gave back.
 *
 * Returns the offending reservation rather than a boolean so the message can name the desk and
 * the hours - "you already have WS-A from 08:00 to 10:00" is actionable in a way that "conflict"
 * is not.
 */
export function findOwnSlotClash(
  ownReservations: Reservation[],
  requested: RequestedSlot,
  options?: SlotClashOptions
): Reservation | null {
  const { startDate, startTime, endTime } = requested;
  if (!startDate || !startTime || !endTime) return null;

  const businessStart = toMinutes(options?.businessStart || DEFAULT_BUSINESS_START);
  const businessEnd = toMinutes(options?.businessEnd || DEFAULT_BUSINESS_END);

  const lastDate =
    requested.endDate && requested.endDate > startDate ? requested.endDate : startDate;

  // The request read the same way a stored booking is read, so one function decides what "the
  // hours held on a given day" means for both sides of the comparison.
  const asReservation = {
    reservation_date: startDate,
    end_date: lastDate,
    start_time: startTime,
    end_time: endTime,
    status: 'confirmée',
  } as Reservation;

  const days = daysInSpan(startDate, lastDate);

  for (const existing of ownReservations) {
    if (options?.excludeReservationId && existing.id === options.excludeReservationId) continue;
    if (!HOLDING_STATUSES.has(existing.status)) continue;

    for (const day of days) {
      const wanted = reservationIntervalOnDate(asReservation, day, businessStart, businessEnd);
      const held = reservationIntervalOnDate(existing, day, businessStart, businessEnd);
      if (!wanted || !held) continue;
      if (wanted.start < held.end && wanted.end > held.start) return existing;
    }
  }

  return null;
}

/** ISO day to the format the rest of the interface speaks: 28/08/2026. */
function frDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR');
}

/** The refusal, worded so the reader knows both what blocks them and what to do instead. */
export function describeSlotClash(clash: Reservation): string {
  const sameDay = !clash.end_date || clash.end_date === clash.reservation_date;

  // On a multi-day booking the two times belong to different days, so pairing them as "de 14:00 à
  // 10:00" would read as a nonsense window. Each end is stated with the day it belongs to.
  const held = sameDay
    ? `le ${frDate(clash.reservation_date)} de ${clash.start_time} à ${clash.end_time}`
    : `du ${frDate(clash.reservation_date)} à ${clash.start_time} au ${frDate(clash.end_date)} à ${clash.end_time}`;

  return (
    `Vous avez déjà le poste ${clash.workstation_code} réservé ${held}. Un collaborateur ne peut ` +
    `occuper qu'un seul poste à la fois : choisissez un créneau après cette réservation, ou ` +
    `annulez-la.`
  );
}
