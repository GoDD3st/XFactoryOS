import { WaitingListEntry } from '@/frontend/src/types';
import { WaitingListRepository } from '@/database/repositories/waitingListRepository';
import { sendNotification } from '../notifications/notificationService';
import { selectNextCompatibleEntry, parseTimeSlot, TimeWindow } from './preferenceMatching';

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

  /**
   * Resolves whatever a caller happens to hold for a cluster - a uuid, a code, or a display
   * name - to the cluster CODE, which is what waiting-list entries carry in cluster_preference.
   *
   * This mismatch is why the cascade never ran: entries store `clusters.code` ("CL-A"), while
   * every caller passed `reservation.cluster_id` (a uuid) or `cluster_name` ("Cluster A"). The
   * equality test could not match, so the offer was silently never sent and the queue simply
   * never advanced on a no-show.
   */
  private static async resolveClusterCode(clusterRef?: string): Promise<string | undefined> {
    if (!clusterRef) return undefined;
    try {
      const { WorkstationRepository } = await import('@/database/repositories/workstationRepository');
      const clusters = await WorkstationRepository.getClusters();
      const match = clusters.find(
        (c) => c.id === clusterRef || c.code === clusterRef || c.name === clusterRef
      );
      return match?.code || clusterRef;
    } catch {
      return clusterRef;
    }
  }

  /**
   * Looks up the freed desk's attributes so the matcher can check "zone / equipement" against
   * them. Returns undefined if the seat can't be resolved - the matcher then treats the desk as
   * having no attributes, so any entry that asked for one is passed over rather than handed a
   * desk that might not have it.
   */
  private static async loadSeatAttributes(
    workstationId?: string
  ): Promise<import('@/frontend/src/types').WorkstationMetadata | undefined> {
    if (!workstationId) return undefined;
    try {
      const { WorkstationRepository } = await import('@/database/repositories/workstationRepository');
      const byCluster = await WorkstationRepository.getWorkstations();
      for (const seats of Object.values(byCluster)) {
        const seat = seats.find((s) => s.id === workstationId);
        if (seat) return seat.metadata;
      }
    } catch {
      /* fall through - treated as "no known attributes" */
    }
    return undefined;
  }

  /**
   * The shortest offer worth making, and the business day an unbounded freed window is clamped
   * to. Falls back to the documented defaults when settings can't be read, so a settings outage
   * degrades the cascade rather than stopping it.
   */
  private static async resolveOfferBounds(): Promise<{ minOfferMinutes: number; businessDay: TimeWindow }> {
    try {
      const { SettingsRepository } = await import('@/database/repositories/settingsRepository');
      const settings = await SettingsRepository.getSettings();
      return {
        minOfferMinutes: settings?.minReservationMinutes || 30,
        businessDay: {
          start: settings?.workingHoursStart || '08:00',
          end: settings?.workingHoursEnd || '18:00',
        },
      };
    } catch {
      return { minOfferMinutes: 30, businessDay: { start: '08:00', end: '18:00' } };
    }
  }

  /**
   * BPMN D5 MATCH + GWMATCH - offers a freed desk to the first person in line it actually suits.
   *
   * Priority is seat-first: someone who queued for THIS exact desk outranks someone waiting on the
   * cluster generally, because the seat-specific queue is the only route into a desk booked for
   * the whole day. Within each group the queue stays FIFO (getWaitingList is ordered by
   * fifo_rank).
   *
   * Compatibility - not just position in the queue - decides who gets the offer. An entry the
   * desk doesn't suit is skipped and stays WAITING (GWMATCH "NON" → WAIT); it is not resolved and
   * does not lose its place. See preferenceMatching.ts for the rules.
   *
   * `freedWindow` is the hours the desk is actually free for; either end may be omitted and is
   * then clamped to the business day. A no-show frees the whole booked slot, a manual check-out
   * frees from now until the booking would have ended, and an auto check-out frees everything
   * after the booking's end time.
   */
  static async processWaitingListFIFO(
    clusterRef: string | undefined,
    date: string,
    workstationId?: string,
    freedWindow?: Partial<TimeWindow>
  ): Promise<WaitingListEntry | null> {
    if (!workstationId) return null;

    const list = await WaitingListRepository.getWaitingList();
    const clusterCode = await this.resolveClusterCode(clusterRef);
    const [attributes, bounds] = await Promise.all([
      this.loadSeatAttributes(workstationId),
      this.resolveOfferBounds(),
    ]);

    const waiting = list.filter((e) => e.status === 'waiting');

    const selection = selectNextCompatibleEntry(
      waiting,
      {
        workstationId,
        clusterCode,
        date,
        window: {
          start: freedWindow?.start || bounds.businessDay.start,
          end: freedWindow?.end || bounds.businessDay.end,
        },
        attributes,
      },
      bounds.minOfferMinutes
    );

    if (!selection) return null;

    const { entry: match, grantedWindow } = selection;

    match.status = 'offered';
    match.offered_time_slot = `${grantedWindow.start} - ${grantedWindow.end}`;
    await WaitingListRepository.markOffered(match.id, workstationId, 15, {
      date,
      start: grantedWindow.start,
      end: grantedWindow.end,
    });

    // Name the hours in the notification: the offer may cover only part of what was requested,
    // and someone who queued 08:00-18:00 needs to see that they are being offered 14:00-18:00
    // before they accept it.
    const seatLabel = match.requested_workstation_code || 'un poste';
    const hours = `${grantedWindow.start} - ${grantedWindow.end}`;
    await sendNotification(
      match.user_id,
      'Poste Disponible',
      match.requested_workstation_id
        ? `Le poste ${seatLabel} que vous attendiez est libre de ${hours}. Acceptez l'offre rapidement - elle expire dans 15 minutes et sera proposée à la personne suivante.`
        : `Un poste vient de se libérer de ${hours} dans le cluster ${clusterCode || "l'Open Space"} que vous attendiez. Réservez-le rapidement avant expiration de l'offre.`,
      'info'
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('xfactory_waiting_list_changed'));
    }

    return match;
  }

  /**
   * BPMN D5 GWRESP "ACCEPTE" branch - converts an active, unexpired offer into a real
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
      throw new Error("L'offre a expiré - elle a été proposée à la personne suivante.");
    }
    if (!entry.offered_workstation_id || !entry.offered_workstation_code) {
      throw new Error('Aucun poste associé à cette offre.');
    }

    const { ReservationService } = await import('../reservations/reservationService');

    // Book the hours the offer was made for, not the hours originally requested. The desk may
    // only have freed up for part of the requested slot - a check-out at 14:00 on a desk someone
    // queued 08:00-18:00 for offers 14:00-18:00 - and booking the requested slot would have
    // written a reservation over hours the desk was still occupied.
    //
    // offered_time_slot is absent only for offers made before this column existed; those fall
    // back to the requested slot, which is the behaviour they were created under.
    const { start: slotStart, end: slotEnd } = parseTimeSlot(entry.offered_time_slot || entry.time_slot);

    // The desk is offered because the previous holder no-showed, which is only detected
    // no_show_window_minutes AFTER the slot began. Reusing the original start time would hand the
    // accepter a check-in clock that already expired, and the very next no-show sweep would mark
    // THEM absent before they could reach the desk. Start the booking at acceptance instead, so
    // the grace period is measured from now.
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const effectiveStart =
      entry.reservation_date === today && nowHHMM > slotStart ? nowHHMM : slotStart;

    if (effectiveStart >= slotEnd) {
      await WaitingListRepository.markExpired(entry.id);
      throw new Error("Le créneau de ce poste est déjà terminé - l'offre a été clôturée.");
    }

    const reservation = await ReservationService.createReservation({
      user_id: entry.user_id,
      user_name: entry.user_name,
      user_department: entry.user_department,
      workstation_id: entry.offered_workstation_id,
      workstation_code: entry.offered_workstation_code,
      cluster_name: entry.cluster_preference,
      reservation_date: entry.reservation_date,
      start_time: effectiveStart,
      end_time: slotEnd,
      purpose: "Attribution liste d'attente FIFO",
      notes: entry.notes,
    });

    await WaitingListRepository.markAccepted(entry.id);

    await sendNotification(
      entry.user_id,
      'Poste attribué - check-in requis',
      `Le poste ${entry.offered_workstation_code} vous est attribué jusqu'à ${slotEnd}. Effectuez le check-in sur place : sans scan, la réservation sera marquée no-show et le poste repartira à la personne suivante.`,
      'info'
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('xfactory_waiting_list_changed'));
    }

    return reservation;
  }

  /** BPMN D5 GWRESP "REFUSE" branch - declines the offer and cascades to the next FIFO entry. */
  static async declineOffer(entryId: string, userId: string): Promise<boolean> {
    const list = await WaitingListRepository.getWaitingList();
    const entry = list.find((e) => e.id === entryId);
    if (!entry) throw new Error("Entrée de liste d'attente introuvable.");
    if (entry.user_id !== userId) throw new Error("Vous ne pouvez refuser que votre propre offre.");

    await WaitingListRepository.markExpired(entry.id);

    // Cascade on the seat as well as the cluster: a seat-specific entry may carry no cluster
    // preference, and guarding on cluster alone would stall the queue for that desk. The desk is
    // free for exactly the window that was just declined, so re-offer that window rather than the
    // whole day.
    if (entry.offered_workstation_id) {
      await this.processWaitingListFIFO(
        entry.cluster_preference,
        entry.reservation_date,
        entry.offered_workstation_id,
        entry.offered_time_slot ? parseTimeSlot(entry.offered_time_slot) : undefined
      );
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('xfactory_waiting_list_changed'));
    }

    return true;
  }

  /**
   * BPMN D5 GWRESP "expire" branch - background sweep for offers whose expiry window has
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

        if (entry.offered_workstation_id) {
          await this.processWaitingListFIFO(
            entry.cluster_preference,
            entry.reservation_date,
            entry.offered_workstation_id,
            entry.offered_time_slot ? parseTimeSlot(entry.offered_time_slot) : undefined
          );
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
