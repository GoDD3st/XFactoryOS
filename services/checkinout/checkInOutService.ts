import { ReservationRepository } from '@/database/repositories/reservationRepository';
import { CheckEventRepository } from '@/database/repositories/checkEventRepository';
import { WorkstationRepository } from '@/database/repositories/workstationRepository';
import { NotificationRepository } from '@/database/repositories/notificationRepository';
import { processWaitingListFIFO } from '../waitinglist/waitingListService';
import { sendNotification } from '../notifications/notificationService';
import { logAuditEvent } from '../audit/auditService';
import { ReservationService } from '../reservations/reservationService';
import { Reservation } from '@/frontend/src/types';

const CHECK_IN_REMINDER_TITLE = 'Rappel Check-in';

export class CheckInOutService {
  public static async performCheckIn(reservationId: string, userId: string): Promise<boolean> {
    const reservation = await ReservationRepository.getReservationById(reservationId);

    if (!reservation || reservation.user_id !== userId || reservation.status !== 'confirmée') {
      return false;
    }

    const checkInAt = new Date().toISOString();
    const success = await ReservationRepository.updateReservationStatus(reservationId, 'check-in', {
      check_in_at: checkInAt,
    });

    if (!success) return false;

    if (reservation.workstation_id) {
      await WorkstationRepository.updateWorkstationStatus(reservation.workstation_id, 'occupé', false);
    }

    await CheckEventRepository.logEvent(reservationId, 'CHECK_IN', userId, {
      workstation_code: reservation.workstation_code,
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
      userId,
      reservation.user_name || userId,
      'collaborator',
      reservation.workstation_code,
      `Check-in effectué pour la réservation ${reservationId}`
    );

    await ReservationService.syncFromDatabase();
    return true;
  }

  /**
   * Check someone in at the reception desk (SRS §8.5 / UML "Receptionist → Effectuer Check-in").
   *
   * performCheckIn() requires the caller to BE the reservation holder, so a receptionist could
   * never use it on a collaborator's behalf, and POST /check-in forces userId from the session —
   * together that left the desk's check-in button unable to work at all outside the QR-scan flow.
   * This resolves the holder from the reservation itself and records who actually performed it.
   */
  public static async performCheckInOnBehalf(
    reservationId: string,
    actor: { id: string; name: string; role: string }
  ): Promise<{ ok: boolean; message?: string; userName?: string; workstationCode?: string }> {
    const reservation = await ReservationRepository.getReservationById(reservationId);
    if (!reservation) return { ok: false, message: 'Réservation introuvable.' };
    if (reservation.status !== 'confirmée') {
      return { ok: false, message: `Cette réservation n'est pas en attente de check-in (statut : ${reservation.status}).` };
    }

    const ok = await this.performCheckIn(reservationId, reservation.user_id);
    if (!ok) return { ok: false, message: 'Échec du check-in.' };

    // performCheckIn logs the event as the holder; record the assisted action separately so the
    // audit trail shows the reservation was validated at the desk rather than by the person.
    logAuditEvent(
      'CHECK_IN',
      actor.id,
      actor.name,
      actor.role,
      reservation.workstation_code,
      `Check-in effectué à l'accueil pour ${reservation.user_name || reservation.user_id} (réservation ${reservationId}).`
    );

    return {
      ok: true,
      userName: reservation.user_name,
      workstationCode: reservation.workstation_code,
    };
  }

  public static async performCheckOut(reservationId: string, userId: string): Promise<boolean> {
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

    await CheckEventRepository.logEvent(reservationId, 'CHECK_OUT_MANUAL', userId, {
      workstation_code: reservation.workstation_code,
    });

    const todayDate = new Date().toISOString().split('T')[0];
    await processWaitingListFIFO(reservation.cluster_id, todayDate, reservation.workstation_id);

    logAuditEvent(
      'CHECK_OUT',
      userId,
      reservation.user_name || userId,
      'collaborator',
      reservation.workstation_code,
      `Check-out effectué pour le poste ${reservation.workstation_code}`
    );

    await ReservationService.syncFromDatabase();
    return true;
  }

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

          await processWaitingListFIFO(res.cluster_id, todayDate, res.workstation_id);
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
   * each reservation gets at most one reminder — re-running this on the same candidate is
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
