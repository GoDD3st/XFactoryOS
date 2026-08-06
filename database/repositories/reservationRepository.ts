import { supabase, executeDbQuery, DatabaseError } from '../client';
import { SupabaseClient } from '@supabase/supabase-js';
import { Reservation, ReservationStatus } from '@/frontend/src/types';
import { AuditRepository } from './auditRepository';
import { WorkstationRepository } from './workstationRepository';
import { isValidUuid } from '../utils/uuid';

export class ReservationRepository {
  /**
   * Fetch single reservation by ID
   */
  static async getReservationById(id: string): Promise<Reservation | null> {
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) return null;

      return this.mapRowToReservation(data);
    } catch (err) {
      console.warn('getReservationById fallback:', err);
      return null;
    }
  }

  /**
   * Check for double-booking conflicts on the same workstation
   */
  static async checkConflict(
    workstationCode: string,
    reservationDate: string,
    startTime: string,
    endTime: string,
    excludeReservationId?: string,
    dbClient: SupabaseClient = supabase
  ): Promise<boolean> {
    try {
      const workstationId = await WorkstationRepository.resolveWorkstationId(undefined, workstationCode, dbClient);
      const startAt = new Date(`${reservationDate}T${startTime}`).toISOString();
      const endAt = new Date(`${reservationDate}T${endTime}`).toISOString();

      let query = dbClient
        .from('reservations')
        .select('id, workstation_id, start_at, end_at, status')
        .eq('workstation_id', workstationId)
        .neq('status', 'CANCELLED')
        .neq('status', 'NO_SHOW')
        .neq('status', 'COMPLETED');

      if (excludeReservationId) {
        query = query.neq('id', excludeReservationId);
      }

      const { data, error } = await query;
      if (error) {
        throw new DatabaseError('reservations', 'select', error.message || 'Impossible de vérifier les conflits de réservation', error);
      }
      if (!data) return false;

      const newStart = new Date(startAt).getTime();
      const newEnd = new Date(endAt).getTime();

      return data.some((r: any) => {
        const rStart = new Date(r.start_at).getTime();
        const rEnd = new Date(r.end_at).getTime();
        return newStart < rEnd && newEnd > rStart;
      });
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      // Fail closed: an unreadable conflict check must never be treated as "no conflict".
      throw new DatabaseError('reservations', 'select', 'Impossible de vérifier la disponibilité du poste', err);
    }
  }

  /**
   * Fetch active reservations for a single user
   */
  static async getUserReservations(userId: string, dbClient: SupabaseClient = supabase): Promise<Reservation[]> {
    if (!isValidUuid(userId)) return [];

    try {
      const { data, error } = await dbClient
        .from('reservations')
        .select('*')
        .eq('user_id', userId)
        .not('status', 'in', '(CANCELLED,NO_SHOW,REJECTED)')
        .order('start_at', { ascending: false });

      if (error) {
        throw new DatabaseError('reservations', 'select', error.message || "Impossible de lire les réservations de l'utilisateur", error);
      }
      if (!data) return [];

      return data.map((r: any) => this.mapRowToReservation(r));
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      // Fail closed: an unreadable reservation count must never be treated as "zero usage"
      // for quota enforcement (BR-04/BR-05, FR-30).
      throw new DatabaseError('reservations', 'select', "Impossible de vérifier le quota de réservations", err);
    }
  }

  /**
   * Fetch all reservations from Supabase (throws on query error — never silently wipe cache)
   */

  private static deriveReservationType(date?: string, startTime?: string, endTime?: string): string {
    if (!date || !startTime || !endTime) return 'FULL_DAY';
      const [sh] = startTime.split(':').map(Number);
      const [eh] = endTime.split(':').map(Number);
    if (eh - sh <= 4) return sh < 13 ? 'HALF_DAY_AM' : 'HALF_DAY_PM';
      return 'FULL_DAY';
  }

  static async getAllReservations(dbClient: SupabaseClient = supabase): Promise<Reservation[]> {
    const { data, error } = await dbClient
      .from('reservations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('getAllReservations error:', error);
      throw new DatabaseError('reservations', 'select', error.message || 'Impossible de lire les réservations', error);
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map((r: any) => this.mapRowToReservation(r));
  }

  /**
   * Create a new reservation in Supabase & log audit event.
   * Throws if the insert fails — never returns a fake local-only reservation.
   */
  static async createReservation(
    payload: Partial<Reservation>,
    dbClient: SupabaseClient = supabase
  ): Promise<Reservation> {
    if (!payload.user_id || !isValidUuid(payload.user_id)) {
      throw new Error(
        'Session utilisateur invalide. Déconnectez-vous puis reconnectez-vous avec votre compte Supabase.'
      );
    }

    const workstationId = await WorkstationRepository.resolveWorkstationId(
      payload.workstation_id,
      payload.workstation_code,
      dbClient
    );

    const startAt = new Date(`${payload.reservation_date}T${payload.start_time}`).toISOString();
    const endAt = new Date(`${payload.reservation_date}T${payload.end_time}`).toISOString();
    const dbStatus = this.mapDomainStatusToDb(payload.status || 'confirmée');

    
    const dbPayload = {
      workstation_id: workstationId,
      user_id: payload.user_id,
      type: this.deriveReservationType(payload.reservation_date, payload.start_time, payload.end_time),
      start_at: startAt,
      end_at: endAt,
      status: dbStatus,
      requires_approval: payload.status === 'en attente',
      purpose: payload.purpose || 'Session travail',
      check_in_deadline: new Date(new Date(startAt).getTime() + 30 * 60000).toISOString(),
    };

    const data = await executeDbQuery<any>('reservations', 'insert', async () =>
      dbClient.from('reservations').insert(dbPayload).select().single()
    );

    const createdReservation = this.mapRowToReservation(data, payload);

    await AuditRepository.logEvent(
      'RESERVATION_CREATED',
      createdReservation.user_id,
      createdReservation.user_name || 'Utilisateur', 'collaborator',
      'collaborator',
      createdReservation.workstation_code,
      `Création réservation #${createdReservation.id.substring(0, 8)} pour ${createdReservation.user_name} sur poste ${createdReservation.workstation_code} le ${createdReservation.reservation_date}`
    );

    return createdReservation;
  }

  /**
   * Update reservation status in Supabase & log audit event
   */
  static async updateReservationStatus(id: string, status: ReservationStatus, extra?: any): Promise<boolean> {
    try {
      const dbStatus = this.mapDomainStatusToDb(status);
      const updateObj: any = {
        status: dbStatus,
        updated_at: new Date().toISOString(),
        ...extra,
      };

      const { error } = await supabase.from('reservations').update(updateObj).eq('id', id);
      if (error) {
        console.error('Error updating reservation status:', error);
        return false;
      }

      await AuditRepository.logEvent(
        `RESERVATION_${status.toUpperCase().replace('-', '_')}`,
        'system',
        'XFactory OS',
        'admin',
        id,
        `Mise à jour statut réservation #${id.substring(0, 8)} à : ${status}`
      );

      return true;
    } catch (err) {
      console.error('Error updating reservation status:', err);
      return false;
    }
  }

  private static mapRowToReservation(data: any, fallback?: Partial<Reservation>): Reservation {
    const formatTime = (iso: string) => {
      const d = new Date(iso);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    return {
      id: data.id,
      user_id: data.user_id,
      user_name: fallback?.user_name || data.user_name || 'Collaborateur Safi',
      user_department: fallback?.user_department || data.user_department || 'Digital Factory',
      workstation_id: data.workstation_id,
      workstation_code: fallback?.workstation_code || data.workstation_code || 'WS-SF',
      cluster_id: fallback?.cluster_id || data.cluster_id || 'cl-a',
      cluster_name: fallback?.cluster_name || data.cluster_name || 'Cluster A',
      reservation_date: data.start_at
        ? new Date(data.start_at).toISOString().split('T')[0]
        : fallback?.reservation_date || new Date().toISOString().split('T')[0],
      start_time: data.start_at ? formatTime(data.start_at) : fallback?.start_time || '08:30',
      end_time: data.end_at ? formatTime(data.end_at) : fallback?.end_time || '17:30',
      status: this.mapDbStatusToDomain(data.status),
      created_at: data.created_at,
      check_in_at: data.check_in_at,
      check_out_at: data.check_out_at,
      notes: data.cancel_reason || fallback?.notes || '',
      purpose: data.purpose || fallback?.purpose || 'Session travail',
    };
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
