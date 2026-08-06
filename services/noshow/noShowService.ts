import { ReservationRepository } from '@/database/repositories/reservationRepository';
import { SettingsRepository } from '@/database/repositories/settingsRepository';
import { AuditRepository } from '@/database/repositories/auditRepository';
import { WorkstationRepository } from '@/database/repositories/workstationRepository';
import { WaitingListService } from '../waitinglist/waitingListService';
import { NotificationService } from '../notifications/notificationService';
import { Reservation } from '@/frontend/src/types';

export class NoShowService {
  /**
   * Automatically detect no-shows based on configured no_show_window_minutes
   */
  public static async detectNoShows(): Promise<number> {
    const settings = await SettingsRepository.getSettings();
    const noShowDelay = settings.noShowDelayMinutes || 30;

    const reservations = await ReservationRepository.getAllReservations();
    const now = new Date();
    let detectedCount = 0;

    for (const res of reservations) {
      if (res.status === 'confirmée') {
        const resStart = new Date(`${res.reservation_date}T${res.start_time}`);
        const diffMinutes = (now.getTime() - resStart.getTime()) / (1000 * 60);

        if (diffMinutes >= noShowDelay) {
          detectedCount++;
          await ReservationRepository.updateReservationStatus(res.id, 'no-show');

          // Release workstation status to disponible
          if (res.workstation_id) {
            await WorkstationRepository.updateWorkstationStatus(res.workstation_id, 'disponible', true);
          }

          // Trigger FIFO waiting list auto-fulfillment for the released cluster
          const waitingMatch = await WaitingListService.processWaitingListFIFO(
            res.cluster_id || res.cluster_name,
            res.reservation_date,
            res.workstation_id
          );

          if (waitingMatch) {
            NotificationService.sendNotification(
              waitingMatch.user_id,
              'Poste Libéré — Offre Liste d\'Attente',
              `Un poste dans le cluster ${res.cluster_name || res.cluster_id} s'est libéré suite à un no-show pour le ${res.reservation_date}. Offre envoyée (priorité FIFO).`,
              'info'
            );
          }

          NotificationService.sendNotification(
            res.user_id,
            'No-Show Détecté — Clean Desk Policy',
            `Votre réservation sur ${res.workstation_code} a été annulée suite à un no-show après ${noShowDelay} minutes sans check-in.`,
            'warning'
          );

          await AuditRepository.logEvent(
            'NO_SHOW_DETECTED',
            'system',
            'Système XFactory',
            'admin',
            res.workstation_code,
            `Réservation ${res.id} marquée no-show. Poste ${res.workstation_code} libéré automatiquement.`
          );

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('xfactory_noshow_detected', { detail: res }));
            window.dispatchEvent(new CustomEvent('xfactory_reservations_changed'));
          }
        }
      }
    }

    return detectedCount;
  }

  public static getNoShowStats() {
    const reservations = ReservationRepository.getAllReservations();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);

    let today = 0;
    let thisWeek = 0;
    const perCluster: Record<string, number> = {};

    // Synchronous stats calculation from cache if async pending
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('xfactory_reservations_v2');
      if (cached) {
        const list: Reservation[] = JSON.parse(cached);
        list.forEach((res) => {
          if (res.status === 'no-show') {
            const resDate = new Date(res.reservation_date);
            if (resDate >= startOfDay) today++;
            if (resDate >= startOfWeek) thisWeek++;

            perCluster[res.cluster_id] = (perCluster[res.cluster_id] || 0) + 1;
          }
        });
      }
    }

    return { today, thisWeek, perCluster };
  }
}
