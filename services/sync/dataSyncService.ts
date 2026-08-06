import { RealtimeSyncService } from '@/database/realtime';
import { ReservationService } from '../reservations/reservationService';
import { AuditRepository } from '@/database/repositories/auditRepository';
import { apiFetchNotifications } from '../api/notificationApi';

const NOTIFICATIONS_CACHE_KEY = 'xfactory_notifications';
const AUDIT_CACHE_KEY = 'xfactory_audit_logs_v2';

/**
 * Boot-time sync: pull authoritative state from Supabase and subscribe to realtime changes.
 */
export class DataSyncService {
  private static initialized = false;

  static async initialize(userId?: string): Promise<void> {
    if (typeof window === 'undefined') return;

    await this.syncAll(userId);

    if (!this.initialized) {
      RealtimeSyncService.subscribeToDatabaseChanges(
        async () => {
          await ReservationService.syncFromDatabase();
        },
        async () => {
          window.dispatchEvent(new CustomEvent('xfactory_workstations_changed'));
        }
      );
      this.initialized = true;
    }
  }

  static async syncAll(userId?: string): Promise<void> {
    await ReservationService.syncFromDatabase();

    const auditLogs = await AuditRepository.getAuditLogs();
    if (auditLogs.length > 0) {
      localStorage.setItem(AUDIT_CACHE_KEY, JSON.stringify(auditLogs));
      window.dispatchEvent(new CustomEvent('xfactory_audit_logged'));
    }

    const notifications = await apiFetchNotifications();
    if (notifications.length > 0) {
      localStorage.setItem(NOTIFICATIONS_CACHE_KEY, JSON.stringify(notifications));
      window.dispatchEvent(new CustomEvent('xfactory_notifications_changed', { detail: notifications }));
    }
  }
}
