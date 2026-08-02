import { supabase } from '../client';
import { WaitingListEntry } from '@/frontend/src/types';

export class WaitingListRepository {
  static async getWaitingList(): Promise<WaitingListEntry[]> {
    try {
      const { data, error } = await supabase
        .from('waiting_list_entries')
        .select('*')
        .order('fifo_rank', { ascending: true });

      if (error || !data) return [];

      return data.map((e: any) => ({
        id: e.id,
        user_id: e.user_id,
        user_name: e.user_name || 'Collaborateur Safi',
        user_department: e.user_department || 'Digital Factory',
        cluster_preference: e.preferred_cluster_code || 'CL-A',
        reservation_date: e.requested_start_at
          ? new Date(e.requested_start_at).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        time_slot: '08:30 - 17:30',
        status: e.status === 'OFFERED' ? 'offered' : e.status === 'EXPIRED' ? 'expired' : e.status === 'FULFILLED' ? 'fulfilled' : 'waiting',
        created_at: e.created_at,
        notes: e.notes,
      }));
    } catch (err) {
      console.warn('Fetch waiting list fallback:', err);
      return [];
    }
  }

  static async addEntry(payload: Partial<WaitingListEntry>): Promise<WaitingListEntry> {
    const startAt = new Date().toISOString();
    const endAt = new Date(Date.now() + 8 * 3600000).toISOString();

    const { data } = await supabase
      .from('waiting_list_entries')
      .insert({
        user_id: payload.user_id || '00000000-0000-0000-0000-000000000000',
        space_id: '00000000-0000-0000-0000-000000000000',
        requested_start_at: startAt,
        requested_end_at: endAt,
        status: 'WAITING',
      })
      .select()
      .single();

    return {
      id: data?.id || `wait_${Date.now()}`,
      user_id: payload.user_id || 'usr-current',
      user_name: payload.user_name || 'Collaborateur Safi',
      user_department: payload.user_department || 'Digital Factory',
      cluster_preference: payload.cluster_preference || 'CL-A',
      reservation_date: payload.reservation_date || new Date().toISOString().split('T')[0],
      time_slot: payload.time_slot || '08:30 - 17:30',
      status: 'waiting',
      created_at: new Date().toISOString(),
      notes: payload.notes,
    };
  }

  static async cancelEntry(id: string): Promise<boolean> {
    try {
      await supabase.from('waiting_list_entries').delete().eq('id', id);
      return true;
    } catch (err) {
      return false;
    }
  }
}
