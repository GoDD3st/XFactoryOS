import { getLocalReservations, saveLocalReservations } from '../reservations/reservationService';
import { processWaitingListFIFO } from '../waitinglist/waitingListService';
import { sendNotification } from '../notifications/notificationService';
import { logAuditEvent } from '../audit/auditService';
import { Reservation } from '@/frontend/src/types';

export class CheckInOutService {
  public static performCheckIn(reservationId: string, userId: string): boolean {
    const reservations = getLocalReservations();
    const index = reservations.findIndex(r => r.id === reservationId && r.user_id === userId);
    
    if (index !== -1 && reservations[index].status === 'confirmée') {
      reservations[index].status = 'check-in';
      reservations[index].check_in_at = new Date().toISOString();
      
      saveLocalReservations(reservations);

      sendNotification(
        userId,
        'Check-in Confirmé',
        `Votre check-in sur le poste ${reservations[index].workstation_code} a été enregistré avec succès.`,
        'success'
      );

      logAuditEvent(
        'CHECK_IN_PERFORMED',
        userId,
        reservations[index].user_name || userId,
        'collaborator',
        reservations[index].workstation_code,
        `Check-in effectué pour la réservation ${reservationId}`
      );

      return true;
    }
    return false;
  }

  public static performCheckOut(reservationId: string, userId: string): boolean {
    const reservations = getLocalReservations();
    const index = reservations.findIndex(r => r.id === reservationId && r.user_id === userId);
    
    if (index !== -1 && reservations[index].status === 'check-in') {
      const targetRes = reservations[index];
      reservations[index].status = 'terminée';
      
      saveLocalReservations(reservations);

      // Process waiting list for the freed workstation cluster
      const todayDate = new Date().toISOString().split('T')[0];
      processWaitingListFIFO(targetRes.cluster_id, todayDate);

      logAuditEvent(
        'CHECK_OUT_PERFORMED',
        userId,
        targetRes.user_name || userId,
        'collaborator',
        targetRes.workstation_code,
        `Check-out effectué pour le poste ${targetRes.workstation_code}`
      );

      return true;
    }
    return false;
  }

  public static autoCheckOutExpired(): number {
    const reservations = getLocalReservations();
    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];
    let checkedOut = 0;

    const updated = reservations.map(res => {
      if (res.status === 'check-in') {
        const endDateTime = new Date(`${res.reservation_date}T${res.end_time}`);
        if (now > endDateTime) {
          res.status = 'terminée';
          checkedOut++;
          processWaitingListFIFO(res.cluster_id, todayDate);
        }
      }
      return res;
    });

    if (checkedOut > 0) {
      saveLocalReservations(updated);
    }
    return checkedOut;
  }

  public static getCheckInReminders(): Reservation[] {
    const reservations = getLocalReservations();
    const now = new Date();
    
    return reservations.filter(res => {
      if (res.status === 'confirmée') {
        const start = new Date(`${res.reservation_date}T${res.start_time}`);
        const diffMinutes = (start.getTime() - now.getTime()) / (1000 * 60);
        return diffMinutes > 0 && diffMinutes <= 15;
      }
      return false;
    });
  }
}
