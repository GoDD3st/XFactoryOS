import { UserNotification } from '@/frontend/src/types';

const STORAGE_KEY = 'xfactory_notifications';

const INITIAL_NOTIFICATIONS: UserNotification[] = [
  {
    id: 'notif-1',
    user_id: 'usr-1',
    title: 'Rappel Check-in XFactory',
    message: 'Votre réservation sur CL-A-02 commence dans 15 minutes. N\'oubliez pas d\'effectuer votre check-in.',
    type: 'info',
    read: false,
    created_at: new Date(Date.now() - 900000).toISOString(),
  },
  {
    id: 'notif-2',
    user_id: 'usr-3',
    title: 'Demande en attente d\'approbation',
    message: 'Votre réservation de longue durée sur CL-C-03 est en attente d\'approbation par la Direction.',
    type: 'warning',
    read: false,
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'notif-3',
    user_id: 'usr-5',
    title: 'Poste disponible - Liste d\'attente',
    message: 'Un poste s\'est libéré dans le cluster CL-A. Veuillez confirmer votre réservation.',
    type: 'success',
    read: true,
    created_at: new Date(Date.now() - 7200000).toISOString(),
  },
];

export function getNotifications(): UserNotification[] {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_NOTIFICATIONS));
    }
  } catch (err) {
    console.error('Error loading notifications:', err);
  }
  return INITIAL_NOTIFICATIONS;
}

export function saveNotifications(notifications: UserNotification[]): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
      window.dispatchEvent(new CustomEvent('xfactory_notifications_changed', { detail: notifications }));
    }
  } catch (err) {
    console.error('Error saving notifications:', err);
  }
}

export function sendNotification(
  user_id: string,
  title: string,
  message: string,
  type: 'info' | 'warning' | 'success' | 'alert' = 'info'
): UserNotification {
  const newNotif: UserNotification = {
    id: `notif-${Date.now()}`,
    user_id,
    title,
    message,
    type,
    read: false,
    created_at: new Date().toISOString(),
  };

  const current = getNotifications();
  saveNotifications([newNotif, ...current]);
  return newNotif;
}

export function markAsRead(id: string): void {
  const current = getNotifications();
  const index = current.findIndex((n) => n.id === id);
  if (index !== -1) {
    current[index].read = true;
    saveNotifications(current);
  }
}

export class NotificationService {
  static getNotifications = getNotifications;
  static sendNotification = sendNotification;
  static markAsRead = markAsRead;
}
