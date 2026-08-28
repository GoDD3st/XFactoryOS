import { Reservation } from '@/frontend/src/types';
import { ReservationRepository } from '@/database/repositories/reservationRepository';
import { logAuditEvent } from '../audit/auditService';
import { sendNotification } from '../notifications/notificationService';
import { HOLDING_STATUSES, toMinutes, toHHMM } from '@/services/workspaces/seatAvailability';
import { siteClockAt } from '@/services/time/siteTime';
import { findOwnSlotClash, describeSlotClash } from './slotOverlap';

/**
 * Early check-out extension offers.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE BUSINESS RULE THIS FILE EXISTS TO ENFORCE
 *
 * When someone leaves before the end of their slot, the hours they give back do NOT become a
 * public opening. They are not advertised on the floor plan, they do not appear as availability
 * to other users, and above all they do not let anybody skip the normal reservation lead time
 * (settings.bookingWindowDays - the "48h" rule). An early check-out is not a booking channel.
 *
 * Exactly one person may take those hours: whoever already holds the NEXT reservation on that
 * same desk. They are not being given a new reservation - they are being offered the chance to
 * start the one they already hold earlier. That is why this workflow modifies an existing row
 * instead of creating one, and therefore never passes through ReservationService.createReservation
 * and its lead-time rule. There is no loophole to widen here: the offer is computed from the
 * timeline, addressed to one user, and re-verified server-side at the moment it is accepted.
 *
 *   Ahmed   WS-A  08:00 ────────────────── 12:00   checks out at 10:30 → COMPLETED
 *   Sara    WS-A                           12:00 ────────────── 16:00
 *   Offer to Sara, and to nobody else:     10:30 ───────────────────── 16:00
 *
 * WHAT FUTURE DEVELOPERS MUST NOT CHANGE
 *   - Never surface these hours through the seat availability overlay or a seat status. The rest
 *     of the application must keep treating them as ordinary unbooked time governed by the
 *     ordinary rules.
 *   - Never auto-apply an offer. The holder decides; a reservation must not move under someone
 *     without their consent (their day is planned around its start time).
 *   - Never trust a start time sent by the client. recomputeOffer() is the authority, every time.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/** What the next holder is offered. Deliberately carries no information about who left. */
export interface EarlyExtensionOffer {
  /** The reservation that would be extended - the offer's addressee owns it. */
  reservationId: string;
  workstationCode: string;
  clusterName: string;
  date: string;
  /** The window as it stands today. */
  currentStart: string;
  currentEnd: string;
  /** The earliest start now claimable. Always < currentStart. */
  proposedStart: string;
  /** Minutes gained by accepting, for the interface to state the offer plainly. */
  gainedMinutes: number;
}

/** Statuses whose holder can still be offered an earlier start. */
const EXTENDABLE_STATUSES = new Set(['confirmée', 'check-in']);

/**
 * The hours a completed reservation gave back on its own day, or null if it gave back none.
 *
 * A reservation only releases time by ending EARLY, which is why check_out_at is compared against
 * the booked end rather than merely being present: the automatic sweep that closes a reservation
 * at its end time also writes 'terminée' and a timestamp, and it frees nothing - those hours were
 * used. Anything that cannot be shown to be an early departure returns null, so the offer is never
 * conjured out of an ordinary completion.
 */
function releasedWindowOf(reservation: Reservation): { fromMinutes: number; toMinutes: number } | null {
  if (reservation.status !== 'terminée' || !reservation.check_out_at) return null;

  const out = siteClockAt(new Date(reservation.check_out_at));
  if (out.date !== reservation.reservation_date) return null;

  const bookedEnd = toMinutes(reservation.end_time);
  const bookedStart = toMinutes(reservation.start_time);
  if (!Number.isFinite(bookedEnd) || !Number.isFinite(bookedStart)) return null;

  const leftAt = Math.max(bookedStart, out.minutes);
  if (leftAt >= bookedEnd) return null;

  return { fromMinutes: leftAt, toMinutes: bookedEnd };
}

/**
 * Builds the offer attached to one reservation, from the desk's own timeline. The single source
 * of truth for "is there an offer, and how far back does it reach" - the notification, the list
 * the dashboard reads and the acceptance check all call this, so they cannot disagree.
 *
 * Deterministic by construction. Walking the desk's day in order, the reservation is offered an
 * earlier start only when the booking that sits IMMEDIATELY before it ended early:
 *
 *   - `previous` is the live-or-completed booking with the greatest end at or before this one's
 *     start. Nothing may sit between them, which is what makes "next reservation" unambiguous and
 *     stops a user two slots away from claiming hours that belong to the person in between;
 *   - that previous booking must have released time (releasedWindowOf);
 *   - the released hours must run right up to this reservation's start, so the extension is
 *     contiguous rather than jumping over a stretch that was never anyone's;
 *   - nothing else live may occupy the gap.
 *
 * The proposal is clamped to the current time on the day itself: offering hours that have already
 * elapsed would move the reservation's start into the past, and with it the check-in deadline the
 * no-show sweep measures - the holder would be marked absent for a period they could not attend.
 */
export function buildOffer(
  reservation: Reservation,
  sameSeatSameDay: Reservation[],
  now = siteClockAt()
): EarlyExtensionOffer | null {
  if (!EXTENDABLE_STATUSES.has(reservation.status)) return null;
  if ((reservation.end_date || reservation.reservation_date) !== reservation.reservation_date) return null;
  if (reservation.reservation_date < now.date) return null;

  const myStart = toMinutes(reservation.start_time);
  if (!Number.isFinite(myStart)) return null;

  const others = sameSeatSameDay.filter(
    (r) => r.id !== reservation.id && r.reservation_date === reservation.reservation_date
  );

  // The booking immediately before this one, whatever became of it.
  let previous: Reservation | null = null;
  let previousEnd = -1;
  for (const r of others) {
    if (r.status === 'annulée' || r.status === 'rejetée' || r.status === 'no-show') continue;
    const end = toMinutes(r.end_time);
    if (!Number.isFinite(end) || end > myStart) continue;
    if (end > previousEnd) {
      previousEnd = end;
      previous = r;
    }
  }
  if (!previous) return null;

  const released = releasedWindowOf(previous);
  // Contiguity: the freed hours must reach this reservation's start. A booking that ended early
  // but had a gap after it anyway releases nothing this holder can join onto.
  if (!released || released.toMinutes < myStart) return null;

  // Nothing live may hold any part of the gap - including a booking that starts inside it.
  const gapStart = released.fromMinutes;
  const blocked = others.some((r) => {
    if (!HOLDING_STATUSES.has(r.status)) return false;
    const s = toMinutes(r.start_time);
    const e = toMinutes(r.end_time);
    return Number.isFinite(s) && Number.isFinite(e) && s < myStart && e > gapStart;
  });
  if (blocked) return null;

  const floor = reservation.reservation_date === now.date ? Math.max(gapStart, now.minutes) : gapStart;
  if (floor >= myStart) return null;

  return {
    reservationId: reservation.id,
    workstationCode: reservation.workstation_code,
    clusterName: reservation.cluster_name,
    date: reservation.reservation_date,
    currentStart: reservation.start_time,
    currentEnd: reservation.end_time,
    proposedStart: toHHMM(floor),
    gainedMinutes: myStart - floor,
  };
}

export class EarlyExtensionService {
  /**
   * Reads the desk's day from the database and rebuilds the offer for one reservation.
   *
   * Every entry point goes through here rather than through anything the caller supplied. The
   * offer a browser is holding may be minutes old: the previous occupant could have been checked
   * back in, a cancellation could have shuffled the timeline, or the clock could simply have moved
   * past the hours being offered.
   */
  static async recomputeOffer(reservation: Reservation): Promise<EarlyExtensionOffer | null> {
    if (!reservation.workstation_id) return null;
    const sameSeat = await ReservationRepository.getSeatReservationsOnDate(
      reservation.workstation_id,
      reservation.reservation_date
    );
    return buildOffer(reservation, sameSeat);
  }

  /**
   * Every extension currently open to one user.
   *
   * Scoped to the caller's own reservations, so the endpoint behind it can never enumerate anyone
   * else's. Only upcoming days are examined - a reservation whose day has passed cannot start
   * earlier.
   */
  static async listOffersForUser(userId: string): Promise<EarlyExtensionOffer[]> {
    const mine = await ReservationRepository.getUserReservations(userId);
    const now = siteClockAt();

    const candidates = mine.filter(
      (r) => EXTENDABLE_STATUSES.has(r.status) && r.reservation_date >= now.date && r.workstation_id
    );

    const offers: EarlyExtensionOffer[] = [];
    for (const reservation of candidates) {
      const offer = await this.recomputeOffer(reservation);
      if (offer) offers.push(offer);
    }
    return offers;
  }

  /**
   * The reservation that follows a released window on the same desk, if any.
   *
   * Used at check-out time to decide who - if anyone - should be told. Returns the holder's
   * reservation, never a user record: the caller only needs an id to notify.
   */
  static async findNextHolderReservation(released: Reservation): Promise<Reservation | null> {
    if (!released.workstation_id) return null;

    const sameSeat = await ReservationRepository.getSeatReservationsOnDate(
      released.workstation_id,
      released.reservation_date
    );
    const releasedEnd = toMinutes(released.end_time);

    const next = sameSeat
      .filter(
        (r) =>
          r.id !== released.id &&
          EXTENDABLE_STATUSES.has(r.status) &&
          r.reservation_date === released.reservation_date &&
          toMinutes(r.start_time) < releasedEnd + 1 &&
          toMinutes(r.start_time) >= toMinutes(released.start_time)
      )
      .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time))[0];

    return next || null;
  }

  /**
   * Tells the next holder that an earlier start is available, if the timeline actually offers one.
   *
   * Silent when there is no next holder or no valid offer - which is the common case, and must
   * stay silent rather than notifying "nothing happened". The notification carries the hours only:
   * naming the person who left would disclose one collaborator's movements to another, which this
   * application never does.
   */
  static async notifyNextHolder(released: Reservation): Promise<EarlyExtensionOffer | null> {
    const next = await this.findNextHolderReservation(released);
    if (!next) return null;

    const offer = await this.recomputeOffer(next);
    if (!offer) return null;

    await sendNotification(
      next.user_id,
      'Prolongation possible',
      `Le poste ${offer.workstationCode} s'est libéré avant votre réservation. Vous pouvez avancer ` +
        `son début de ${offer.currentStart} à ${offer.proposedStart} le ${offer.date}. ` +
        `Rendez-vous sur votre tableau de bord pour accepter.`,
      'info',
      next.id
    );

    return offer;
  }

  /**
   * Applies an extension the holder has explicitly accepted.
   *
   * EVERYTHING is re-established here from the database - the offer, the ownership, the timeline -
   * because the browser is not a trustworthy witness to any of it and because the state can have
   * changed between the offer being displayed and this call arriving.
   *
   * The checks, and why each exists:
   *   - the reservation must exist and belong to the caller, or one user could rewrite another's
   *     booking simply by knowing its id;
   *   - the offer must still hold (recomputeOffer), which re-establishes that this really is the
   *     next reservation after a genuine early departure, and that the hours have not since passed;
   *   - the requested start must sit inside the offer, so a client cannot ask for more than was
   *     released by sending an earlier time than the one it was shown;
   *   - the caller must not hold another reservation over the new hours - one person cannot occupy
   *     two desks at once (slotOverlap.ts), and extending backwards can create exactly that;
   *   - the desk must be free for the new stretch, checked against live bookings.
   *
   * The final guarantee against a race is not in this function at all: `reservations` carries a
   * GiST exclusion constraint over (workstation_id, period) for live statuses, so two extensions
   * or an extension and a booking that would overlap cannot both commit, whatever this code
   * believes about the world. Do not remove that constraint on the assumption that these checks
   * are enough - they are checks, not locks.
   */
  static async acceptOffer(
    reservationId: string,
    userId: string,
    requestedStart: string,
    actor?: { id: string; name: string; role: string }
  ): Promise<{ ok: boolean; message?: string; reservation?: Reservation }> {
    const reservation = await ReservationRepository.getReservationById(reservationId);
    if (!reservation) return { ok: false, message: 'Réservation introuvable.' };
    if (reservation.user_id !== userId) {
      return { ok: false, message: "Cette réservation ne vous appartient pas." };
    }

    const offer = await this.recomputeOffer(reservation);
    if (!offer) {
      return {
        ok: false,
        message: "Cette prolongation n'est plus disponible. Le créneau a changé depuis l'affichage.",
      };
    }

    const wanted = toMinutes(requestedStart);
    if (!Number.isFinite(wanted)) return { ok: false, message: 'Heure de début invalide.' };
    if (wanted < toMinutes(offer.proposedStart) || wanted >= toMinutes(offer.currentStart)) {
      return {
        ok: false,
        message: `La prolongation doit commencer entre ${offer.proposedStart} et ${offer.currentStart}.`,
      };
    }

    const ownClash = findOwnSlotClash(
      await ReservationRepository.getUserReservations(userId),
      {
        startDate: reservation.reservation_date,
        endDate: reservation.reservation_date,
        startTime: requestedStart,
        endTime: reservation.end_time,
      },
      { excludeReservationId: reservation.id }
    );
    if (ownClash) return { ok: false, message: describeSlotClash(ownClash) };

    const conflict = await ReservationRepository.checkConflict(
      reservation.workstation_code,
      reservation.reservation_date,
      requestedStart,
      reservation.end_time,
      reservation.id,
      undefined,
      reservation.reservation_date
    );
    if (conflict) {
      return { ok: false, message: `Le poste ${reservation.workstation_code} n'est plus libre sur ce créneau.` };
    }

    const previousStart = reservation.start_time;
    const updated = await ReservationRepository.updateReservationWindow(reservation.id, {
      date: reservation.reservation_date,
      startTime: requestedStart,
      endTime: reservation.end_time,
      endDate: reservation.reservation_date,
    });
    if (!updated) return { ok: false, message: "Échec de l'enregistrement de la prolongation." };

    // The window the reservation had BEFORE is written into the audit trail, which is what makes
    // the original booking reconstructible once the row itself has moved. Deliberately not a
    // check_events row: that stream records physical presence (CHECK_IN / CHECK_OUT_*), and an
    // extension is a change of plan, not an arrival or a departure.
    logAuditEvent(
      'UPDATE',
      actor?.id || userId,
      actor?.name || reservation.user_name || userId,
      actor?.role || 'collaborator',
      reservation.workstation_code,
      `Prolongation acceptée : réservation ${reservation.id.substring(0, 8)} avancée de ` +
        `${previousStart} à ${requestedStart} (fin ${reservation.end_time}) sur le poste ` +
        `${reservation.workstation_code} le ${reservation.reservation_date}.`
    );

    await sendNotification(
      userId,
      'Prolongation confirmée',
      `Votre réservation du poste ${reservation.workstation_code} commence désormais à ${requestedStart} ` +
        `au lieu de ${previousStart}.`,
      'success',
      reservation.id
    );

    return { ok: true, reservation: updated };
  }
}
