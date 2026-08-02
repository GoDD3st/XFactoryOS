import { getLocalReservations } from '../reservations/reservationService';

export interface OccupantRosterItem {
  reservation_id: string;
  user_name: string;
  department: string;
  workstation_code: string;
  cluster_name: string;
  check_in_at: string;
}

export class SecurityService {
  /**
   * Returns active checked-in occupants for emergency evacuation roster (SRS 8.11)
   */
  public static getEvacuationRoster(): OccupantRosterItem[] {
    const reservations = getLocalReservations();
    const occupants: OccupantRosterItem[] = [];

    reservations.forEach((res) => {
      if (res.status === 'check-in' || res.status === 'occupé') {
        occupants.push({
          reservation_id: res.id,
          user_name: res.user_name || 'Collaborateur Safi',
          department: res.user_department || 'Digital Factory',
          workstation_code: res.workstation_code,
          cluster_name: res.cluster_name,
          check_in_at: res.check_in_at || new Date().toISOString(),
        });
      }
    });

    return occupants;
  }
}
