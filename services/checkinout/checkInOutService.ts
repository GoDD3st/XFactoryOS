import { ReservationRepository } from '@/database/repositories/reservationRepository';
import { CheckEventRepository } from '@/database/repositories/checkEventRepository';
import { WorkstationRepository } from '@/database/repositories/workstationRepository';
import { NotificationRepository } from '@/database/repositories/notificationRepository';
import { processWaitingListFIFO } from '../waitinglist/waitingListService';
import { sendNotification, notifyRoles } from '../notifications/notificationService';
import { logAuditEvent } from '../audit/auditService';
import { ReservationService } from '../reservations/reservationService';
import { SettingsRepository } from '@/database/repositories/settingsRepository';
import { siteClockAt } from '@/services/time/siteTime';
import { toMinutes } from '@/services/workspaces/seatAvailability';
import { Reservation } from '@/frontend/src/types';

const CHECK_IN_REMINDER_TITLE = 'Rappel Check-in';

/**
 * How early a booking may be claimed. Small on purpose: the desk is genuinely free just before
 * the slot, but a wide grace period would let someone occupy a desk hours ahead of a booking and
 * defeat the reservation they are standing in front of.
 */
const CHECK_IN_EARLY_GRACE_MINUTES = 15;

/**
 * Is `nowMs` inside the period during which this booking may be claimed?
 *
 * Pure and exported so the rule can be exercised directly, and so the two boundaries stay
 * inspectable:
 *
 *   - it opens CHECK_IN_EARLY_GRACE_MINUTES before the start, because someone arriving a few
 *     minutes early should not be turned away, while a wide grace period would let a desk be
 *     occupied hours ahead of the booking that is standing in front of it;
 *   - it closes at start + noShowDelayMinutes, the SAME instant the no-show sweep uses, so the
 *     two can never disagree about whether a booking is still claimable. Arriving later is not a
 *     dead end: it is what the reviewed late check-in request exists for, and that path
 *     deliberately does not come through here.
 */
export function checkInWindowVerdict(
  reservation: Pick<Reservation, 'reservation_date' | 'start_time'>,
  noShowDelayMinutes: number,
  nowMs: number
): { ok: boolean; message?: string } {
  const start = new Date(`${reservation.reservation_date}T${reservation.start_time}`).getTime();
  // An unparseable date is a data fault, not a late arrival - the ownership and status checks
  // still stand, and refusing here would only produce a baffling message.
  if (!Number.isFinite(start)) return { ok: true };

  if (nowMs < start - CHECK_IN_EARLY_GRACE_MINUTES * 60000) {
    return {
      ok: false,
      message: `Le check-in ouvre ${CHECK_IN_EARLY_GRACE_MINUTES} minutes avant le début de votre créneau (${reservation.start_time}).`,
    };
  }
  if (nowMs > start + noShowDelayMinutes * 60000) {
    return {
      ok: false,
      message: `Le délai de check-in (${noShowDelayMinutes} min après ${reservation.start_time}) est dépassé. Demandez un check-in tardif.`,
    };
  }
  return { ok: true };
}

export class CheckInOutService {
  /**
   * Records a user's arrival at their reserved desk. CONFIRMED → OCCUPIED.
   *
   * Business context: FR-58. Check-in is what turns a booking into an occupancy. Until it
   * happens the desk is "réservé" (spoken for but empty) and is on the clock for no-show release;
   * after it, the desk is "occupé" and safe.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * THIS IS THE FRESH VALIDATION, AND IT IS THE ONLY ONE THAT COUNTS
   *
   * Whatever a QR scan established a moment ago is not evidence now: between the scan and the
   * button press the reservation can be cancelled, reassigned, checked in from another device or
   * expire into a no-show. Every condition is therefore re-read from the database HERE, at the
   * moment of the state transition. Nothing about the caller's screen is trusted.
   *
   * All four conditions are load-bearing:
   *   - the reservation exists;
   *   - reservation.user_id === userId - you cannot check in on someone else's booking. The QR
   *     badge on a desk is public (see services/qr/seatQrTokenService.ts), so this comparison is
   *     the reason a stranger scanning it achieves nothing;
   *   - status is exactly 'confirmée' - which blocks re-checking-in an already-active booking,
   *     and blocks reviving one that was cancelled, rejected, completed or already released as a
   *     no-show. Widening this to "any non-terminal status" would let a no-show desk that has
   *     since been offered to the waiting list be silently taken back;
   *   - the moment is inside the check-in window (see isWithinCheckInWindow). Arriving days
   *     early must not occupy a desk, and arriving after the no-show delay is what the late
   *     check-in request workflow is for - it is reviewed, this path is not.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   *
   * Returns false rather than throwing: callers include the QR flow, which turns a false into a
   * user-facing refusal rather than an error page.
   *
   * `actor` is supplied only when someone checks the holder in on their behalf (reception desk).
   * It changes who the audit trail and the check_events row name as having PERFORMED the action;
   * it never changes whose reservation it is. Recording an assisted check-in as though the
   * collaborator had done it themselves would put a fact in the audit trail that never happened.
   *
   * Side effects: sets the reservation to 'check-in' with a server timestamp, flips the
   * workstation to 'occupé', appends a CHECK_IN row to check_events, notifies the holder, and
   * writes the audit trail. Returns the recorded timestamp so callers can display the time the
   * DATABASE stored rather than the browser's own clock.
   */
  public static async performCheckIn(
    reservationId: string,
    userId: string,
    actor?: { id: string; name: string; role: string }
  ): Promise<boolean> {
    return (await this.checkIn(reservationId, userId, actor)).ok;
  }

  /**
   * The check-in itself. performCheckIn() is the boolean-returning face of it, kept because most
   * callers only need to know whether it worked.
   */
  public static async checkIn(
    reservationId: string,
    userId: string,
    actor?: { id: string; name: string; role: string }
  ): Promise<{ ok: boolean; checkInAt?: string; message?: string }> {
    const reservation = await ReservationRepository.getReservationById(reservationId);

    if (!reservation) return { ok: false, message: 'Réservation introuvable.' };
    if (reservation.user_id !== userId) {
      return { ok: false, message: "Cette réservation n'appartient pas à cet utilisateur." };
    }
    if (reservation.status !== 'confirmée') {
      return {
        ok: false,
        message: `Cette réservation n'est pas en attente de check-in (statut : ${reservation.status}).`,
      };
    }

    const window = await this.isWithinCheckInWindow(reservation);
    if (!window.ok) return { ok: false, message: window.message };

    const checkInAt = new Date().toISOString();
    const success = await ReservationRepository.updateReservationStatus(reservationId, 'check-in', {
      check_in_at: checkInAt,
    });

    if (!success) return { ok: false, message: "Échec de l'enregistrement du check-in." };

    if (reservation.workstation_id) {
      await WorkstationRepository.updateWorkstationStatus(reservation.workstation_id, 'occupé', false);
    }

    const assisted = !!actor && actor.id !== userId;

    await CheckEventRepository.logEvent(reservationId, 'CHECK_IN', actor?.id || userId, {
      workstation_code: reservation.workstation_code,
      ...(assisted
        ? { on_behalf_of: userId, performed_by_role: actor!.role, performed_by_name: actor!.name }
        : {}),
    });

    await sendNotification(
      userId,
      'Check-in Confirmé',
      `Votre check-in sur le poste ${reservation.workstation_code} a été enregistré avec succès.`,
      'success',
      reservationId
    );

    logAuditEvent(
      'CHECK_IN',
      actor?.id || userId,
      actor?.name || reservation.user_name || userId,
      actor?.role || 'collaborator',
      reservation.workstation_code,
      assisted
        ? `Check-in effectué à l'accueil par ${actor!.name} pour ${reservation.user_name || userId} (réservation ${reservationId}).`
        : `Check-in effectué pour la réservation ${reservationId}`
    );

    await ReservationService.syncFromDatabase();
    return { ok: true, checkInAt };
  }

  /**
   * Is now inside the period during which this booking may be claimed?
   *
   * Opens CHECK_IN_EARLY_GRACE_MINUTES before the start, because someone who arrives a few
   * minutes early should not be told to wait, and closes at the same instant the no-show sweep
   * uses (start + settings.noShowDelayMinutes) so the two can never disagree about whether a
   * booking is still claimable. A later arrival is not refused outright by the product - it is
   * routed to the reviewed late check-in request, which is the only sanctioned way past this.
   *
   * Read from settings on every call rather than cached: an administrator may change the no-show
   * delay at any moment, and a stale copy here would accept check-ins the sweep has already
   * turned into no-shows.
   */
  private static async isWithinCheckInWindow(
    reservation: Reservation
  ): Promise<{ ok: boolean; message?: string }> {
    const settings = await SettingsRepository.getSettings();
    return checkInWindowVerdict(reservation, settings.noShowDelayMinutes || 30, Date.now());
  }

  /**
   * Answers a desk-badge scan: what does THIS user hold on THIS desk, and what may they do now?
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * PRIVACY INVARIANT - do not weaken this.
   *
   * The badge is public: it is printed on a sticker and anyone walking past can photograph it.
   * The reply must therefore never describe the desk's occupant. Scanning a desk that belongs to
   * somebody else returns the same flat refusal as scanning one that is free - no name, no email,
   * no "reserved until 16:00", nothing that would turn a public sticker into a way of finding out
   * who sits where. Only the caller's OWN reservation is ever returned.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   *
   * Read-only. It performs no state transition and must never be given one: the check-in happens
   * when the user presses the button, through checkIn(), which validates again from scratch.
   *
   * The lookup is scoped to the scanned desk, this user, and today - the day the person is
   * physically standing there. Among their bookings on that desk it prefers the one covering the
   * current moment, then the next one still to come, so arriving fifteen minutes early resolves
   * to the booking about to start rather than to nothing at all.
   */
  public static async resolveSeatScan(
    workstationId: string,
    user: { id: string; name?: string }
  ): Promise<{
    reservation?: {
      id: string;
      workstationCode: string;
      clusterName: string;
      date: string;
      startTime: string;
      endTime: string;
      status: string;
    };
    userName?: string;
    availableAction?: 'check-in' | 'check-out';
    message?: string;
  }> {
    const today = siteClockAt().date;
    const onSeat = await ReservationRepository.getSeatReservationsOnDate(workstationId, today);

    const mine = onSeat
      .filter((r) => r.user_id === user.id && (r.status === 'confirmée' || r.status === 'check-in'))
      .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));

    if (mine.length === 0) {
      return { message: "Vous n'avez pas accès à ce poste." };
    }

    const nowMinutes = siteClockAt().minutes;
    const current =
      mine.find((r) => toMinutes(r.start_time) <= nowMinutes && toMinutes(r.end_time) > nowMinutes) ||
      mine.find((r) => toMinutes(r.start_time) > nowMinutes) ||
      mine[0];

    return {
      reservation: {
        id: current.id,
        workstationCode: current.workstation_code,
        clusterName: current.cluster_name,
        date: current.reservation_date,
        startTime: current.start_time,
        endTime: current.end_time,
        status: current.status,
      },
      userName: user.name,
      availableAction: current.status === 'check-in' ? 'check-out' : 'check-in',
    };
  }

  /**
   * Check someone in at the reception desk (SRS §8.5 / UML "Receptionist → Effectuer Check-in").
   *
   * performCheckIn() requires the caller to BE the reservation holder, so a receptionist could
   * never use it on a collaborator's behalf, and POST /check-in forces userId from the session - 
   * together that left the desk's check-in button unable to work at all outside the QR-scan flow.
   * This resolves the holder from the reservation itself and records who actually performed it.
   */
  public static async performCheckInOnBehalf(
    reservationId: string,
    actor: { id: string; name: string; role: string }
  ): Promise<{ ok: boolean; message?: string; userName?: string; workstationCode?: string; checkInAt?: string }> {
    const reservation = await ReservationRepository.getReservationById(reservationId);
    if (!reservation) return { ok: false, message: 'Réservation introuvable.' };
    if (reservation.status !== 'confirmée') {
      return { ok: false, message: `Cette réservation n'est pas en attente de check-in (statut : ${reservation.status}).` };
    }

    // The actor is threaded through rather than logged separately afterwards: check_events and
    // the audit trail must both name the person who actually performed the action, with the
    // holder recorded as its subject. A second, standalone audit row would leave the first one
    // still claiming the collaborator checked themselves in.
    const result = await this.checkIn(reservationId, reservation.user_id, actor);
    if (!result.ok) return { ok: false, message: result.message || 'Échec du check-in.' };

    return {
      ok: true,
      userName: reservation.user_name,
      workstationCode: reservation.workstation_code,
      checkInAt: result.checkInAt,
    };
  }

  /**
   * Grant check-in following an approved late check-in request.
   *
   * Uses the same primitives as performCheckIn (reservation status + check_in_at, seat marked
   * occupied, check_events entry, notification, audit) rather than a parallel check-in system.
   * It differs in exactly two ways, both required by the workflow:
   *
   *  - it accepts a reservation that has already flipped to no-show, which is the normal case:
   *    the user forgot, the window elapsed, and that is precisely why they are asking;
   *  - it stamps check_events.metadata with origin=LATE_CHECK_IN plus the request and approver,
   *    so a late check-in is always distinguishable from a QR one afterwards.
   *
   * Idempotent: a reservation already checked in returns ok without writing a second event.
   */
  public static async performLateCheckIn(
    reservationId: string,
    requestId: string,
    approver: { id: string; name: string; role: string }
  ): Promise<{ ok: boolean; alreadyCheckedIn?: boolean; message?: string }> {
    const reservation = await ReservationRepository.getReservationById(reservationId);
    if (!reservation) return { ok: false, message: 'Réservation introuvable.' };

    if (reservation.status === 'check-in') {
      return { ok: true, alreadyCheckedIn: true };
    }

    // 'confirmée' = still within the window; 'no-show' = the window elapsed, the usual case here.
    if (reservation.status !== 'confirmée' && reservation.status !== 'no-show') {
      return {
        ok: false,
        message: `Un check-in tardif n'est pas possible sur une réservation « ${reservation.status} ».`,
      };
    }

    const checkInAt = new Date().toISOString();
    const updated = await ReservationRepository.updateReservationStatus(reservationId, 'check-in', {
      check_in_at: checkInAt,
    });
    if (!updated) return { ok: false, message: "Échec de l'enregistrement du check-in." };

    if (reservation.workstation_id) {
      await WorkstationRepository.updateWorkstationStatus(reservation.workstation_id, 'occupé', false);
    }

    await CheckEventRepository.logEvent(reservationId, 'CHECK_IN', approver.id, {
      origin: 'LATE_CHECK_IN',
      late_check_in_request_id: requestId,
      approved_by: approver.id,
      approved_by_name: approver.name,
      previous_reservation_status: reservation.status,
      workstation_code: reservation.workstation_code,
    });

    await sendNotification(
      reservation.user_id,
      'Check-in tardif approuvé',
      `Votre demande de check-in tardif pour le poste ${reservation.workstation_code} a été approuvée par ${approver.name}.`,
      'success',
      reservationId
    );

    logAuditEvent(
      'CHECK_IN',
      approver.id,
      approver.name,
      approver.role,
      reservation.workstation_code,
      `Check-in tardif approuvé pour ${reservation.user_name || reservation.user_id} (demande ${requestId}, statut précédent : ${reservation.status}).`
    );

    await ReservationService.syncFromDatabase();
    return { ok: true };
  }

  /**
   * Records a departure, whether it happens at the end of the slot or well before it.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * THE BUSINESS RULE, AND THE ONE THAT WAS REMOVED
   *
   * OCCUPIED → COMPLETED, with the real departure time recorded. That is all a check-out does
   * to the reservation.
   *
   * The unused remainder does NOT become an immediately bookable public slot. It is not offered
   * to the floor, not offered to the waiting list, and it grants nobody an exemption from the
   * normal reservation lead time (settings.bookingWindowDays). This service used to cascade the
   * freed window straight into the waiting list, handing the desk to whoever was queued; that
   * behaviour has been removed deliberately, and re-adding it would re-open the loophole - a
   * user could obtain a desk for tomorrow morning that the ordinary rules put out of reach,
   * simply because somebody left early.
   *
   * The single sanctioned consumer of those hours is the person who ALREADY holds the next
   * reservation on this same desk: they may be offered an earlier start for the booking they
   * already have. That offer is computed, addressed and validated in
   * services/reservations/earlyExtensionService.ts, is never applied automatically, and is
   * re-verified against the database when accepted.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   *
   * Refuses unless the reservation exists, belongs to `userId`, and is exactly 'check-in': you
   * cannot check out of a booking you never checked into, nor out of someone else's.
   *
   * `actor` is set only when somebody checks the holder out on their behalf (reception desk). It
   * changes who the audit trail names as having performed the action - never who the reservation
   * belongs to.
   */
  public static async performCheckOut(
    reservationId: string,
    userId: string,
    actor?: { id: string; name: string; role: string }
  ): Promise<boolean> {
    const reservation = await ReservationRepository.getReservationById(reservationId);

    if (!reservation || reservation.user_id !== userId || reservation.status !== 'check-in') {
      return false;
    }

    const checkOutAt = new Date().toISOString();
    const success = await ReservationRepository.updateReservationStatus(reservationId, 'terminée', {
      check_out_at: checkOutAt,
    });

    if (!success) return false;

    if (reservation.workstation_id) {
      await WorkstationRepository.updateWorkstationStatus(reservation.workstation_id, 'disponible', true);
    }

    await CheckEventRepository.logEvent(reservationId, 'CHECK_OUT_MANUAL', actor?.id || userId, {
      workstation_code: reservation.workstation_code,
      ...(actor && actor.id !== userId
        ? { on_behalf_of: userId, performed_by_role: actor.role, performed_by_name: actor.name }
        : {}),
    });

    logAuditEvent(
      'CHECK_OUT',
      actor?.id || userId,
      actor?.name || reservation.user_name || userId,
      actor?.role || 'collaborator',
      reservation.workstation_code,
      actor && actor.id !== userId
        ? `Check-out effectué à l'accueil pour ${reservation.user_name || userId} sur le poste ${reservation.workstation_code}.`
        : `Check-out effectué pour le poste ${reservation.workstation_code}`
    );

    // The only thing the freed hours may produce: an offer to the holder of the next reservation
    // on this desk. Silent when there is no next holder or the timeline does not actually leave
    // them anything to gain. Never blocks the check-out - the departure is already recorded, and
    // a failure to notify must not undo it.
    try {
      const { EarlyExtensionService } = await import('../reservations/earlyExtensionService');
      await EarlyExtensionService.notifyNextHolder({ ...reservation, status: 'terminée', check_out_at: checkOutAt });
    } catch (err) {
      console.warn('[CheckOut] Extension offer notification failed:', err);
    }

    await ReservationService.syncFromDatabase();
    return true;
  }

  /**
   * Closes reservations whose end time has passed: OCCUPIED → COMPLETED, desk back in the pool.
   *
   * The business rule is deliberately unenforced physically. A reservation ending at 09:00 ends
   * at 09:00 in the system; if nobody has booked the desk until 10:00 the person may well still
   * be sitting there, and that is fine. There is no "awaiting verification" state, no lock and no
   * penalty - users are treated as responsible adults, and inventing an occupancy dispute the
   * building does not have would only produce false alarms.
   *
   * What the sweep does do is tell operational staff, as information only. That notice never
   * blocks the workstation: the desk is already available again by the time it is sent.
   */
  public static async autoCheckOutExpired(): Promise<number> {
    const reservations = await ReservationRepository.getAllReservations();
    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];
    let checkedOut = 0;

    for (const res of reservations) {
      if (res.status === 'check-in') {
        const endDateTime = new Date(`${res.reservation_date}T${res.end_time}`);
        if (now > endDateTime) {
          await ReservationRepository.updateReservationStatus(res.id, 'terminée', {
            check_out_at: new Date().toISOString(),
          });

          if (res.workstation_id) {
            await WorkstationRepository.updateWorkstationStatus(res.workstation_id, 'disponible', true);
          }

          await CheckEventRepository.logEvent(res.id, 'CHECK_OUT_AUTO', res.user_id, {
            workstation_code: res.workstation_code,
          });

          // Legitimate, and distinct from an early check-out: this sweep only fires once the
          // booked end time has PASSED, so the hours offered here were never part of anyone's
          // reservation - they are ordinary free time on a desk that has just come back into the
          // pool. Nothing is being redistributed and no reservation rule is being bypassed.
          // The open end is clamped to the business day by processWaitingListFIFO.
          await processWaitingListFIFO(res.cluster_id, res.reservation_date, res.workstation_id, {
            start: res.end_time,
          });

          // Informational only, and never a hold on the desk: reception simply gets to know the
          // slot is over in case the previous occupant needs a word.
          await notifyRoles(
            ['RECEPTIONIST', 'BUILDING_MANAGER'],
            'Réservation terminée',
            `La réservation du poste ${res.workstation_code} (${res.start_time} - ${res.end_time}) est ` +
              `arrivée à son terme et le poste est de nouveau disponible.`,
            'info',
            res.id
          );

          checkedOut++;
        }
      }
    }

    if (checkedOut > 0) {
      await ReservationService.syncFromDatabase();
    }

    return checkedOut;
  }

  public static async getCheckInReminders(): Promise<Reservation[]> {
    const reservations = await ReservationRepository.getAllReservations();
    const now = new Date();

    return reservations.filter((res) => {
      if (res.status === 'confirmée') {
        const start = new Date(`${res.reservation_date}T${res.start_time}`);
        const diffMinutes = (start.getTime() - now.getTime()) / (1000 * 60);
        return diffMinutes > 0 && diffMinutes <= 15;
      }
      return false;
    });
  }

  /**
   * FR-59: push a reminder notification for reservations starting within 15 minutes that
   * haven't checked in yet. Meant to be called from a server ticker (see backend/server.ts);
   * each reservation gets at most one reminder - re-running this on the same candidate is
   * deduped via NotificationRepository.hasNotificationForReservation, since the ticker
   * re-evaluates "starts within 15 min" on every tick until the window closes.
   */
  public static async sendCheckInReminders(): Promise<number> {
    const reminders = await this.getCheckInReminders();
    let sent = 0;

    for (const res of reminders) {
      const alreadySent = await NotificationRepository.hasNotificationForReservation(res.id, CHECK_IN_REMINDER_TITLE);
      if (alreadySent) continue;

      await sendNotification(
        res.user_id,
        CHECK_IN_REMINDER_TITLE,
        `Votre réservation sur le poste ${res.workstation_code} débute à ${res.start_time}. Pensez à faire votre check-in.`,
        'warning',
        res.id
      );
      sent++;
    }

    return sent;
  }
}
