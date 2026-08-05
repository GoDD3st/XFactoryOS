import { UserNotification } from '@/frontend/src/types';
import { NotificationRepository } from '@/database/repositories/notificationRepository';
import { AuditRepository } from '@/database/repositories/auditRepository';

const STORAGE_KEY = 'xfactory_notifications';

export async function getNotifications(userId?: string): Promise<UserNotification[]> {
  try {
    const fromDb = await NotificationRepository.getNotificationsForUser(userId);
    if (fromDb.length > 0) {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fromDb));
      }
      return fromDb;
    }
  } catch (err) {
    console.error('Error loading notifications from DB:', err);
  }

  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  }
  return [];
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

export async function sendNotification(
  user_id: string,
  title: string,
  message: string,
  type: 'info' | 'warning' | 'success' | 'alert' = 'info',
  reservationId?: string
): Promise<UserNotification> {
  const dbNotif = await NotificationRepository.createNotification(user_id, title, message, type, reservationId);

  const newNotif: UserNotification = dbNotif || {
    id: `notif-${Date.now()}`,
    user_id,
    title,
    message,
    type,
    read: false,
    created_at: new Date().toISOString(),
  };

  const current = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as UserNotification[]
    : [];
  saveNotifications([newNotif, ...current]);

  await AuditRepository.logEvent(
    'NOTIFICATION_SENT',
    user_id,
    'Système XFactory',
    'admin',
    user_id,
    `Notification "${title}" envoyée à l'utilisateur ${user_id}`
  );

  return newNotif;
}

export async function markAsRead(id: string): Promise<void> {
  await NotificationRepository.markAsRead(id);

  const current = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as UserNotification[]
    : [];
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
