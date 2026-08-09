import { ApprovalRequest } from '@/frontend/src/types';
import { ApprovalRepository } from '@/database/repositories/approvalRepository';
import { ReservationRepository } from '@/database/repositories/reservationRepository';
import { AuditRepository } from '@/database/repositories/auditRepository';
import { NotificationService } from '../notifications/notificationService';

export class ApprovalService {
  public static MAX_DURATION_WITHOUT_APPROVAL_DAYS = 3;

  public static async getPendingApprovals(): Promise<ApprovalRequest[]> {
    const list = await ApprovalRepository.getApprovals();
    return list.filter((a) => a.status === 'pending');
  }

  public static async getApprovalHistory(): Promise<ApprovalRequest[]> {
    const list = await ApprovalRepository.getApprovals();
    return list.filter((a) => a.status !== 'pending');
  }

  public static async requiresApproval(durationDays: number): Promise<boolean> {
    return durationDays > this.MAX_DURATION_WITHOUT_APPROVAL_DAYS;
  }

  public static async createApprovalRequest(payload: Omit<ApprovalRequest, 'id' | 'status' | 'created_at'>): Promise<ApprovalRequest> {
    const newRequest = await ApprovalRepository.createApproval(payload);

    NotificationService.sendNotification(
      payload.approver_role,
      'Demande d\'Approbation Longue Durée',
      `${payload.requester_name} a soumis une demande de réservation longue durée sur le site Safi.`,
      'info'
    );

    return newRequest;
  }

  public static async decideApproval(
    requestId: string,
    decision: 'approved' | 'rejected' | 'needs_info',
    decisionNote: string,
    deciderId: string,
    deciderRole?: string
  ): Promise<boolean> {
    // SRS 8.6/8.7: EA approves long/sensitive reservations, Director approves reservations
    // exceeding the max configured duration — two distinct authorities, not an interchangeable
    // pool. Every request now carries the role it was actually routed to (approver_role); only
    // that role (or admin/super_admin, who can always act as a backstop) may decide it.
    const approvals = await ApprovalRepository.getApprovals();
    const pending = approvals.find((a) => a.id === requestId);
    if (
      pending &&
      deciderRole &&
      deciderRole !== 'admin' &&
      deciderRole !== 'super_admin' &&
      pending.approver_role &&
      pending.approver_role !== deciderRole
    ) {
      throw new Error(
        `Cette demande est réservée au rôle ${pending.approver_role} — vous ne pouvez pas la décider.`
      );
    }

    const success = await ApprovalRepository.updateApprovalDecision(requestId, decision, decisionNote, deciderId);

    if (success) {
      const approvals = await ApprovalRepository.getApprovals();
      const target = approvals.find((a) => a.id === requestId);

      if (target && target.reservation_id) {
        if (decision === 'approved') {
          await ReservationRepository.updateReservationStatus(target.reservation_id, 'confirmée');
        } else if (decision === 'rejected') {
          // D7: REJECTED is a distinct terminal state from CANCELLED (a refused approval is not
          // the same audit/analytics event as a user-initiated cancellation).
          await ReservationRepository.updateReservationStatus(target.reservation_id, 'rejetée');
        }
      }

      if (target) {
        const title =
          decision === 'approved'
            ? 'Réservation Approuvée'
            : decision === 'needs_info'
            ? 'Nouvelle Description Demandée (Extension)'
            : 'Réservation Refusée';

        const msg =
          decision === 'needs_info'
            ? `Le valideur demande une nouvelle description pour votre extension. Note: ${decisionNote}`
            : `Votre demande d'extension a été ${decision === 'approved' ? 'approuvée' : 'refusée'}. Note: ${decisionNote}`;

        NotificationService.sendNotification(
          target.requester_id,
          title,
          msg,
          decision === 'approved' ? 'success' : decision === 'needs_info' ? 'warning' : 'alert'
        );
      }

      await AuditRepository.logEvent(
        decision === 'approved' ? 'APPROVE' : decision === 'rejected' ? 'REJECT' : 'UPDATE',
        deciderId,
        'Approbateur Direction Safi',
        target?.approver_role || 'director',
        target?.reservation_id || requestId,
        `Décision d'approbation ${decision}. Note: ${decisionNote}`,
        '10.120.4.18',
        'approval'
      );
    }

    return success;
  }

  public static async updateExtensionRequest(
    requestId: string,
    newObjective: string,
    newReason: string
  ): Promise<boolean> {
    return ApprovalRepository.updateApprovalObjective(requestId, newObjective, newReason);
  }
}
