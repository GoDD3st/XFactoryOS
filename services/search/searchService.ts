import { Reservation, ReservationSearchQuery, Workstation, WorkstationSearchQuery } from '@/frontend/src/types';
import { WorkspaceService } from '@/services/workspaces/workspaceService';
import { ReservationService } from '@/services/reservations/reservationService';

export class SearchService {
  static searchWorkstations(query: WorkstationSearchQuery): Workstation[] {
    const wsMap = WorkspaceService.getSavedWorkstations();
    let workstations: Workstation[] = Object.values(wsMap).flat();

    if (query.clusterId) {
      workstations = workstations.filter(w => w.cluster_id === query.clusterId);
    }
    if (query.status) {
      workstations = workstations.filter(w => w.status === query.status);
    }
    if (query.nearWindow !== undefined) {
      workstations = workstations.filter(w => w.metadata.near_window === query.nearWindow);
    }
    if (query.isPMR !== undefined) {
      workstations = workstations.filter(w => w.metadata.is_pmr === query.isPMR);
    }
    if (query.isQuietZone !== undefined) {
      workstations = workstations.filter(w => w.metadata.is_quiet_zone === query.isQuietZone);
    }
    if (query.keyword) {
      const keyword = query.keyword.toLowerCase();
      workstations = workstations.filter(w => 
        w.code.toLowerCase().includes(keyword) ||
        (w.metadata.notes && w.metadata.notes.toLowerCase().includes(keyword))
      );
    }

    return workstations;
  }

  static searchReservations(query: ReservationSearchQuery): Reservation[] {
    let reservations = ReservationService.getLocalReservations();

    if (query.userId) {
      reservations = reservations.filter(r => r.user_id === query.userId);
    }
    if (query.clusterId) {
      reservations = reservations.filter(r => r.cluster_id === query.clusterId);
    }
    if (query.status) {
      reservations = reservations.filter(r => r.status === query.status);
    }
    if (query.dateFrom) {
      reservations = reservations.filter(r => r.reservation_date >= (query.dateFrom as string));
    }
    if (query.dateTo) {
      reservations = reservations.filter(r => r.reservation_date <= (query.dateTo as string));
    }
    if (query.keyword) {
      const keyword = query.keyword.toLowerCase();
      reservations = reservations.filter(r => 
        r.workstation_code.toLowerCase().includes(keyword) ||
        r.cluster_name.toLowerCase().includes(keyword) ||
        (r.user_name && r.user_name.toLowerCase().includes(keyword)) ||
        (r.notes && r.notes.toLowerCase().includes(keyword)) ||
        (r.purpose && r.purpose.toLowerCase().includes(keyword))
      );
    }

    return reservations;
  }
}
