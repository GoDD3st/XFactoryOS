import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../client';
import { UserNotification } from '@/frontend/src/types';

const TYPE_TO_EVENT: Record<string, string> = {
  info: 'INFO',
  warning: 'WARNING',
  success: 'SUCCESS',
  alert: 'ALERT',
};

// notifications has no anon/authenticated INSERT policy by design (a notification is routinely
// created by the system on behalf of a DIFFERENT user than the caller, e.g. an approver's
// decision notifying the requester - a self-scoped `user_id = auth.uid()` policy can't allow
// that). Server-side callers must use the service-role client to bypass RLS for writes.
async function resolveClient(): Promise<SupabaseClient> {
  if (typeof window === 'undefined') {
    const { getAdminClient } = await import('../serverClient');
    const admin = getAdminClient();
    if (admin) return admin;
  }
  return supabase;
}

export class NotificationRepository {
  static async getNotificationsForUser(userId?: string): Promise<UserNotification[]> {
    try {
      const db = await resolveClient();
      let query = db
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
      if (error || !data) return [];

      return data.map((n: any) => ({
        id: n.id,
        user_id: n.user_id,
        title: n.title,
        message: n.body || '',
        type: this.mapEventToType(n.event_code),
        read: !!n.read_at,
        created_at: n.created_at,
      }));
    } catch (err) {
      console.warn('Fetch notifications fallback:', err);
      return [];
    }
  }

  static async createNotification(
    userId: string,
    title: string,
    message: string,
    type: 'info' | 'warning' | 'success' | 'alert' = 'info',
    reservationId?: string
  ): Promise<UserNotification | null> {
    try {
      const db = await resolveClient();
      const { data, error } = await db
        .from('notifications')
        .insert({
          user_id: userId,
          reservation_id: reservationId || null,
          event_code: TYPE_TO_EVENT[type] || 'INFO',
          channel: 'IN_APP',
          status: 'SENT',
          title,
          body: message,
          sent_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error || !data) return null;

      return {
        id: data.id,
        user_id: data.user_id,
        title: data.title,
        message: data.body || message,
        type,
        read: false,
        created_at: data.created_at,
      };
    } catch (err) {
      console.warn('Create notification DB notice:', err);
      return null;
    }
  }

  /**
   * Dedupe check for tickers that re-scan the same candidates on every tick (e.g. the
   * check-in reminder ticker, which re-evaluates "starts within 15 min" every 60s) - lets
   * the caller send a given (reservation, title) notification at most once.
   */
  static async hasNotificationForReservation(reservationId: string, title: string): Promise<boolean> {
    try {
      const db = await resolveClient();
      const { data } = await db
        .from('notifications')
        .select('id')
        .eq('reservation_id', reservationId)
        .eq('title', title)
        .limit(1)
        .maybeSingle();
      return !!data;
    } catch {
      return false;
    }
  }

  static async markAsRead(id: string): Promise<boolean> {
    try {
      const db = await resolveClient();
      const { error } = await db
        .from('notifications')
        .update({ read_at: new Date().toISOString(), status: 'READ' })
        .eq('id', id);

      return !error;
    } catch {
      return false;
    }
  }

  private static mapEventToType(eventCode?: string): 'info' | 'warning' | 'success' | 'alert' {
    const code = (eventCode || 'INFO').toUpperCase();
    if (code === 'WARNING') return 'warning';
    if (code === 'SUCCESS') return 'success';
    if (code === 'ALERT') return 'alert';
    return 'info';
  }
}
