import { ReservationRepository } from '@/database/repositories/reservationRepository';
import { CheckEventRepository } from '@/database/repositories/checkEventRepository';
import { WorkstationRepository } from '@/database/repositories/workstationRepository';
import { processWaitingListFIFO } from '../waitinglist/waitingListService';
import { sendNotification } from '../notifications/notificationService';
import { logAuditEvent } from '../audit/auditService';
import { ReservationService } from '../reservations/reservationService';
import { Reservation } from '@/frontend/src/types';

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
      'CHECK_IN_PERFORMED',
      userId,
      reservation.user_name || userId,
      'collaborator',
      reservation.workstation_code,
      `Check-in effectué pour la réservation ${reservationId}`
    );

    await ReservationService.syncFromDatabase();
    return true;
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
      'CHECK_OUT_PERFORMED',
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
}
