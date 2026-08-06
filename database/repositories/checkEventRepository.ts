import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../client';

// Must match the Postgres enum check_event_type exactly (CHECK_IN, CHECK_OUT_MANUAL,
// CHECK_OUT_AUTO, NO_SHOW_RELEASE) — any other value fails the insert with an invalid-enum error.
export type CheckEventType = 'CHECK_IN' | 'CHECK_OUT_MANUAL' | 'CHECK_OUT_AUTO' | 'NO_SHOW_RELEASE';

async function resolveClient(): Promise<SupabaseClient> {
  if (typeof window === 'undefined') {
    const { getAdminClient } = await import('../serverClient');
    const admin = getAdminClient();
    if (admin) return admin;
  }
  return supabase;
}

export class CheckEventRepository {
  static async logEvent(
    reservationId: string,
    eventType: CheckEventType,
    actorId?: string,
    metadata?: Record<string, unknown>
  ): Promise<boolean> {
    try {
      const db = await resolveClient();
      const { error } = await db.from('check_events').insert({
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
      const db = await resolveClient();
      const { data, error } = await db
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
