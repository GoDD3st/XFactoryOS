import { Reservation, ReservationStatus } from '@/frontend/src/types';
import { ReservationRepository } from '@/database/repositories/reservationRepository';

export interface HistoryFilters {
  userId?: string;
  workstationCode?: string;
  clusterId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: ReservationStatus;
}

export class HistoryService {
  static async getReservationHistory(filters?: HistoryFilters): Promise<Reservation[]> {
    let reservations = await ReservationRepository.getAllReservations();

    if (filters) {
      if (filters.userId) {
        reservations = reservations.filter((r) => r.user_id === filters.userId);
      }
      if (filters.workstationCode) {
        reservations = reservations.filter((r) => r.workstation_code === filters.workstationCode);
      }
      if (filters.clusterId) {
        reservations = reservations.filter((r) => r.cluster_id === filters.clusterId);
      }
      if (filters.dateFrom) {
        reservations = reservations.filter((r) => r.reservation_date >= (filters.dateFrom as string));
      }
      if (filters.dateTo) {
        reservations = reservations.filter((r) => r.reservation_date <= (filters.dateTo as string));
      }
      if (filters.status) {
        reservations = reservations.filter((r) => r.status === filters.status);
      }
    }

    return reservations.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
  }

  static async getWorkstationHistory(workstationCode: string): Promise<Reservation[]> {
    const reservations = (await ReservationRepository.getAllReservations()).filter(
      (r) => r.workstation_code === workstationCode
    );
    return reservations.sort(
      (a, b) => new Date(b.reservation_date).getTime() - new Date(a.reservation_date).getTime()
    );
  }

  static async getUserHistory(userId: string): Promise<Reservation[]> {
    const reservations = (await ReservationRepository.getAllReservations()).filter(
      (r) => r.user_id === userId
    );
    return reservations.sort(
      (a, b) => new Date(b.reservation_date).getTime() - new Date(a.reservation_date).getTime()
    );
  }

  static exportHistoryAsCSV(reservations: Reservation[]): string {
    if (reservations.length === 0) return '';
    
    const headers = [
      'ID', 'User ID', 'User Name', 'Workstation', 'Cluster', 
      'Date', 'Start Time', 'End Time', 'Status', 'Created At'
    ];
    
    const rows = reservations.map(r => [
      r.id,
      r.user_id,
      r.user_name || '',
      r.workstation_code,
      r.cluster_name,
      r.reservation_date,
      r.start_time,
      r.end_time,
      r.status,
      r.created_at || ''
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    return csvContent;
  }
}
