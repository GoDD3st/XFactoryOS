import { ReservationRepository } from '@/database/repositories/reservationRepository';

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
   * Active checked-in occupants for the emergency evacuation roster (SRS §8.11).
   *
   * This previously called getLocalReservations(), which reads `localStorage` — a browser API
   * that does not exist in the Node process serving GET /api/security/evacuation-roster. The
   * endpoint therefore returned an empty array unconditionally: in a real evacuation it listed
   * nobody. It now reads the database, which is the only source that knows who is actually
   * checked in.
   */
  public static async getEvacuationRoster(): Promise<OccupantRosterItem[]> {
    // getAllReservations defaults to the anon client, which RLS blocks for a server-side caller
    // with no user JWT — it would return an empty roster rather than an error. Resolve the
    // service-role client explicitly.
    const { getAdminClient } = await import('@/database/serverClient');
    const admin = getAdminClient();
    if (!admin) {
      throw new Error(
        "Registre d'évacuation indisponible : accès serveur à la base non configuré (SUPABASE_SERVICE_ROLE_KEY)."
      );
    }

    const reservations = await ReservationRepository.getAllReservations(admin);

    return reservations
      // 'check-in' is the only ReservationStatus meaning "physically present". The original
      // also tested `=== 'occupé'`, which is a SeatStatus and never a reservation status — a
      // dead condition. Checked-out, completed and no-show reservations are no longer on site.
      .filter((res) => res.status === 'check-in')
      .map((res) => ({
        reservation_id: res.id,
        user_name: res.user_name || 'Collaborateur',
        department: res.user_department || '—',
        workstation_code: res.workstation_code,
        cluster_name: res.cluster_name,
        check_in_at: res.check_in_at || res.created_at || new Date().toISOString(),
      }))
      .sort((a, b) => a.workstation_code.localeCompare(b.workstation_code));
  }
}
