import { supabase } from '../client';
import { ApprovalRequest } from '@/frontend/src/types';

export class ApprovalRepository {
  private static LOCAL_KEY = 'xfactory_approvals_v2';

  private static getLocalApprovals(): ApprovalRequest[] {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(this.LOCAL_KEY);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch (e) {
          // Fallback
        }
      }
    }
    return [];
  }

  private static saveLocalApprovals(list: ApprovalRequest[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.LOCAL_KEY, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('xfactory_approvals_changed'));
    }
  }

  static async getApprovals(): Promise<ApprovalRequest[]> {
    try {
      const { data, error } = await supabase
        .from('approval_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const dbMapped: ApprovalRequest[] = data.map((a: any) => ({
          id: a.id,
          reservation_id: a.reservation_id || '',
          requester_id: a.requested_by,
          requester_name: a.requester_name || 'Collaborateur Safi',
          user_department: a.user_department || 'OCP Safi Team',
          approver_role: a.approver_role || 'director',
          status: a.status.toLowerCase() as any,
          reason: a.reason || 'Réservation longue durée (> 2 jours ouvrés)',
          objective: a.objective || a.reason || 'Mission Safi Digital Factory',
          decision_note: a.decision_reason,
          created_at: a.created_at,
          decided_at: a.decided_at,
          reservation_date: a.reservation_date,
          end_date: a.end_date,
          duration_days: a.duration_days,
          workstation_code: a.workstation_code,
          cluster_name: a.cluster_name,
        }));
        this.saveLocalApprovals(dbMapped);
        return dbMapped;
      }
    } catch (err) {
      console.warn('Fetch approvals fallback:', err);
    }

    return this.getLocalApprovals();
  }

  static async createApproval(payload: Partial<ApprovalRequest>): Promise<ApprovalRequest> {
    const item: ApprovalRequest = {
      id: `app_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      reservation_id: payload.reservation_id || '',
      requester_id: payload.requester_id || 'usr-current',
      requester_name: payload.requester_name || 'Collaborateur Safi',
      user_department: payload.user_department || 'Direction Technique',
      approver_role: payload.approver_role || 'director',
      status: 'pending',
      reason: payload.reason || 'Réservation longue durée (> 2 jours ouvrés)',
      objective: payload.objective || payload.reason || 'Description détaillée mission',
      created_at: new Date().toISOString(),
      reservation_date: payload.reservation_date,
      end_date: payload.end_date,
      start_time: payload.start_time,
      end_time: payload.end_time,
      duration_days: payload.duration_days || 3,
      workstation_code: payload.workstation_code,
      cluster_name: payload.cluster_name,
    };

    try {
      await supabase
        .from('approval_requests')
        .insert({
          id: item.id,
          approval_type: 'LONG_DURATION',
          reservation_id: item.reservation_id,
          requested_by: item.requester_id,
          status: 'PENDING',
          reason: item.reason,
          objective: item.objective,
        });
    } catch (err) {
      // Non-blocking fallback
    }

    const current = this.getLocalApprovals();
    const updated = [item, ...current.filter((x) => x.id !== item.id)];
    this.saveLocalApprovals(updated);

    return item;
  }

  static async updateApprovalDecision(
    id: string,
    status: 'approved' | 'rejected' | 'needs_info',
    decisionNote: string,
    deciderId: string
  ): Promise<boolean> {
    const dbStatus = status === 'approved' ? 'APPROVED' : status === 'needs_info' ? 'NEEDS_INFO' : 'REJECTED';

    try {
      await supabase
        .from('approval_requests')
        .update({
          status: dbStatus,
          decision_reason: decisionNote,
          decided_by: deciderId || '00000000-0000-0000-0000-000000000000',
          decided_at: new Date().toISOString(),
        })
        .eq('id', id);
    } catch (err) {
      // Non-blocking catch
    }

    const current = this.getLocalApprovals();
    const target = current.find((a) => a.id === id);
    if (target) {
      target.status = status;
      target.decision_note = decisionNote;
      target.decided_at = new Date().toISOString();
      this.saveLocalApprovals(current);
    }

    return true;
  }

  static async updateApprovalObjective(
    id: string,
    newObjective: string,
    newReason: string
  ): Promise<boolean> {
    const current = this.getLocalApprovals();
    const target = current.find((a) => a.id === id);
    if (target) {
      target.objective = newObjective;
      target.reason = newReason;
      target.status = 'pending';
      target.decision_note = undefined;
      this.saveLocalApprovals(current);
    }
    return true;
  }
}
