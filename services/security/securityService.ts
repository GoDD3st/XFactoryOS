import { EvacuationOccupant, VisitorBadge } from '@/frontend/src/types';
import { getLocalReservations } from '@/services/reservations/reservationService';

export function getEvacuationRoster(): EvacuationOccupant[] {
  const reservations = getLocalReservations();
  const occupants: EvacuationOccupant[] = [];

  reservations.forEach((res) => {
    if (res.status === 'check-in' || res.status === 'confirmée') {
      occupants.push({
        id: `occ-${res.id}`,
        name: res.user_name || 'Occupant Safi',
        role: 'Collaborateur OCP',
        department: res.user_department || 'Digital Factory',
        workstation_code: res.workstation_code,
        cluster_name: res.cluster_name,
        check_in_time: res.check_in_at || res.start_time,
        type: 'employee',
        accounted: res.status === 'check-in',
      });
    }
  });

  occupants.push({
    id: 'occ-vis-1',
    name: 'Jean-Marc Dupont',
    role: 'Expert Audit Capteurs',
    department: 'Prestataire Externe',
    workstation_code: 'CL-A-04',
    cluster_name: 'Innovation & Design',
    check_in_time: '08:45',
    type: 'visitor',
    accounted: true,
  });

  return occupants;
}

export function generateVisitorBadge(
  visitorName: string,
  visitorCompany: string,
  hostName: string,
  hostDepartment: string
): VisitorBadge {
  const badgeId = `BADGE-SAF-${Math.floor(100000 + Math.random() * 900000)}`;
  return {
    badge_id: badgeId,
    visitor_name: visitorName,
    visitor_company: visitorCompany,
    host_name: hostName,
    host_department: hostDepartment,
    visit_date: new Date().toISOString().split('T')[0],
    qr_code: `OCP-SAFI-VISITOR::${badgeId}::${visitorName}`,
    access_zone: 'Zone Bâtiment XFactory Open Space',
  };
}

export class SecurityService {
  static getEvacuationRoster = getEvacuationRoster;
  static generateVisitorBadge = generateVisitorBadge;
}
