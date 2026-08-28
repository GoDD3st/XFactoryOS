import { Reservation, UserRole } from '@/frontend/src/types';
import { ReservationRepository } from '@/database/repositories/reservationRepository';
import { SettingsRepository } from '@/database/repositories/settingsRepository';
import { ReservationService } from './reservationService';
import { buildOffer } from './earlyExtensionService';
import {
  HOLDING_STATUSES,
  occupiedIntervalsOnDate,
  toMinutes,
  toHHMM,
  DEFAULT_BUSINESS_START,
  DEFAULT_BUSINESS_END,
} from '@/services/workspaces/seatAvailability';
import { siteClockAt } from '@/services/time/siteTime';
import { getAdminClient } from '@/database/serverClient';
import { supabase } from '@/database/client';

/**
 * Booking a free desk on the spot, by scanning its QR badge.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE RULE, AND HOW IT COEXISTS WITH THE LEAD TIME
 *
 * Someone standing at an empty desk may take it there and then: the badge is scanned, the site
 * shows how long the desk is free for, and they book that stretch. The booking starts NOW and ends
 * at the next reservation on that desk, or at close of business - whichever comes first.
 *
 * This is the ONE sanctioned exception to settings.bookingWindowDays (the "48h" rule), and it is
 * narrow by construction rather than by promise:
 *
 *   - it requires a valid desk badge, which is only obtainable by being at the desk. The exemption
 *     is granted by the SERVER on this path alone; POST /api/reservations cannot ask for it, so no
 *     amount of crafting a request body reaches it;
 *   - it can only ever produce a booking that starts now, today, on the scanned desk. It cannot
 *     reserve tomorrow, cannot reserve a different desk, and cannot reserve a future window;
 *   - it ends where the next booking begins, so it never eats into anyone's reservation.
 *
 * The lead time governs PLANNING - it exists so the site can be organised in advance, and taking a
 * chair that is empty right now plans nothing. Everything else still applies: conflicts, quotas,
 * business hours, the one-desk-at-a-time rule, and BR-07 on restricted desks.
 *
 * WHAT IT DELIBERATELY WILL NOT TAKE: hours freed by an early check-out while the next holder's
 * extension offer stands. Those belong to that person and to nobody else (see
 * earlyExtensionService.ts) - if a passer-by could scan the desk and take them, the rule would be
 * a formality. The desk stays empty until either that holder accepts, or their reservation begins.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/** What a scan of a free desk offers. Times are the site's wall clock. */
export interface WalkInWindow {
  workstationId: string;
  workstationCode: string;
  clusterName: string;
  date: string;
  /** Now, in practice: a walk-in cannot start later than the moment it is made. */
  start: string;
  /** The next reservation's start on this desk, or close of business. */
  end: string;
  /** Why `end` is what it is, so the screen can say so instead of showing a bare time. */
  endReason: 'next_reservation' | 'business_close';
  availableMinutes: number;
  /** Shortest bookable stretch, from settings - the interface uses it to bound its choices. */
  minMinutes: number;
}

/**
 * Either a bookable window or the reason there is none - one shape rather than a discriminated
 * union, because this project compiles without `strict` and a boolean discriminant does not narrow
 * reliably there. `window` is present exactly when `available` is true.
 */
export interface WalkInAvailability {
  available: boolean;
  window?: WalkInWindow;
  message?: string;
}

/** The site facts the window computation needs, so it can be exercised without a database. */
export interface WalkInContext {
  now: { date: string; minutes: number };
  businessStart: number;
  businessEnd: number;
  minMinutes: number;
  /** Who is asking - the holder of the next booking is not blocked by their own extension offer. */
  userId: string;
}

/**
 * How long is a desk free for, starting now, given its day?
 *
 * Pure: the desk's reservations and the clock in, a window or a reason out. The DESK's own state
 * (maintenance, VIP lock) is checked by the caller before this is reached, because those are facts
 * about the workstation rather than about its timeline.
 *
 * The window ends at whichever comes first: the next reservation's start, or close of business.
 * That is the whole rule - a walk-in is the gap in front of you and nothing more, so it can never
 * eat into a booking somebody already holds.
 *
 * Two refusals matter more than the others:
 *   - a desk occupied right now is not free, however briefly the occupant has stepped away;
 *   - hours freed by an early check-out are NOT offered here while the next holder's extension
 *     offer stands (see earlyExtensionService.ts). Letting a passer-by scan the badge and take
 *     them would make that rule a formality, so the desk deliberately stays empty until either
 *     that holder accepts or their own reservation begins.
 */
export function walkInWindowFrom(
  reservations: Reservation[],
  context: WalkInContext
): { available: boolean; start?: number; end?: number; endReason?: WalkInWindow['endReason']; message?: string } {
  const { now, businessStart, businessEnd, minMinutes, userId } = context;

  if (now.minutes >= businessEnd) {
    return { available: false, message: `L'Open Space ferme à ${toHHMM(businessEnd)}.` };
  }

  const from = Math.max(now.minutes, businessStart);
  const occupied = occupiedIntervalsOnDate(reservations, now.date, businessStart, businessEnd);

  const covering = occupied.find((i) => i.start <= from && i.end > from);
  if (covering) {
    return { available: false, message: `Ce poste est occupé jusqu'à ${toHHMM(covering.end)}.` };
  }

  const nextStart = occupied
    .map((i) => i.start)
    .filter((start) => start > from)
    .sort((a, b) => a - b)[0];

  const end = Math.min(nextStart === undefined ? businessEnd : nextStart, businessEnd);
  const endReason: WalkInWindow['endReason'] =
    nextStart !== undefined && nextStart <= businessEnd ? 'next_reservation' : 'business_close';

  const next = reservations
    .filter((r) => HOLDING_STATUSES.has(r.status) && toMinutes(r.start_time) > now.minutes)
    .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time))[0];

  if (next && next.user_id !== userId && buildOffer(next, reservations, now) !== null) {
    return {
      available: false,
      message:
        "Ce poste vient d'être libéré avant la fin d'une réservation. Ces heures sont proposées " +
        'en priorité au collaborateur qui occupe le créneau suivant.',
    };
  }

  if (end - from < minMinutes) {
    return {
      available: false,
      message: `Il reste moins de ${minMinutes} minutes libres sur ce poste (jusqu'à ${toHHMM(end)}).`,
    };
  }

  return { available: true, start: from, end, endReason };
}

export class WalkInService {
  /**
   * How long is this desk free for, starting now?
   *
   * Returns a refusal rather than a window whenever the desk cannot be taken, with a message that
   * describes the DESK and never its occupant - the badge is public, so an answer naming who is
   * sitting there would turn every sticker in the building into a directory.
   */
  static async availability(workstationId: string, userId: string): Promise<WalkInAvailability> {
    const db = getAdminClient() || supabase;

    const { data: seat } = await db
      .from('workstations')
      .select('id, code, status, reservable, clusters(name)')
      .eq('id', workstationId)
      .maybeSingle();

    if (!seat) return { available: false, message: 'Poste introuvable.' };
    if (seat.status === 'maintenance' || seat.status === 'disabled') {
      return { available: false, message: `Ce poste est indisponible (${seat.status}).` };
    }
    // Management-locked desks are not walk-in territory: BR-07 decides who may sit there through
    // an allowlist, and a QR scan proves presence, not entitlement.
    if (!seat.reservable) {
      return { available: false, message: 'Ce poste est réservé à un accès Direction/VIP.' };
    }

    const settings = await SettingsRepository.getSettings();
    const businessStart = toMinutes(settings.workingHoursStart || DEFAULT_BUSINESS_START);
    const businessEnd = toMinutes(settings.workingHoursEnd || DEFAULT_BUSINESS_END);
    const minMinutes = settings.minReservationMinutes || 30;

    const now = siteClockAt();
    const reservations = await ReservationRepository.getSeatReservationsOnDate(workstationId, now.date);

    const verdict = walkInWindowFrom(reservations, {
      now,
      businessStart,
      businessEnd,
      minMinutes,
      userId,
    });

    if (!verdict.available || verdict.start === undefined || verdict.end === undefined) {
      return { available: false, message: verdict.message };
    }

    return {
      available: true,
      window: {
        workstationId,
        workstationCode: seat.code,
        clusterName: (seat as any).clusters?.name || '',
        date: now.date,
        start: toHHMM(verdict.start),
        end: toHHMM(verdict.end),
        endReason: verdict.endReason!,
        availableMinutes: verdict.end - verdict.start,
        minMinutes,
      },
    };
  }

  /**
   * Creates the walk-in booking.
   *
   * The window is recomputed here from the database and the clock; the only thing taken from the
   * caller is how EARLY they want to finish, and even that is bounded by what was recomputed. A
   * request asking to end later than the desk is free, or sooner than the minimum duration, is
   * refused rather than trimmed - silently giving somebody different hours than they asked for is
   * worse than telling them no.
   *
   * `walkIn: true` is what waives the lead time inside ReservationService.createReservation. It is
   * set HERE, on a path that has already verified a scanned badge, and is never read from a request
   * body. Every other rule in that method still runs.
   */
  static async book(
    workstationId: string,
    user: { id: string; name?: string; department?: string; role?: UserRole },
    requestedEnd?: string
  ): Promise<{ ok: boolean; message?: string; reservation?: Reservation }> {
    const availability = await this.availability(workstationId, user.id);
    if (!availability.available || !availability.window) {
      return { ok: false, message: availability.message };
    }

    const window = availability.window;
    const start = toMinutes(window.start);
    const maxEnd = toMinutes(window.end);
    const end = requestedEnd ? toMinutes(requestedEnd) : maxEnd;

    if (!Number.isFinite(end) || end > maxEnd) {
      return { ok: false, message: `Ce poste n'est libre que jusqu'à ${window.end}.` };
    }
    if (end - start < window.minMinutes) {
      return { ok: false, message: `La durée minimale d'une réservation est de ${window.minMinutes} minutes.` };
    }

    const db = getAdminClient() || supabase;
    const { data: seat } = await db
      .from('workstations')
      .select('code, cluster_id, clusters(name)')
      .eq('id', workstationId)
      .maybeSingle();

    try {
      const reservation = await ReservationService.createReservation(
        {
          user_id: user.id,
          user_name: user.name,
          user_department: user.department,
          workstation_id: workstationId,
          workstation_code: seat?.code || window.workstationCode,
          cluster_id: (seat as any)?.cluster_id,
          cluster_name: (seat as any)?.clusters?.name || window.clusterName,
          reservation_date: window.date,
          end_date: window.date,
          start_time: window.start,
          end_time: toHHMM(end),
          purpose: 'Réservation sur place (QR)',
          status: 'confirmée',
        },
        user.role,
        undefined,
        { walkIn: true }
      );

      return { ok: true, reservation };
    } catch (err: any) {
      return { ok: false, message: err?.message || 'Échec de la réservation sur place.' };
    }
  }
}
