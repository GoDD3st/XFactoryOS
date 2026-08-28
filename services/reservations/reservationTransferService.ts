import { Reservation, UserRole } from '@/frontend/src/types';
import { ReservationRepository } from '@/database/repositories/reservationRepository';
import { WorkstationRepository } from '@/database/repositories/workstationRepository';
import { logAuditEvent } from '../audit/auditService';
import { sendNotification } from '../notifications/notificationService';
import { getAdminClient } from '@/database/serverClient';
import { supabase } from '@/database/client';

/**
 * Moving a reservation from one desk to another.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS FOR
 *
 * An operational correction: a desk breaks, a cluster is re-purposed, two people need to sit
 * together. Staff move the person to another desk WITHOUT cancelling and rebooking, which would
 * lose the booking's history, its check-in, its approval, and its place in the day.
 *
 * The window never changes. Only the desk does. Anything that would also change WHEN the person
 * sits is a different operation (the early-extension offer, or a cancellation and a new booking),
 * and mixing them here would let a transfer quietly rewrite a slot the ordinary rules police.
 *
 * WHO. Building Manager, Administrator, Super Administrator, Director and Executive Assistant.
 * Reception is deliberately absent: the desk is checked in and out at the front desk, but who
 * sits where is an allocation decision, not a reception one. The route enforces this; this
 * service assumes the caller has already been authorised and records who they were.
 *
 * WHAT IS RE-VERIFIED HERE ANYWAY, because a client cannot be trusted about any of it:
 *   - the reservation is still live. A cancelled, completed or no-show booking has nothing left
 *     to move, and moving one would resurrect a desk claim nobody holds;
 *   - the target desk exists, is not the current one, and is not out of service;
 *   - the target desk is free for exactly the window being moved;
 *   - BR-07: if the target desk is management-locked, the HOLDER - not the staff member doing the
 *     move - must be entitled to sit there. Moving somebody onto a VIP desk they could not have
 *     booked themselves would launder the restriction through an operator's permissions.
 *
 * The race is closed in the database, not here: `reservations` carries a GiST exclusion constraint
 * over (workstation_id, period) for live statuses, so two transfers onto the same desk and window
 * cannot both commit however this code is scheduled.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/** Statuses that still describe a desk being held, and can therefore be moved. */
const TRANSFERABLE_STATUSES = new Set(['confirmée', 'check-in', 'en attente']);

/** Roles allowed to move somebody else's reservation. Mirrored by the route guard. */
export const RESERVATION_TRANSFER_ROLES: UserRole[] = [
  'building_manager',
  'admin',
  'super_admin',
  'director',
  'executive_assistant',
];

export interface TransferResult {
  ok: boolean;
  message?: string;
  reservation?: Reservation;
  from?: string;
  to?: string;
}

export class ReservationTransferService {
  /**
   * Moves `reservationId` onto another desk, keeping its window, its holder and its status.
   *
   * @param actor the staff member performing the move, taken from the session by the route. It is
   *   recorded as the author of the change - the audit trail must never suggest the collaborator
   *   moved themselves.
   */
  static async transfer(
    reservationId: string,
    target: { workstationId?: string; workstationCode?: string },
    actor: { id: string; name: string; role: UserRole }
  ): Promise<TransferResult> {
    const reservation = await ReservationRepository.getReservationById(reservationId);
    if (!reservation) return { ok: false, message: 'Réservation introuvable.' };

    if (!TRANSFERABLE_STATUSES.has(reservation.status)) {
      return {
        ok: false,
        message: `Une réservation « ${reservation.status} » ne peut pas être déplacée.`,
      };
    }

    const db = getAdminClient() || supabase;

    const targetId = await WorkstationRepository.resolveWorkstationId(
      target.workstationId,
      target.workstationCode,
      db
    );
    if (!targetId) return { ok: false, message: 'Poste de destination introuvable.' };
    if (targetId === reservation.workstation_id) {
      return { ok: false, message: 'La réservation est déjà sur ce poste.' };
    }

    const { data: seat } = await db
      .from('workstations')
      .select('id, code, status, reservable, cluster_id, clusters(name)')
      .eq('id', targetId)
      .maybeSingle();

    if (!seat) return { ok: false, message: 'Poste de destination introuvable.' };
    if (seat.status === 'maintenance' || seat.status === 'disabled') {
      return { ok: false, message: `Le poste ${seat.code} est indisponible (${seat.status}).` };
    }

    // BR-07 is about the person who will SIT there, not the person doing the paperwork.
    if (!seat.reservable) {
      const entitled = await this.holderMayUseRestrictedSeat(reservation.user_id, seat.cluster_id, db);
      if (!entitled) {
        return {
          ok: false,
          message: `Le poste ${seat.code} est réservé à un accès Direction/VIP et ${
            reservation.user_name || 'ce collaborateur'
          } n'y est pas autorisé.`,
        };
      }
    }

    const effectiveEndDate = reservation.end_date || reservation.reservation_date;
    const conflict = await ReservationRepository.checkConflict(
      seat.code,
      reservation.reservation_date,
      reservation.start_time,
      reservation.end_time,
      reservation.id,
      db,
      effectiveEndDate
    );
    if (conflict) {
      return { ok: false, message: `Le poste ${seat.code} est déjà occupé sur ce créneau.` };
    }

    const from = reservation.workstation_code;
    const updated = await ReservationRepository.updateReservationWorkstation(reservation.id, targetId);
    if (!updated) return { ok: false, message: 'Échec du déplacement de la réservation.' };

    // An occupied desk moves its occupancy with it: leaving the old desk marked 'occupé' would
    // strand it as unbookable for the rest of the day with nobody sitting there.
    if (reservation.status === 'check-in') {
      if (reservation.workstation_id) {
        await WorkstationRepository.updateWorkstationStatus(reservation.workstation_id, 'disponible', true);
      }
      await WorkstationRepository.updateWorkstationStatus(targetId, 'occupé', false);
    }

    logAuditEvent(
      'UPDATE',
      actor.id,
      actor.name,
      actor.role,
      seat.code,
      `Déplacement de la réservation ${reservation.id.substring(0, 8)} de ${reservation.user_name || reservation.user_id} ` +
        `du poste ${from} vers le poste ${seat.code} (${reservation.reservation_date} ${reservation.start_time}-${reservation.end_time}).`
    );

    // The holder planned their day around a desk number and may already be walking to it.
    await sendNotification(
      reservation.user_id,
      'Changement de poste',
      `Votre réservation du ${reservation.reservation_date} (${reservation.start_time} - ${reservation.end_time}) ` +
        `a été déplacée du poste ${from} vers le poste ${seat.code}. Le QR code à scanner est celui du nouveau poste.`,
      'warning',
      reservation.id
    );

    return { ok: true, reservation: updated, from, to: seat.code };
  }

  /**
   * May this HOLDER sit at a management-locked desk?
   *
   * The same two doors BR-07 opens at booking time: a privileged role, or an individual entry in
   * `cluster_vip_members`. Kept in step with the check in ReservationService.createReservation - if
   * one is widened, so must the other be, or a transfer becomes a way around a booking rule.
   */
  private static async holderMayUseRestrictedSeat(
    userId: string,
    clusterId: string | null,
    db: any
  ): Promise<boolean> {
    const { data: roleRows } = await db
      .from('user_roles')
      .select('roles!inner(code)')
      .eq('user_id', userId);

    const codes: string[] = (roleRows || []).map((r: any) => r.roles?.code).filter(Boolean);
    if (codes.some((c) => ['DIRECTOR', 'EXECUTIVE_ASSISTANT', 'ADMIN', 'SUPER_ADMIN'].includes(c))) {
      return true;
    }

    if (!clusterId) return false;
    const { data: member } = await db
      .from('cluster_vip_members')
      .select('id')
      .eq('cluster_id', clusterId)
      .eq('user_id', userId)
      .maybeSingle();

    return !!member;
  }
}
