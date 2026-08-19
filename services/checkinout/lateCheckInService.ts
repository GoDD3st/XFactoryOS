import { LateCheckInRepository, LateCheckInRequest } from '@/database/repositories/lateCheckInRepository';
import { ReservationRepository } from '@/database/repositories/reservationRepository';
import { UserRepository } from '@/database/repositories/userRepository';
import { CheckInOutService } from './checkInOutService';
import { sendNotification } from '../notifications/notificationService';
import { logAuditEvent } from '../audit/auditService';
import { UserRole } from '@/frontend/src/types';

/**
 * Late check-in request workflow.
 *
 * The database is the real authority (owner trigger, no-self-review constraint, one-pending
 * index, RLS restricted to the three reviewer roles). This service adds the business rules that
 * belong in application code and drives the existing check-in path on approval.
 */

// Only these roles may review. Mirrors the RLS policy on late_check_in_requests, and is enforced
// again at the route layer -- hiding the button is not authorization.
export const LATE_CHECKIN_REVIEWER_ROLES: UserRole[] = ['building_manager', 'admin', 'super_admin'];

// A late check-in only makes sense for a reservation that was live and was not honoured.
// Cancelled / rejected / already-completed reservations are out of scope.
const REQUESTABLE_STATUSES = new Set(['confirmée', 'no-show']);

export class LateCheckInService {
  /**
   * Open a request. Ownership is verified here against the reservation itself, so a user cannot
   * request a late check-in for a booking that is not theirs, does not exist, or is in a state
   * where the request would be meaningless.
   */
  static async request(
    reservationId: string,
    userId: string,
    justification: string
  ): Promise<LateCheckInRequest> {
    const reservation = await ReservationRepository.getReservationById(reservationId);
    if (!reservation) throw new Error('Réservation introuvable.');

    if (reservation.user_id !== userId) {
      throw new Error("Cette réservation ne vous appartient pas.");
    }

    if (reservation.status === 'check-in') {
      throw new Error('Cette réservation est déjà enregistrée en check-in.');
    }

    if (!REQUESTABLE_STATUSES.has(reservation.status)) {
      throw new Error(
        `Un check-in tardif n'est pas possible sur une réservation « ${reservation.status} ».`
      );
    }

    const created = await LateCheckInRepository.create(reservationId, userId, justification.trim());

    // Notify the roles that can act on it, the same way cluster access requests do.
    const reviewers = (await UserRepository.getUsers()).filter((u) =>
      LATE_CHECKIN_REVIEWER_ROLES.includes(u.role)
    );
    await Promise.all(
      reviewers.map((r) =>
        sendNotification(
          r.id,
          'Demande de check-in tardif',
          `${reservation.user_name || 'Un collaborateur'} demande un check-in tardif sur le poste ${reservation.workstation_code}.`,
          'info',
          reservationId
        ).catch(() => {})
      )
    );

    logAuditEvent(
      'CREATE',
      userId,
      reservation.user_name || userId,
      'collaborator',
      reservation.workstation_code,
      `Demande de check-in tardif (réservation ${reservationId}) : ${justification.trim()}`
    );

    return created;
  }

  /**
   * Approve or reject. The reviewer's role is checked by the caller (route) and by RLS; this
   * additionally refuses self-review before touching anything, so the error is a clear message
   * rather than a constraint violation.
   *
   * Ordering matters on approval: the request row is claimed FIRST via a conditional update that
   * only matches a PENDING row. If two reviewers approve simultaneously, exactly one claim
   * succeeds, so the check-in below can never run twice.
   */
  static async decide(
    requestId: string,
    decision: 'APPROVED' | 'REJECTED',
    reviewer: { id: string; name: string; role: string },
    reviewerComment?: string
  ): Promise<LateCheckInRequest> {
    const existing = await LateCheckInRepository.getById(requestId);
    if (!existing) throw new Error('Demande introuvable.');
    if (existing.status !== 'PENDING') {
      throw new Error('Cette demande a déjà été traitée.');
    }
    if (existing.user_id === reviewer.id) {
      throw new Error('Vous ne pouvez pas traiter votre propre demande.');
    }

    const decided = await LateCheckInRepository.decide(
      requestId,
      decision,
      reviewer.id,
      reviewerComment
    );
    // No row matched => another reviewer claimed it between the read above and this update.
    if (!decided) throw new Error('Cette demande vient d\'être traitée par un autre approbateur.');

    if (decision === 'APPROVED') {
      const result = await CheckInOutService.performLateCheckIn(
        decided.reservation_id,
        decided.id,
        reviewer
      );

      if (!result.ok) {
        // The decision is already recorded and the reviewer is named; surfacing the failure is
        // better than silently reporting an approval that never produced a check-in.
        throw new Error(
          `Demande approuvée mais le check-in n'a pas pu être appliqué : ${result.message}`
        );
      }
    } else {
      await sendNotification(
        decided.user_id,
        'Check-in tardif refusé',
        `Votre demande de check-in tardif a été refusée.${reviewerComment ? ` Motif : ${reviewerComment}` : ''}`,
        'alert',
        decided.reservation_id
      ).catch(() => {});

      logAuditEvent(
        'REJECT',
        reviewer.id,
        reviewer.name,
        reviewer.role,
        decided.workstation_code || decided.reservation_id,
        `Demande de check-in tardif refusée (${requestId}). ${reviewerComment || ''}`.trim()
      );
    }

    return (await LateCheckInRepository.getById(requestId)) || decided;
  }

  static list(limit?: number) {
    return LateCheckInRepository.getAll(limit);
  }

  static listForUser(userId: string) {
    return LateCheckInRepository.getForUser(userId);
  }
}
