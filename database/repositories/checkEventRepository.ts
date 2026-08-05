import { supabase } from '../client';

export type CheckEventType = 'CHECK_IN' | 'CHECK_OUT' | 'AUTO_CHECK_OUT';

export class CheckEventRepository {
  static async logEvent(
    reservationId: string,
    eventType: CheckEventType,
    actorId?: string,
    metadata?: Record<string, unknown>
  ): Promise<boolean> {
    try {
      const { error } = await supabase.from('check_events').insert({
        reservation_id: reservationId,
        event_type: eventType,
        actor_id: actorId || null,
        occurred_at: new Date().toISOString(),
        metadata: metadata || {},
      });

      return !error;
    } catch (err) {
      console.warn('Check event DB notice:', err);
      return false;
    }
  }

  static async getEventsForReservation(reservationId: string) {
    try {
      const { data, error } = await supabase
        .from('check_events')
        .select('*')
        .eq('reservation_id', reservationId)
        .order('occurred_at', { ascending: true });

      if (error || !data) return [];
      return data;
    } catch {
      return [];
    }
  }
}
