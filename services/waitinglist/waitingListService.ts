import { WaitingListEntry } from '@/frontend/src/types';
import { WaitingListRepository } from '@/database/repositories/waitingListRepository';

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

  static async processWaitingListFIFO(clusterCode: string, date: string): Promise<WaitingListEntry | null> {
    const list = await WaitingListRepository.getWaitingList();
    const match = list.find((e) => e.cluster_preference === clusterCode && e.status === 'waiting');

    if (match) {
      match.status = 'offered';
      await WaitingListRepository.cancelEntry(match.id);
      return match;
    }
    return null;
  }
}

export const getWaitingList = WaitingListService.getWaitingList.bind(WaitingListService);
export const addToWaitingList = WaitingListService.addToWaitingList.bind(WaitingListService);
export const cancelWaitingListEntry = WaitingListService.cancelWaitingListEntry.bind(WaitingListService);
export const processWaitingListFIFO = WaitingListService.processWaitingListFIFO.bind(WaitingListService);
