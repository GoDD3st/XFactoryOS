import { WaitingListEntry } from '@/frontend/src/types';
import { WaitingListRepository } from '@/database/repositories/waitingListRepository';
import { sendNotification } from '../notifications/notificationService';

export class WaitingListService {
  static getWaitingList(): WaitingListEntry[] {
    WaitingListRepository.getWaitingList().then((data) => {
      if (typeof window !== 'undefined' && data.length > 0) {
        localStorage.setItem('xfactory_waiting_list_v2', JSON.stringify(data));
      }
    });

    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('xfactory_waiting_list_v2');
      if (cached) return JSON.parse(cached);
    }
    return [];
  }

  static async addToWaitingList(payload: Omit<WaitingListEntry, 'id' | 'created_at' | 'status'>): Promise<WaitingListEntry> {
    const newEntry = await WaitingListRepository.addEntry(payload);

    if (typeof window !== 'undefined') {
      const current = this.getWaitingList();
      localStorage.setItem('xfactory_waiting_list_v2', JSON.stringify([newEntry, ...current]));
      window.dispatchEvent(new CustomEvent('xfactory_waiting_list_changed'));
    }

    return newEntry;
  }

  static async cancelWaitingListEntry(id: string): Promise<boolean> {
    const success = await WaitingListRepository.cancelEntry(id);
    if (typeof window !== 'undefined') {
      const current = this.getWaitingList().filter((e) => e.id !== id);
      localStorage.setItem('xfactory_waiting_list_v2', JSON.stringify(current));
      window.dispatchEvent(new CustomEvent('xfactory_waiting_list_changed'));
    }
    return success;
  }

  static async processWaitingListFIFO(clusterCode: string, date: string, workstationId?: string): Promise<WaitingListEntry | null> {
    const list = await WaitingListRepository.getWaitingList();
    const match = list.find((e) => e.cluster_preference === clusterCode && e.status === 'waiting');

    if (match) {
      match.status = 'offered';
      await WaitingListRepository.markOffered(match.id, workstationId);

      await sendNotification(
        match.user_id,
        'Poste Disponible',
        `Un poste vient de se libérer dans le cluster ${clusterCode} que vous attendiez. Réservez-le rapidement avant expiration de l'offre.`,
        'info'
      );

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('xfactory_waiting_list_changed'));
      }

      return match;
    }
    return null;
  }

  /**
   * BPMN D5 GWRESP "ACCEPTE" branch — converts an active, unexpired offer into a real
   * CONFIRMED reservation and removes the entry from the FIFO queue.
   */
  static async acceptOffer(entryId: string, userId: string): Promise<import('@/frontend/src/types').Reservation> {
    const list = await WaitingListRepository.getWaitingList();
    const entry = list.find((e) => e.id === entryId);

    if (!entry) throw new Error("Entrée de liste d'attente introuvable.");
    if (entry.user_id !== userId) throw new Error("Vous ne pouvez accepter que votre propre offre.");
    if (entry.status !== 'offered') throw new Error("Cette offre n'est plus active.");
    if (entry.offer_expires_at && new Date(entry.offer_expires_at).getTime() < Date.now()) {
      await WaitingListRepository.markExpired(entry.id);
      throw new Error("L'offre a expiré — elle a été proposée à la personne suivante.");
    }
    if (!entry.offered_workstation_id || !entry.offered_workstation_code) {
      throw new Error('Aucun poste associé à cette offre.');
    }

    const { ReservationService } = await import('../reservations/reservationService');
    const [startTime, endTime] = entry.time_slot.split('-').map((t) => t.trim());

    const reservation = await ReservationService.createReservation({
      user_id: entry.user_id,
      user_name: entry.user_name,
      user_department: entry.user_department,
      workstation_id: entry.offered_workstation_id,
      workstation_code: entry.offered_workstation_code,
      cluster_name: entry.cluster_preference,
      reservation_date: entry.reservation_date,
      start_time: startTime || '08:00',
      end_time: endTime || '18:00',
      purpose: "Attribution liste d'attente FIFO",
      notes: entry.notes,
    });

    await WaitingListRepository.markAccepted(entry.id);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('xfactory_waiting_list_changed'));
    }

    return reservation;
  }

  /** BPMN D5 GWRESP "REFUSE" branch — declines the offer and cascades to the next FIFO entry. */
  static async declineOffer(entryId: string, userId: string): Promise<boolean> {
    const list = await WaitingListRepository.getWaitingList();
    const entry = list.find((e) => e.id === entryId);
    if (!entry) throw new Error("Entrée de liste d'attente introuvable.");
    if (entry.user_id !== userId) throw new Error("Vous ne pouvez refuser que votre propre offre.");

    await WaitingListRepository.markExpired(entry.id);

    if (entry.cluster_preference) {
      await this.processWaitingListFIFO(entry.cluster_preference, entry.reservation_date, entry.offered_workstation_id);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('xfactory_waiting_list_changed'));
    }

    return true;
  }

  /**
   * BPMN D5 GWRESP "expire" branch — background sweep for offers whose expiry window has
   * passed with no response, historizes the expiration, and cascades the offer to whoever is
   * next in the FIFO queue for that cluster/date.
   */
  static async expireStaleOffers(): Promise<number> {
    const list = await WaitingListRepository.getWaitingList();
    const now = Date.now();
    let expiredCount = 0;

    for (const entry of list) {
      if (entry.status === 'offered' && entry.offer_expires_at && new Date(entry.offer_expires_at).getTime() < now) {
        await WaitingListRepository.markExpired(entry.id);
        expiredCount++;

        await sendNotification(
          entry.user_id,
          'Offre Expirée',
          `Votre offre pour un poste dans ${entry.cluster_preference || "l'Open Space"} a expiré faute de réponse dans le délai imparti.`,
          'warning'
        );

        if (entry.cluster_preference) {
          await this.processWaitingListFIFO(entry.cluster_preference, entry.reservation_date, entry.offered_workstation_id);
        }
      }
    }

    return expiredCount;
  }
}

export const getWaitingList = WaitingListService.getWaitingList.bind(WaitingListService);
export const addToWaitingList = WaitingListService.addToWaitingList.bind(WaitingListService);
export const cancelWaitingListEntry = WaitingListService.cancelWaitingListEntry.bind(WaitingListService);
export const processWaitingListFIFO = WaitingListService.processWaitingListFIFO.bind(WaitingListService);
export const acceptWaitingListOffer = WaitingListService.acceptOffer.bind(WaitingListService);
export const declineWaitingListOffer = WaitingListService.declineOffer.bind(WaitingListService);
export const expireStaleWaitingListOffers = WaitingListService.expireStaleOffers.bind(WaitingListService);
