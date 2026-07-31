import { ApprovalRequest } from '@/frontend/src/types';
import { getLocalReservations, saveLocalReservations } from '../reservations/reservationService';
import { sendNotification } from '../notifications/notificationService';
import { logAuditEvent } from '../audit/auditService';

export class ApprovalService {
  public static MAX_DURATION_WITHOUT_APPROVAL_DAYS = 3;

  private static getLocalApprovals(): ApprovalRequest[] {
    if (typeof window !== 'undefined') {
      const data = localStorage.getItem('xfactory_approvals');
      if (data) return JSON.parse(data);
    }
    return [];
  }

  private static saveLocalApprovals(approvals: ApprovalRequest[]) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('xfactory_approvals', JSON.stringify(approvals));
    }
  }

  public static requiresApproval(durationDays: number): boolean {
    return durationDays > this.MAX_DURATION_WITHOUT_APPROVAL_DAYS;
  }

  public static createApprovalRequest(payload: Omit<ApprovalRequest, 'id' | 'status' | 'created_at'>): ApprovalRequest {
    const approvals = this.getLocalApprovals();
    const newRequest: ApprovalRequest = {
      ...payload,
      id: `app_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      status: 'pending',
      created_at: new Date().toISOString()
    };
    
    approvals.push(newRequest);
    this.saveLocalApprovals(approvals);

    sendNotification(
      payload.approver_role,
      'Demande d\'Approbation Longue Durée',
      `${payload.requester_name} a soumis une demande de réservation longue durée sur le site Safi.`,
      'info'
    );

    return newRequest;
  }

  public static decideApproval(
    requestId: string,
    decision: 'approved' | 'rejected',
    decisionNote: string,
    deciderId: string
  ): boolean {
    const approvals = this.getLocalApprovals();
    const index = approvals.findIndex(a => a.id === requestId);
    
    if (index !== -1 && approvals[index].status === 'pending') {
      approvals[index].status = decision;
      approvals[index].decision_note = decisionNote;
      approvals[index].decided_at = new Date().toISOString();
      
      this.saveLocalApprovals(approvals);

      const reservations = getLocalReservations();
      const resIndex = reservations.findIndex(r => r.id === approvals[index].reservation_id);
      
      if (resIndex !== -1) {
        reservations[resIndex].status = decision === 'approved' ? 'confirmée' : 'annulée';
        saveLocalReservations(reservations);
      }

      sendNotification(
        approvals[index].requester_id,
        `Réservation ${decision === 'approved' ? 'Approuvée' : 'Refusée'}`,
        `Votre demande de réservation longue durée a été ${decision === 'approved' ? 'approuvée' : 'refusée'}. Note: ${decisionNote}`,
        decision === 'approved' ? 'success' : 'alert'
      );

      logAuditEvent(
        `APPROVAL_${decision.toUpperCase()}`,
        deciderId,
        'Approbateur Direction Safi',
        approvals[index].approver_role,
        approvals[index].reservation_id,
        `Demande d'approbation ${decision}. Motif: ${decisionNote}`
      );

      return true;
    }
    return false;
  }

  public static getPendingApprovals(): ApprovalRequest[] {
    return this.getLocalApprovals().filter(a => a.status === 'pending');
  }

  public static getApprovalHistory(): ApprovalRequest[] {
    return this.getLocalApprovals().filter(a => a.status !== 'pending');
  }
}
