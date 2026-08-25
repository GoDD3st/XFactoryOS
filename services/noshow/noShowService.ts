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
  /**
   * Releases desks whose holder never arrived. The heart of BPMN D4, and the trigger for D5.
   *
   * Business context: the problem this whole system exists to solve is a desk that is booked,
   * empty, and therefore unusable by anyone else. A booking with no check-in more than
   * settings.noShowDelayMinutes after its start is treated as abandoned, released, and offered to
   * whoever is waiting.
   *
   * Flow, per reservation still sitting at 'confirmée':
   *   1. Compare now against reservation_date + start_time.
   *   2. Past the grace period → status 'no-show'.
   *   3. Workstation back to 'disponible'.
   *   4. Hand the freed slot to the waiting-list matcher (BPMN D5).
   *
   * THE SLOT HANDED OVER IS THE WHOLE BOOKED SLOT, not the remaining hours. A no-show forfeits
   * the entire booking, so the whole window is what the desk is free for - and the matcher needs
   * those exact hours so it does not offer 08:00-18:00 to somebody who only queued for the
   * afternoon.
   *
   * WHY THIS RUNS ON A TIMER RATHER THAN ON READ: a desk is not released by someone looking at
   * it. Nobody may open the app between 09:30 and the end of the day, and the desk still has to
   * become available. This is also why the sweep is the one background job that must not be
   * switched off - see README §16 and SETUP.md. Without it a freed desk never reaches the queue
   * and the waiting list simply never fires.
   *
   * Idempotent: it only ever acts on 'confirmée', so a reservation already marked no-show is
   * skipped on the next pass. Safe to run more often than necessary, which is what makes an
   * external scheduler with imprecise timing acceptable.
   *
   * @returns how many reservations were marked, for the sweep's log line.
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

          // Offer the freed desk to the queue. processWaitingListFIFO resolves whichever cluster
          // identifier this reservation carries (uuid or name) to the cluster code that entries
          // are stored with, and prefers anyone queuing for this exact desk.
          //
          // It sends its own notification naming the seat and the 15-minute expiry, so the extra
          // generic "Poste Libéré" message that used to fire here was removed - it duplicated the
          // offer for the same user with strictly less information.
          //
          // A no-show forfeits the whole booked slot, so that slot is exactly what the desk is
          // free for - the matcher needs it to avoid offering these hours to someone who queued
          // for a different part of the day.
          await WaitingListService.processWaitingListFIFO(
            res.cluster_id || res.cluster_name,
            res.reservation_date,
            res.workstation_id,
            { start: res.start_time, end: res.end_time }
          );

          NotificationService.sendNotification(
            res.user_id,
            'No-Show Détecté - Clean Desk Policy',
            `Votre réservation sur ${res.workstation_code} a été annulée suite à un no-show après ${noShowDelay} minutes sans check-in.`,
            'warning'
          );

          await AuditRepository.logEvent(
            'NO_SHOW',
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

  /**
   * FR-67 "alimenter le KPI no-show" - was previously synchronous and, on the server
   * (GET /api/noshow/stats), always returned zeros: it read `ReservationRepository
   * .getAllReservations()` without awaiting it, then computed from `localStorage`, which
   * doesn't exist server-side. Now a proper async live query, usable from both contexts.
   */
  public static async getNoShowStats(): Promise<{ today: number; thisWeek: number; perCluster: Record<string, number> }> {
    const reservations = await ReservationRepository.getAllReservations();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);

    let today = 0;
    let thisWeek = 0;
    const perCluster: Record<string, number> = {};

    reservations.forEach((res) => {
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
