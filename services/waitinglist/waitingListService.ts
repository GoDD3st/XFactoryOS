import { WaitingListEntry } from '@/frontend/src/types';

const STORAGE_KEY = 'xfactory_waiting_list';

const INITIAL_WAITING_LIST: WaitingListEntry[] = [
  {
    id: 'wl-001',
    user_id: 'usr-05',
    user_name: 'Mehdi Naciri',
    user_department: 'Digital Factory',
    cluster_preference: 'CL-A',
    reservation_date: new Date().toISOString().split('T')[0],
    time_slot: '09:00 - 17:00',
    notes: 'Session travail sur jumeau numérique',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    status: 'waiting',
  },
  {
    id: 'wl-002',
    user_id: 'usr-06',
    user_name: 'Khadija Chraibi',
    user_department: 'GCI Governance',
    cluster_preference: 'CL-E',
    reservation_date: new Date().toISOString().split('T')[0],
    time_slot: '14:00 - 18:00',
    notes: 'Revue de gouvernance chimie Safi',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    status: 'waiting',
  },
];

export function getWaitingList(): WaitingListEntry[] {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_WAITING_LIST));
    }
  } catch (err) {
    console.error('Error loading waiting list:', err);
  }
  return INITIAL_WAITING_LIST;
}

export function saveWaitingList(list: WaitingListEntry[]): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('xfactory_waiting_list_changed', { detail: list }));
    }
  } catch (err) {
    console.error('Error saving waiting list:', err);
  }
}

export async function addToWaitingList(
  payload: Omit<WaitingListEntry, 'id' | 'created_at' | 'status'>
): Promise<WaitingListEntry> {
  const newEntry: WaitingListEntry = {
    ...payload,
    id: `wl-${Date.now()}`,
    created_at: new Date().toISOString(),
    status: 'waiting',
  };

  const list = getWaitingList();
  const updated = [...list, newEntry];
  saveWaitingList(updated);
  return newEntry;
}

export async function cancelWaitingListEntry(id: string): Promise<boolean> {
  const list = getWaitingList();
  const updated = list.filter((item) => item.id !== id);
  saveWaitingList(updated);
  return true;
}

export async function processWaitingListFIFO(
  clusterCode: string,
  date: string
): Promise<WaitingListEntry | null> {
  const list = getWaitingList();
  const matchIndex = list.findIndex(
    (item) =>
      item.status === 'waiting' &&
      item.reservation_date === date &&
      (!item.cluster_preference || item.cluster_preference === clusterCode)
  );

  if (matchIndex !== -1) {
    list[matchIndex].status = 'offered';
    saveWaitingList(list);
    return list[matchIndex];
  }
  return null;
}

export class WaitingListService {
  static getWaitingList = getWaitingList;
  static addToWaitingList = addToWaitingList;
  static cancelWaitingListEntry = cancelWaitingListEntry;
  static processWaitingListFIFO = processWaitingListFIFO;
}
