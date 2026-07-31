import { getLocalReservations, saveLocalReservations } from '../reservations/reservationService';
import { sendNotification } from '../notifications/notificationService';
import { logAuditEvent } from '../audit/auditService';
import { Reservation } from '@/frontend/src/types';

export class NoShowService {
  public static NO_SHOW_DELAY_MINUTES = 30;

  public static detectNoShows(): number {
    const reservations = getLocalReservations();
    const now = new Date();
    let detectedCount = 0;

    const updatedReservations = reservations.map(res => {
      if (res.status === 'confirmée') {
        const resStart = new Date(`${res.reservation_date}T${res.start_time}`);
        const diffMinutes = (now.getTime() - resStart.getTime()) / (1000 * 60);

        if (diffMinutes >= this.NO_SHOW_DELAY_MINUTES) {
          res.status = 'no-show';
          detectedCount++;

          sendNotification(
            res.user_id,
            'No-Show Détecté — Clean Desk Policy',
            `Votre réservation sur ${res.workstation_code} a été annulée suite à un no-show après ${this.NO_SHOW_DELAY_MINUTES} minutes sans check-in.`,
            'warning'
          );

          logAuditEvent(
            'NO_SHOW_DETECTED',
            'system',
            'Système XFactory',
            'admin',
            res.workstation_code,
            `Réservation ${res.id} marquée no-show. Poste ${res.workstation_code} libéré automatiquement.`
          );

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('xfactory_noshow_detected', { detail: res }));
          }
        }
      }
      return res;
    });

    if (detectedCount > 0) {
      saveLocalReservations(updatedReservations);
    }
    return detectedCount;
  }

  public static getNoShowStats() {
    const reservations = getLocalReservations();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);

    let today = 0;
    let thisWeek = 0;
    const perCluster: Record<string, number> = {};

    reservations.forEach(res => {
      if (res.status === 'no-show') {
        const resDate = new Date(res.reservation_date);
        if (resDate >= startOfDay) today++;
        if (resDate >= startOfWeek) thisWeek++;
        
        perCluster[res.cluster_id] = (perCluster[res.cluster_id] || 0) + 1;
      }
    });

    return { today, thisWeek, perCluster };
  }
}
