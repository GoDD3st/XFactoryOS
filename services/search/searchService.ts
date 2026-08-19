import { Reservation, ReservationSearchQuery, UserRole, Workstation, WorkstationSearchQuery } from '@/frontend/src/types';
import { WorkstationRepository } from '@/database/repositories/workstationRepository';
import { ReservationRepository } from '@/database/repositories/reservationRepository';

// Roles allowed to search across everyone's reservations (matches reservations RLS / matrix
// RBAC "Modifier réservation d'autrui"). Everyone else is scoped to their own reservations only
// - SRS §11.10 "Résultats limités au périmètre autorisé".
const RESERVATION_SEARCH_OPS_ROLES: UserRole[] = ['super_admin', 'admin', 'building_manager', 'gci_manager', 'receptionist'];

export class SearchService {
  // Runs server-side (backend/routes/search.routes.ts) - reads live Supabase data, not the
  // browser-only localStorage cache (WorkspaceService.getSavedWorkstations() always returns
  // synthetic seed data when called with no `window`, which is exactly the server's context).
  static async searchWorkstations(query: WorkstationSearchQuery): Promise<Workstation[]> {
    const wsMap = await WorkstationRepository.getWorkstations();
    // Each workstation is keyed by both its UUID and its cluster code in wsMap (see
    // WorkstationRepository.getWorkstations), so a naive flatten of all values double-counts
    // every seat - dedupe by id.
    const byId = new Map<string, Workstation>();
    Object.values(wsMap).flat().forEach((w) => byId.set(w.id, w));
    let workstations: Workstation[] = Array.from(byId.values());

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

  /**
   * `callerId`/`callerRole` come from the authenticated request (server-side only) - a
   * non-privileged caller is always scoped to their own reservations regardless of what
   * `query.userId` asks for, so this can't be used to browse other users' bookings.
   */
  static async searchReservations(
    query: ReservationSearchQuery,
    callerId: string,
    callerRole: UserRole
  ): Promise<Reservation[]> {
    let reservations = await ReservationRepository.getAllReservations();

    const isOps = RESERVATION_SEARCH_OPS_ROLES.includes(callerRole);
    const effectiveUserId = isOps ? query.userId : callerId;

    if (effectiveUserId) {
      reservations = reservations.filter(r => r.user_id === effectiveUserId);
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
