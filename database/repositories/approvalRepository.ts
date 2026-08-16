import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../client';
import { ApprovalRequest } from '@/frontend/src/types';

// approval_requests has no anon/authenticated INSERT policy (writes are meant to go through
// the backend). Server-side callers must use the service-role client to bypass RLS.
async function resolveClient(): Promise<SupabaseClient> {
  if (typeof window === 'undefined') {
    const { getAdminClient } = await import('../serverClient');
    const admin = getAdminClient();
    if (admin) return admin;
  }
  return supabase;
}

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
      const db = await resolveClient();
      const { data, error } = await db
        .from('approval_requests')
        .select(
          '*, requester:users!approval_requests_requested_by_fkey(full_name, department), ' +
            'reservations(start_at, end_at, purpose, workstations(code, clusters(name)))'
        )
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const dbMapped: ApprovalRequest[] = data.map((a: any) => {
          const startAt = a.reservations?.start_at;
          const endAt = a.reservations?.end_at;
          const durationDays = startAt && endAt
            ? Math.max(1, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 86400000))
            : undefined;

          // Read the clock times in LOCAL time, the way the reservation was written. The approver
          // is deciding on "08:00-18:00", and a UTC read would shift that by the server offset -
          // the same defect already fixed in waitingListRepository.
          const localTime = (iso?: string) => {
            if (!iso) return undefined;
            const d = new Date(iso);
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          };
          const startTime = localTime(startAt);
          const endTime = localTime(endAt);

          // Occupancy hours, not wall-clock: the daily window times the number of days. This is
          // the figure BR-06 asks the approver to weigh.
          let totalHours: number | undefined;
          if (startTime && endTime && durationDays) {
            const [sh, sm] = startTime.split(':').map(Number);
            const [eh, em] = endTime.split(':').map(Number);
            const dailyHours = (eh * 60 + em - (sh * 60 + sm)) / 60;
            if (dailyHours > 0) totalHours = Math.round(dailyHours * durationDays * 10) / 10;
          }

          return {
            id: a.id,
            reservation_id: a.reservation_id || '',
            requester_id: a.requested_by,
            requester_name: a.requester?.full_name || 'Collaborateur Safi',
            user_department: a.requester?.department || 'Digital Factory',
            // Rows written before the approver_role column existed have no stored value - 
            // 'director' matches their original (client-only, never persisted) default.
            approver_role: a.approver_role || 'director',
            status: a.status === 'INFO_REQUESTED' ? 'needs_info' : (a.status.toLowerCase() as any),
            reason: a.objective || 'Réservation longue durée (> 2 jours ouvrés)',
            objective: a.objective || a.reservations?.purpose || 'Mission Safi Digital Factory',
            decision_note: a.decision_reason,
            created_at: a.created_at,
            decided_at: a.decided_at,
            reservation_date: startAt ? new Date(startAt).toISOString().split('T')[0] : undefined,
            end_date: endAt ? new Date(endAt).toISOString().split('T')[0] : undefined,
            start_time: startTime,
            end_time: endTime,
            duration_days: durationDays,
            total_hours: totalHours,
            workstation_code: a.reservations?.workstations?.code,
            cluster_name: a.reservations?.workstations?.clusters?.name,
          };
        });
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

    const db = await resolveClient();
    const { data, error } = await db
      .from('approval_requests')
      .insert({
        approval_type: 'LONG_DURATION',
        reservation_id: item.reservation_id || null,
        requested_by: item.requester_id,
        status: 'PENDING',
        objective: item.objective,
        approver_role: item.approver_role,
      })
      .select('id')
      .single();

    if (error) {
      console.error('createApproval insert failed:', error);
    } else if (data?.id) {
      item.id = data.id;
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
    // DB enum approval_status is PENDING/APPROVED/REJECTED/INFO_REQUESTED - 'NEEDS_INFO' isn't
    // a valid value and would fail the write with a Postgres enum error.
    const dbStatus = status === 'approved' ? 'APPROVED' : status === 'needs_info' ? 'INFO_REQUESTED' : 'REJECTED';

    try {
      const db = await resolveClient();
      await db
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

  /**
   * BPMN D2 "UPDATE --> REVIEW": the requester completes the motif after a DEMANDER INFO decision
   * and the request goes back into the approver's queue.
   *
   * This previously wrote to localStorage only and returned true unconditionally. The database row
   * stayed INFO_REQUESTED forever while the UI announced the request had been re-submitted, so the
   * approver never saw it again - the loop silently dead-ended. It now writes to the database and
   * reports whether it actually succeeded.
   *
   * Resetting to PENDING and clearing the previous decision is what puts it back in front of the
   * approver; leaving decision_reason set would show the old "missing information" note against a
   * request that has since been completed.
   */
  static async updateApprovalObjective(
    id: string,
    newObjective: string,
    newReason: string
  ): Promise<boolean> {
    try {
      const db = await resolveClient();
      const { data, error } = await db
        .from('approval_requests')
        .update({
          objective: newObjective,
          decision_reason: newReason,
          status: 'PENDING',
          decided_by: null,
          decided_at: null,
        })
        .eq('id', id)
        // Only a request actually awaiting completion may be re-submitted: without this an
        // already-approved or refused decision could be reopened by replaying the call.
        .eq('status', 'INFO_REQUESTED')
        // .select() is what makes the guard real. An UPDATE matching zero rows is not an error in
        // PostgREST, so checking `error` alone reported success for a request that was never
        // eligible - a replay of this call looked like it had reopened a decided request.
        .select('id');

      if (error) {
        console.warn('Re-soumission de la demande impossible:', error.message);
        return false;
      }
      return (data?.length ?? 0) > 0;
    } catch (err) {
      console.warn('Re-soumission de la demande impossible:', err);
      return false;
    }
  }
}
