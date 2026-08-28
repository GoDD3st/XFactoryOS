import { UserNotification } from '@/frontend/src/types';
import { NotificationRepository } from '@/database/repositories/notificationRepository';

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

  // Not logged to audit_logs: SRS §26.1's audited-action list doesn't include routine
  // notification delivery (it's already tracked with its own status/timestamps in
  // `notifications`), and every reservation/approval/no-show event sends one, which would
  // flood the audit trail with noise unrelated to governance/security traceability.

  return newNotif;
}

/**
 * Sends the same informational message to every holder of one or more roles.
 *
 * For site-wide facts that concern a desk rather than a person - "this reservation has ended,
 * the workstation should be free again". Server-only: it needs the service-role client to read
 * user_roles, and returns 0 rather than throwing when that client is absent, because an
 * undelivered courtesy notice must never fail the operation that produced it.
 *
 * `roleCodes` are the DATABASE role codes (upper snake case), not the application's role ids.
 */
export async function notifyRoles(
  roleCodes: string[],
  title: string,
  message: string,
  type: 'info' | 'warning' | 'success' | 'alert' = 'info',
  reservationId?: string
): Promise<number> {
  if (typeof window !== 'undefined' || roleCodes.length === 0) return 0;

  try {
    const { getAdminClient } = await import('@/database/serverClient');
    const admin = getAdminClient();
    if (!admin) return 0;

    const { data } = await admin
      .from('user_roles')
      .select('user_id, roles!inner(code)')
      .in('roles.code', roleCodes);

    const ids = Array.from(new Set((data || []).map((r: any) => r.user_id).filter(Boolean)));
    await Promise.all(ids.map((id) => sendNotification(id as string, title, message, type, reservationId)));
    return ids.length;
  } catch (err) {
    console.warn('[Notifications] Role broadcast failed:', err);
    return 0;
  }
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
