import { SupabaseClient } from '@supabase/supabase-js';
import { ClusterAuthorizationRepository, ClusterAuthorization } from '@/database/repositories/clusterAuthorizationRepository';
import { UserRepository } from '@/database/repositories/userRepository';
import { WorkspaceService } from './workspaceService';
import { sendNotification } from '../notifications/notificationService';
import { logAuditEvent } from '../audit/auditService';
import { UserRole } from '@/frontend/src/types';

// BR-09 scopes this decision to GCI Manager and Building Manager (Administrator excluded despite
// the §13 matrix's "A"; Super Admin kept as break-glass). Drives who gets notified of a new
// request — keep in sync with CLUSTER_AUTH_DECIDER_ROLES in workspaces.routes.ts.
const DECIDER_ROLES: UserRole[] = ['building_manager', 'gci_manager', 'super_admin'];

export class ClusterAuthorizationService {
  static async requestAccess(
    clusterId: string,
    requestedBy: string,
    requesterName: string,
    reason: string,
    startsAt?: string,
    endsAt?: string
  ): Promise<ClusterAuthorization> {
    const request = await ClusterAuthorizationRepository.create(clusterId, requestedBy, reason, startsAt, endsAt);

    const deciders = (await UserRepository.getUsers()).filter((u) => DECIDER_ROLES.includes(u.role));
    await Promise.all(
      deciders.map((decider) =>
        sendNotification(
          decider.id,
          "Demande d'accès cluster management",
          `${requesterName} demande l'accès au cluster ${request.cluster_code || clusterId}.`,
          'info'
        )
      )
    );

    // 'CLUSTER_ACCESS_REQUEST' isn't a valid audit_action enum value (only CREATE/UPDATE/DELETE/
    // APPROVE/REJECT/CHECK_IN/CHECK_OUT/NO_SHOW/CLUSTER_ACTIVATE/CLUSTER_DEACTIVATE/ROLE_CHANGE/
    // SETTINGS_CHANGE/EXPORT/AI_QUERY/LOGIN exist) — CREATE is the closest accurate fit for
    // "a new request record was created" and avoids the invalid-enum write failure that a
    // previous session found on the reservation check-in path.
    logAuditEvent(
      'CREATE',
      requestedBy,
      requesterName,
      'collaborator',
      request.cluster_code || clusterId,
      `Demande d'autorisation cluster management (${request.cluster_code || clusterId}) : ${reason}`
    );

    return request;
  }

  static async decide(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    deciderId: string,
    deciderName: string,
    deciderRole: string,
    note?: string,
    startsAt?: string,
    endsAt?: string
  ): Promise<ClusterAuthorization> {
    const existing = await ClusterAuthorizationRepository.getById(id);
    if (!existing) throw new Error('Demande introuvable.');
    if (existing.status !== 'PENDING') throw new Error('Cette demande a déjà été traitée.');

    // BR-09: an approval without an expiry would leave the management cluster unlocked forever,
    // since relockExpiredAuthorizations() only ever acts on rows that carry an `ends_at`.
    if (decision === 'APPROVED') {
      const window = endsAt || existing.ends_at;
      if (!window) throw new Error("Une autorisation doit être temporaire : précisez une date/heure de fin.");
      if (new Date(window).getTime() <= Date.now()) {
        throw new Error("La date de fin de l'autorisation doit être dans le futur.");
      }
    }

    const decided = await ClusterAuthorizationRepository.decide(
      id,
      decision,
      deciderId,
      note,
      startsAt || existing.starts_at || undefined,
      endsAt || existing.ends_at || undefined
    );
    if (!decided) throw new Error('Échec de la décision.');

    if (decision === 'APPROVED') {
      await WorkspaceService.toggleManagementClusterLock(decided.cluster_id, true, deciderId, deciderName);
    }

    await sendNotification(
      decided.requested_by,
      decision === 'APPROVED' ? 'Accès cluster autorisé' : 'Accès cluster refusé',
      decision === 'APPROVED'
        ? `Votre demande d'accès au cluster ${decided.cluster_code || decided.cluster_id} a été approuvée${
            decided.ends_at ? ` jusqu'au ${new Date(decided.ends_at).toLocaleString('fr-FR')}` : ''
          }.`
        : `Votre demande d'accès au cluster ${decided.cluster_code || decided.cluster_id} a été refusée.${note ? ` Motif : ${note}` : ''}`,
      decision === 'APPROVED' ? 'success' : 'alert'
    );

    logAuditEvent(
      decision === 'APPROVED' ? 'CLUSTER_ACTIVATE' : 'CLUSTER_DEACTIVATE',
      deciderId,
      deciderName,
      deciderRole,
      decided.cluster_code || decided.cluster_id,
      `Décision d'autorisation cluster management : ${decision}. ${note || ''}`.trim()
    );

    return decided;
  }

  /**
   * Re-locks a management cluster once its latest APPROVED authorization's `ends_at` has
   * passed and no other approved+unexpired authorization keeps it open. Meant to be called
   * from a server ticker (backend/server.ts), same pattern as WorkspaceService.expireTemporarySeats().
   */
  static async relockExpiredAuthorizations(dbClient?: SupabaseClient): Promise<number> {
    const active = await ClusterAuthorizationRepository.getActiveApproved(dbClient);
    const now = Date.now();

    const expired = active.filter((a) => a.ends_at && new Date(a.ends_at).getTime() <= now);
    if (expired.length === 0) return 0;

    // A cluster can have more than one approved authorization overlapping (e.g. two people
    // requested the same window) — only re-lock once none of its approved windows are still open.
    const stillOpenClusterIds = new Set(
      active.filter((a) => !a.ends_at || new Date(a.ends_at).getTime() > now).map((a) => a.cluster_id)
    );

    const candidateClusterIds = new Set(expired.map((a) => a.cluster_id).filter((id) => !stillOpenClusterIds.has(id)));
    if (candidateClusterIds.size === 0) return 0;

    // An expired APPROVED row keeps matching getActiveApproved() forever — there is no EXPIRED
    // status to move it to — so without this guard the ticker re-locked an already-locked cluster
    // on every pass, rewriting all its seats and appending a CLUSTER_DEACTIVATE audit entry every
    // 60s indefinitely. Only act on clusters that are actually still open.
    const { WorkstationRepository } = await import('@/database/repositories/workstationRepository');
    const workstationsByCluster = await WorkstationRepository.getWorkstations(dbClient);

    let relocked = 0;
    for (const clusterId of candidateClusterIds) {
      const seats = workstationsByCluster[clusterId] || workstationsByCluster[clusterId.toLowerCase()] || [];
      const isStillOpen = seats.some((s) => s.status !== 'management_reserved');
      if (!isStillOpen) continue;

      await WorkspaceService.toggleManagementClusterLock(clusterId, false, 'system', 'Système XFactory', dbClient);
      relocked += 1;
    }

    return relocked;
  }
}
