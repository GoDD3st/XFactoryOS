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

  /**
   * Every request this user raised, in any state.
   *
   * The re-clarification loop needs this. EndUserDashboard used to look for the caller's
   * needs_info request inside getPendingApprovals(), which filters to status === 'pending' - a
   * list that by construction can never contain a needs_info row. The banner prompting the user
   * to re-submit therefore never appeared, and the whole D2 "DEMANDER INFO" branch was
   * unreachable from the UI even though the backend handled it correctly.
   */
  public static async getRequestsForUser(userId: string): Promise<ApprovalRequest[]> {
    const list = await ApprovalRepository.getApprovals();
    return list.filter((a) => a.requester_id === userId);
  }

  /** The caller's requests an approver has sent back for more detail. */
  public static async getRequestsNeedingInfo(userId: string): Promise<ApprovalRequest[]> {
    return (await this.getRequestsForUser(userId)).filter((a) => a.status === 'needs_info');
  }

  public static async getApprovalHistory(): Promise<ApprovalRequest[]> {
    const list = await ApprovalRepository.getApprovals();
    return list.filter((a) => a.status !== 'pending');
  }

  /**
   * The threshold is an administrator setting (§28 "Durée max sans approbation"), not a constant.
   * MAX_DURATION_WITHOUT_APPROVAL_DAYS is only the fallback when settings can't be read, so
   * changing the value in the Settings screen actually moves the approval boundary.
   */
  public static async requiresApproval(durationDays: number): Promise<boolean> {
    let threshold = this.MAX_DURATION_WITHOUT_APPROVAL_DAYS;
    try {
      const { SettingsRepository } = await import('@/database/repositories/settingsRepository');
      const settings = await SettingsRepository.getSettings();
      threshold = settings?.maxReservationDaysWithoutApproval ?? threshold;
    } catch {
      /* keep the fallback */
    }
    return durationDays > threshold;
  }

  /**
   * Everyone holding an approver role, as real user ids.
   *
   * Notifications are keyed on users.id. This used to be handed the ROLE STRING ('director') as
   * the recipient, so the insert was attempted against a uuid column with the text 'director' and
   * failed: no approver was ever told a request had arrived, and requests sat in the queue until
   * somebody happened to open the Approvals screen.
   */
  public static async resolveApprovers(role: string): Promise<string[]> {
    try {
      const { getAdminClient } = await import('@/database/serverClient');
      const admin = getAdminClient();
      if (!admin) return [];

      const dbCode = role === 'director' ? 'DIRECTOR' : 'EXECUTIVE_ASSISTANT';
      const { data } = await admin
        .from('user_roles')
        .select('user_id, roles!inner(code)')
        .eq('roles.code', dbCode);

      return (data || []).map((r: any) => r.user_id).filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Tells every holder of the routed approver role that a request is waiting, with the facts
   * BR-06 expects them to weigh: who, which desk, the exact window, and the occupancy hours.
   */
  public static async notifyApprovers(request: ApprovalRequest): Promise<number> {
    const approverIds = await this.resolveApprovers(request.approver_role);
    if (approverIds.length === 0) {
      console.warn(
        `[Approvals] No user holds the role "${request.approver_role}" - request ${request.id} has no reachable approver.`
      );
      return 0;
    }

    const span =
      request.reservation_date && request.end_date && request.end_date !== request.reservation_date
        ? `du ${request.reservation_date} au ${request.end_date}`
        : `le ${request.reservation_date || 'date à confirmer'}`;
    const hours =
      request.start_time && request.end_time ? ` (${request.start_time} - ${request.end_time})` : '';
    const total = request.total_hours ? `, soit ${request.total_hours} h d'occupation` : '';
    const days = request.duration_days ? ` sur ${request.duration_days} jour(s)` : '';

    await Promise.all(
      approverIds.map((id) =>
        NotificationService.sendNotification(
          id,
          "Demande d'approbation longue durée",
          `${request.requester_name} (${request.user_department || 'service non renseigné'}) demande ` +
            `le poste ${request.workstation_code || 'à confirmer'} ${span}${hours}${days}${total}. ` +
            `Motif : ${request.objective || request.reason}`,
          'warning',
          request.reservation_id
        )
      )
    );

    return approverIds.length;
  }

  public static async createApprovalRequest(payload: Omit<ApprovalRequest, 'id' | 'status' | 'created_at'>): Promise<ApprovalRequest> {
    const newRequest = await ApprovalRepository.createApproval(payload);
    await this.notifyApprovers(newRequest);
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
    // exceeding the max configured duration - two distinct authorities, not an interchangeable
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
        `Cette demande est réservée au rôle ${pending.approver_role} - vous ne pouvez pas la décider.`
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

      // BR-06 record. A bare "decision approved" is not auditable after the fact: an
      // administrator reviewing why a desk was held for two weeks needs the requester, the
      // window, the occupancy hours, the stated motive and who signed it off, in one entry.
      const detail = target
        ? [
            `Décision ${decision.toUpperCase()} - réservation longue durée`,
            `Demandeur : ${target.requester_name}${target.user_department ? ` (${target.user_department})` : ''}`,
            `Poste : ${target.workstation_code || 'n/a'}${target.cluster_name ? ` / ${target.cluster_name}` : ''}`,
            `Période : ${target.reservation_date || '?'}${
              target.end_date && target.end_date !== target.reservation_date ? ` -> ${target.end_date}` : ''
            }${target.start_time && target.end_time ? ` ${target.start_time}-${target.end_time}` : ''}`,
            target.duration_days ? `Durée : ${target.duration_days} jour(s)` : null,
            target.total_hours ? `Occupation : ${target.total_hours} h` : null,
            `Motif : ${target.objective || target.reason}`,
            `Validé par : ${deciderRole || target.approver_role}`,
            `Note du valideur : ${decisionNote}`,
          ]
            .filter(Boolean)
            .join(' | ')
        : `Décision d'approbation ${decision}. Note: ${decisionNote}`;

      await AuditRepository.logEvent(
        decision === 'approved' ? 'APPROVE' : decision === 'rejected' ? 'REJECT' : 'UPDATE',
        deciderId,
        'Approbateur Direction Safi',
        target?.approver_role || 'director',
        target?.reservation_id || requestId,
        detail,
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
