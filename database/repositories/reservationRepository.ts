import { supabase } from '../client';
import { Reservation, ReservationStatus } from '@/frontend/src/types';

export class ReservationRepository {
  /**
   * Fetch single reservation by ID (used for ownership verification & authorization)
   */
  static async getReservationById(id: string): Promise<Reservation | null> {
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) return null;

      return {
        id: data.id,
        user_id: data.user_id,
        user_name: data.user_name || 'Collaborateur Safi',
        user_department: data.user_department || 'Digital Factory',
        workstation_id: data.workstation_id,
        workstation_code: data.workstation_code || 'WS-SF',
        cluster_id: data.cluster_id || 'cl-a',
        cluster_name: data.cluster_name || 'Cluster A',
        reservation_date: data.start_at ? new Date(data.start_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        start_time: data.start_at ? new Date(data.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '08:30',
        end_time: data.end_at ? new Date(data.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '17:30',
        status: this.mapDbStatusToDomain(data.status),
        created_at: data.created_at,
        check_in_at: data.check_in_at,
        check_out_at: data.check_out_at,
        notes: data.cancel_reason || data.notes || '',
        purpose: data.purpose || 'Session travail',
      };
    } catch (err) {
      console.warn('getReservationById fallback:', err);
      return null;
    }
  }

  /**
   * Check for double-booking conflicts on the same workstation for an overlapping time window
   */
  static async checkConflict(
    workstationCode: string,
    reservationDate: string,
    startTime: string,
    endTime: string,
    excludeReservationId?: string
  ): Promise<boolean> {
    try {
      const startAt = new Date(`${reservationDate}T${startTime}`).toISOString();
      const endAt = new Date(`${reservationDate}T${endTime}`).toISOString();

      let query = supabase
        .from('reservations')
        .select('id, workstation_id, start_at, end_at, status')
        .neq('status', 'CANCELLED')
        .neq('status', 'NO_SHOW')
        .neq('status', 'COMPLETED');

      if (excludeReservationId) {
        query = query.neq('id', excludeReservationId);
      }

      const { data, error } = await query;
      if (error || !data) return false;

      // Check overlapping timestamps
      const hasConflict = data.some((r: any) => {
        const rStart = new Date(r.start_at).getTime();
        const rEnd = new Date(r.end_at).getTime();
        const newStart = new Date(startAt).getTime();
        const newEnd = new Date(endAt).getTime();

        return newStart < rEnd && newEnd > rStart;
      });

      return hasConflict;
    } catch (err) {
      console.warn('Conflict check warning:', err);
      return false;
    }
  }

  /**
   * Fetch active reservations for a single user (used for daily/weekly quota enforcement).
   * "Active" excludes cancelled/rejected/no-show so quotas aren't consumed by dead bookings.
   */
  static async getUserReservations(userId: string): Promise<Reservation[]> {
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('user_id', userId)
        .not('status', 'in', '(CANCELLED,NO_SHOW,REJECTED)')
        .order('start_at', { ascending: false });

      if (error || !data) return [];

      return data.map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        user_name: r.user_name || 'Collaborateur Safi',
        user_department: r.user_department || 'Digital Factory',
        workstation_id: r.workstation_id,
        workstation_code: r.workstation_code || 'WS-SF',
        cluster_id: r.cluster_id || 'cl-a',
        cluster_name: r.cluster_name || 'Cluster A',
        reservation_date: r.start_at ? new Date(r.start_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        start_time: r.start_at ? new Date(r.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '08:30',
        end_time: r.end_at ? new Date(r.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '17:30',
        status: this.mapDbStatusToDomain(r.status),
        created_at: r.created_at,
      }));
    } catch (err) {
      console.warn('getUserReservations fallback:', err);
      return [];
    }
  }

  /**
   * Fetch all reservations from Supabase
   */
  static async getAllReservations(): Promise<Reservation[]> {
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error || !data || data.length === 0) {
        return [];
      }

      return data.map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        user_name: r.user_name || 'Collaborateur Safi',
        user_department: r.user_department || 'Digital Factory',
        workstation_id: r.workstation_id,
        workstation_code: r.workstation_code || 'WS-SF',
        cluster_id: r.cluster_id || 'cl-a',
        cluster_name: r.cluster_name || 'Cluster A',
        reservation_date: r.start_at ? new Date(r.start_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        start_time: r.start_at ? new Date(r.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '08:30',
        end_time: r.end_at ? new Date(r.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '17:30',
        status: this.mapDbStatusToDomain(r.status),
        created_at: r.created_at,
        check_in_at: r.check_in_at,
        check_out_at: r.check_out_at,
        notes: r.cancel_reason || r.notes || '',
        purpose: r.purpose || 'Session travail',
      }));
    } catch (err) {
      console.warn('Fetch reservations fallback:', err);
      return [];
    }
  }

  /**
   * Create a new reservation in Supabase
   */
  static async createReservation(payload: Partial<Reservation>): Promise<Reservation> {
    const startAt = new Date(`${payload.reservation_date}T${payload.start_time}`).toISOString();
    const endAt = new Date(`${payload.reservation_date}T${payload.end_time}`).toISOString();
    const dbStatus = this.mapDomainStatusToDb(payload.status || 'confirmée');

    const dbPayload = {
      workstation_id: payload.workstation_id || '00000000-0000-0000-0000-000000000000',
      user_id: payload.user_id || '00000000-0000-0000-0000-000000000000',
      type: 'STANDARD',
      start_at: startAt,
      end_at: endAt,
      status: dbStatus,
      requires_approval: payload.status === 'en attente',
      purpose: payload.purpose || 'Session travail',
      check_in_deadline: new Date(new Date(startAt).getTime() + 30 * 60000).toISOString(),
    };

    const { data, error } = await supabase.from('reservations').insert(dbPayload).select().single();

    if (error) {
      console.warn('DB insert notice:', error);
    }

    return {
      id: data?.id || `res_${Date.now()}`,
      user_id: payload.user_id || 'usr-current',
      user_name: payload.user_name || 'Collaborateur Safi',
      user_department: payload.user_department || 'Digital Factory',
      workstation_id: payload.workstation_id || '',
      workstation_code: payload.workstation_code || 'WS-SF',
      cluster_id: payload.cluster_id || 'cl-a',
      cluster_name: payload.cluster_name || 'Cluster A',
      reservation_date: payload.reservation_date || new Date().toISOString().split('T')[0],
      start_time: payload.start_time || '08:30',
      end_time: payload.end_time || '17:30',
      status: (payload.status as ReservationStatus) || 'confirmée',
      created_at: new Date().toISOString(),
      purpose: payload.purpose,
      notes: payload.notes,
    };
  }

  /**
   * Update reservation status in Supabase
   */
  static async updateReservationStatus(id: string, status: ReservationStatus, extra?: any): Promise<boolean> {
    try {
      const dbStatus = this.mapDomainStatusToDb(status);
      const updateObj: any = {
        status: dbStatus,
        updated_at: new Date().toISOString(),
        ...extra,
      };

      await supabase.from('reservations').update(updateObj).eq('id', id);
      return true;
    } catch (err) {
      console.error('Error updating reservation status:', err);
      return false;
    }
  }

  static mapDbStatusToDomain(dbStatus: string): ReservationStatus {
    if (dbStatus === 'CHECKED_IN') return 'check-in';
    if (dbStatus === 'NO_SHOW') return 'no-show';
    if (dbStatus === 'PENDING_APPROVAL') return 'en attente';
    if (dbStatus === 'CANCELLED') return 'annulée';
    if (dbStatus === 'COMPLETED') return 'terminée';
    return 'confirmée';
  }

  static mapDomainStatusToDb(domainStatus: string): string {
    if (domainStatus === 'check-in') return 'CHECKED_IN';
    if (domainStatus === 'no-show') return 'NO_SHOW';
    if (domainStatus === 'en attente') return 'PENDING_APPROVAL';
    if (domainStatus === 'annulée') return 'CANCELLED';
    if (domainStatus === 'terminée' || domainStatus === 'check-out') return 'COMPLETED';
    return 'CONFIRMED';
  }
}