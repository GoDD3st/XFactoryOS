import { supabase } from './client';

export type RealtimeCallback = (payload: any) => void;

export class RealtimeSyncService {
  private static channel: any = null;

  /**
   * Subscribe to live Supabase Postgres database changes
   */
  static subscribeToDatabaseChanges(onReservationChange?: RealtimeCallback, onWorkstationChange?: RealtimeCallback): void {
    if (this.channel) return;

    this.channel = supabase
      .channel('xfactory-realtime-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations' },
        (payload) => {
          console.log('Real-time Supabase Event [reservations]:', payload);
          if (onReservationChange) onReservationChange(payload);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('xfactory_reservations_changed'));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workstations' },
        (payload) => {
          console.log('Real-time Supabase Event [workstations]:', payload);
          if (onWorkstationChange) onWorkstationChange(payload);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('xfactory_workstations_changed'));
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Supabase Realtime Channel Subscribed successfully.');
        }
      });
  }

  static unsubscribe(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}
