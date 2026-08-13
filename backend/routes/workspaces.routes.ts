import { Router } from 'express';
import { WorkspaceService } from '@/services/workspaces/workspaceService';
import { ClusterAuthorizationService } from '@/services/workspaces/clusterAuthorizationService';
import { ClusterAuthorizationRepository } from '@/database/repositories/clusterAuthorizationRepository';
import { WorkstationRepository } from '@/database/repositories/workstationRepository';
import { UserRepository } from '@/database/repositories/userRepository';
import { requireRole, requirePermission } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import {
  MaintenanceToggleSchema,
  VisibilityToggleSchema,
  ManagementLockSchema,
  ClusterVipToggleSchema,
  ClusterVipMemberSchema,
  WorkstationUpdateSchema,
  ExtensionSeatSchema,
  ClusterAccessRequestSchema,
  ClusterAccessDecisionSchema,
  WorkstationCreateSchema,
  ClusterCreateSchema,
  EnabledToggleSchema,
} from '../validators';

// SRS §13: "Gérer postes" and "Gérer clusters" are CRUD for exactly these two roles. Building
// Manager and GCI Manager are RU — they must not reach create/delete.
const RESOURCE_CRUD_ROLES = ['admin', 'super_admin'] as const;

// BR-09 names GCI Manager and Building Manager as the authorizers of management clusters.
// Administrator removed deliberately: the §13 matrix grants it "A" but the business rule and the
// BPMN both scope this decision to the two managers. Super Admin is kept as break-glass.
const CLUSTER_AUTH_DECIDER_ROLES = ['building_manager', 'gci_manager', 'super_admin'] as const;
import { getServerWriteClient, extractBearerToken, hasAdminClient, requireAdminClient } from '@/database/serverClient';

// SRS 8.4: GCI Manager "peut autoriser les réservations de clusters management et suivre la
// valeur d'usage" — this is the specific authority the VIP/reserved-cluster endpoints below
// govern, so gci_manager belongs in this pool. It was previously absent here entirely (only
// appearing on the shared management-lock endpoint below), leaving the role almost powerless
// despite the SRS explicitly naming it as the approver of management-cluster access.
//
// Executive Assistant and Director both removed: these endpoints mutate clusters (VIP flag,
// member allowlist, extension seats), but the §13 matrix gives both roles R on "Gérer
// clusters"/"Gérer postes" and X on "Autoriser cluster management". Their shared mandate is
// approving long-duration reservations, not administering the seat referential.
const VIP_ROLES = ['gci_manager', 'admin', 'super_admin'] as const;

function getDbClient(req: { headers: { authorization?: string } }) {
  if (hasAdminClient()) return requireAdminClient();
  return getServerWriteClient(extractBearerToken(req.headers.authorization));
}

export const workspacesRouter = Router();

// GET /api/workspaces/clusters — Authenticated users
workspacesRouter.get('/clusters', async (req, res) => {
  try {
    const clusters = await WorkspaceService.fetchClustersWithOverlays();
    res.json({
      status: 'success',
      data: clusters,
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// PATCH /api/workspaces/clusters/:clusterId/seats/:seatId/visibility — SRS §13 row "Gérer
// postes": RU for Building Manager and GCI Manager too, not Admin-only.
workspacesRouter.patch(
  '/clusters/:clusterId/seats/:seatId/visibility',
  requirePermission('manage_workstations', 'update', ['admin', 'super_admin', 'building_manager', 'gci_manager']),
  validateBody(VisibilityToggleSchema),
  async (req, res) => {
    try {
      const dbClient = getDbClient(req);
      const { visibleToUsers } = req.body;
      await WorkspaceService.toggleExtensionSeatVisibility(
        req.params.clusterId,
        req.params.seatId,
        visibleToUsers,
        req.user!.id,
        req.user!.full_name,
        req.user!.role,
        dbClient
      );
      res.json({ status: 'success' });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);

// PATCH /api/workspaces/clusters/:clusterId/seats/:seatId/maintenance — SRS §13 row "Gérer
// postes": RU for Building Manager and GCI Manager.
workspacesRouter.patch(
  '/clusters/:clusterId/seats/:seatId/maintenance',
  requirePermission('manage_workstations', 'update', ['building_manager', 'gci_manager', 'admin', 'super_admin']),
  validateBody(MaintenanceToggleSchema),
  async (req, res) => {
    try {
      const dbClient = getDbClient(req);
      const { isMaintenance } = req.body;
      await WorkspaceService.setSeatMaintenanceStatus(
        req.params.clusterId,
        req.params.seatId,
        isMaintenance,
        req.user!.id,
        req.user!.full_name,
        req.user!.role,
        dbClient
      );
      res.json({ status: 'success' });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);

// PATCH /api/workspaces/clusters/:clusterId/management-lock — BR-09 + SRS §13 row "Autoriser
// cluster management": explicitly "A" for BOTH Building Manager and GCI Manager. A prior session
// narrowed this to GCI Manager only based on the narrative persona text ("lorsqu'il est
// autorisé") — the explicit RBAC matrix (the authoritative source) contradicts that reading, so
// Building Manager is restored here.
workspacesRouter.patch(
  '/clusters/:clusterId/management-lock',
  requirePermission('authorize_cluster_management', 'approve', ['building_manager', 'gci_manager', 'admin', 'super_admin']),
  validateBody(ManagementLockSchema),
  async (req, res) => {
    try {
      const dbClient = getDbClient(req);
      const { unlocked } = req.body;
      await WorkspaceService.toggleManagementClusterLock(
        req.params.clusterId,
        unlocked,
        req.user!.id,
        req.user!.full_name,
        dbClient
      );
      res.json({ status: 'success' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// PATCH /api/workspaces/clusters/:clusterId/vip — Super Admin/Admin/Director/EA: mark ANY cluster VIP
workspacesRouter.patch(
  '/clusters/:clusterId/vip',
  requireRole(...VIP_ROLES),
  validateBody(ClusterVipToggleSchema),
  async (req, res) => {
    try {
      const dbClient = getDbClient(req);
      await WorkspaceService.setClusterVipStatus(
        req.params.clusterId,
        req.body.isVip,
        req.user!.id,
        req.user!.full_name,
        dbClient
      );
      res.json({ status: 'success' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// GET /api/workspaces/users/lookup — minimal user list for the VIP-member picker. Deliberately
// narrower than GET /api/users (which per the SRS §13 matrix is Admin/Building/GCI/IT-Admin only):
// Director/EA need to pick a name here without being granted general user-directory read access.
workspacesRouter.get('/users/lookup', requireRole(...VIP_ROLES), async (req, res) => {
  try {
    const users = await UserRepository.getUsers();
    res.json({
      status: 'success',
      data: users.map((u) => ({ id: u.id, full_name: u.full_name, email: u.email, department: u.department })),
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET /api/workspaces/clusters/:clusterId/members — VIP allowlist for a cluster
workspacesRouter.get('/clusters/:clusterId/members', requireRole(...VIP_ROLES), async (req, res) => {
  try {
    const dbClient = getDbClient(req);
    const members = await WorkspaceService.getClusterVipMembers(req.params.clusterId, dbClient);
    res.json({ status: 'success', data: members });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/workspaces/clusters/:clusterId/members — assign a user to a VIP cluster
workspacesRouter.post(
  '/clusters/:clusterId/members',
  requireRole(...VIP_ROLES),
  validateBody(ClusterVipMemberSchema),
  async (req, res) => {
    try {
      const dbClient = getDbClient(req);
      await WorkspaceService.addClusterVipMember(
        req.params.clusterId,
        req.body.userId,
        req.user!.id,
        dbClient,
        req.user!.full_name,
        req.user!.role
      );
      res.json({ status: 'success' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// DELETE /api/workspaces/clusters/:clusterId/members/:userId — unassign a user
workspacesRouter.delete('/clusters/:clusterId/members/:userId', requireRole(...VIP_ROLES), async (req, res) => {
  try {
    const dbClient = getDbClient(req);
    await WorkspaceService.removeClusterVipMember(
      req.params.clusterId,
      req.params.userId,
      dbClient,
      req.user!.id,
      req.user!.full_name,
      req.user!.role
    );
    res.json({ status: 'success' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/workspaces/clusters/:clusterId/seats — add the next extension seat (max 8/cluster).
// Requires a motif + explicit visibility + permanent/temporary window (see ExtensionSeatSchema).
workspacesRouter.post(
  '/clusters/:clusterId/seats',
  requireRole(...VIP_ROLES),
  validateBody(ExtensionSeatSchema),
  async (req, res) => {
    try {
      const dbClient = getDbClient(req);
      const { reason, isPublic, isTemporary, startAt, endAt } = req.body;
      const seat = await WorkspaceService.addExtensionSeat(
        req.params.clusterId,
        dbClient,
        req.user!.id,
        req.user!.full_name,
        req.user!.role,
        { reason, isPublic, isTemporary, startAt, endAt }
      );
      res.json({ status: 'success', data: seat });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);

// PATCH /api/workspaces/seats/:seatId — full workstation update (status/reservable/metadata) for
// the admin edit modal. Previously this called Supabase directly from the browser, which silently
// no-oped under RLS whenever the session wasn't a real authenticated admin (e.g. demo mode).
// A prior session removed gci_manager from this gate based on the narrative persona text, but
// SRS §13 row "Gérer postes" explicitly grants RU to both Building Manager and GCI Manager —
// restored here to match the authoritative matrix.
workspacesRouter.patch(
  '/seats/:seatId',
  requirePermission('manage_workstations', 'update', ['admin', 'super_admin', 'building_manager', 'gci_manager']),
  validateBody(WorkstationUpdateSchema),
  async (req, res) => {
    try {
      const dbClient = getDbClient(req);
      const ok = await WorkstationRepository.updateWorkstation(req.params.seatId, req.body, dbClient);
      if (!ok) {
        res.status(404).json({ status: 'error', message: 'Poste introuvable ou mise à jour refusée.' });
        return;
      }

      const { AuditRepository } = await import('@/database/repositories/auditRepository');
      await AuditRepository.logEvent(
        'UPDATE',
        req.user!.id,
        req.user!.full_name,
        req.user!.role,
        req.params.seatId,
        `Poste ${req.params.seatId} édité (${Object.keys(req.body).join(', ')}).`,
        '10.120.4.18',
        'cluster_management'
      );

      res.json({ status: 'success' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// POST /api/workspaces/clusters — SRS §13 "Gérer clusters" (C). No create path existed before:
// clusters were only ever inserted by the seeder.
workspacesRouter.post(
  '/clusters',
  requirePermission('manage_clusters', 'create', RESOURCE_CRUD_ROLES),
  validateBody(ClusterCreateSchema),
  async (req, res) => {
    try {
      const created = await WorkspaceService.createCluster(
        req.body,
        req.user!.id,
        req.user!.full_name,
        req.user!.role,
        getDbClient(req)
      );
      res.status(201).json({ status: 'success', data: created });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);

// PATCH /api/workspaces/clusters/:clusterId/enabled — SRS §13 "Gérer clusters" (D, soft delete).
workspacesRouter.patch(
  '/clusters/:clusterId/enabled',
  requirePermission('manage_clusters', 'delete', RESOURCE_CRUD_ROLES),
  validateBody(EnabledToggleSchema),
  async (req, res) => {
    try {
      await WorkspaceService.setClusterEnabled(
        req.params.clusterId,
        req.body.enabled,
        req.user!.id,
        req.user!.full_name,
        req.user!.role,
        getDbClient(req)
      );
      res.json({ status: 'success' });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);

// POST /api/workspaces/clusters/:clusterId/workstations — SRS §13 "Gérer postes" (C).
workspacesRouter.post(
  '/clusters/:clusterId/workstations',
  requirePermission('manage_workstations', 'create', RESOURCE_CRUD_ROLES),
  validateBody(WorkstationCreateSchema),
  async (req, res) => {
    try {
      const created = await WorkstationRepository.createWorkstation(
        req.params.clusterId,
        req.body,
        getDbClient(req)
      );

      const { AuditRepository } = await import('@/database/repositories/auditRepository');
      await AuditRepository.logEvent(
        'CREATE',
        req.user!.id,
        req.user!.full_name,
        req.user!.role,
        created.code,
        `Poste ${created.code} créé.`,
        '10.120.4.18',
        'cluster_management'
      );

      res.status(201).json({ status: 'success', data: created });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);

// PATCH /api/workspaces/clusters/:clusterId/workstations/:seatId/enabled — SRS §13 "Gérer
// postes" (D, soft delete: the seat leaves booking flows but keeps its history).
workspacesRouter.patch(
  '/clusters/:clusterId/workstations/:seatId/enabled',
  requirePermission('manage_workstations', 'delete', RESOURCE_CRUD_ROLES),
  validateBody(EnabledToggleSchema),
  async (req, res) => {
    try {
      const dbClient = getDbClient(req);
      const disabled = !req.body.enabled;
      const ok = await WorkstationRepository.setWorkstationDisabled(req.params.seatId, disabled, dbClient);
      if (!ok) throw new Error("Le poste n'a pas pu être mis à jour.");

      const code = (await WorkstationRepository.getWorkstationCode(req.params.seatId, dbClient)) || req.params.seatId;

      const { AuditRepository } = await import('@/database/repositories/auditRepository');
      await AuditRepository.logEvent(
        disabled ? 'DELETE' : 'UPDATE',
        req.user!.id,
        req.user!.full_name,
        req.user!.role,
        code,
        `Poste ${code} ${disabled ? 'désactivé (suppression logique)' : 'réactivé'}.`,
        '10.120.4.18',
        'cluster_management'
      );

      res.json({ status: 'success' });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);

// POST /api/workspaces/clusters/:clusterId/access-requests — BR-09/§14.4: any authenticated
// user can request temporary access to a locked management cluster.
workspacesRouter.post(
  '/clusters/:clusterId/access-requests',
  validateBody(ClusterAccessRequestSchema),
  async (req, res) => {
    try {
      const { reason, startsAt, endsAt } = req.body;
      const request = await ClusterAuthorizationService.requestAccess(
        req.params.clusterId,
        req.user!.id,
        req.user!.full_name,
        reason,
        startsAt,
        endsAt
      );
      res.status(201).json({ status: 'success', data: request });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);

// GET /api/workspaces/clusters/access-requests/pending — Building/GCI Manager, Admin, Super Admin
workspacesRouter.get(
  '/clusters/access-requests/pending',
  requirePermission('authorize_cluster_management', 'approve', CLUSTER_AUTH_DECIDER_ROLES),
  async (req, res) => {
    try {
      const dbClient = getDbClient(req);
      const pending = await ClusterAuthorizationRepository.getPending(dbClient);
      res.json({ status: 'success', data: pending });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// GET /api/workspaces/clusters/access-requests — full history for the Autorisations Management
// screen (active windows + decided requests). Same decider-only gate as /pending.
workspacesRouter.get(
  '/clusters/access-requests',
  requirePermission('authorize_cluster_management', 'approve', CLUSTER_AUTH_DECIDER_ROLES),
  async (req, res) => {
    try {
      const dbClient = getDbClient(req);
      const history = await ClusterAuthorizationRepository.getHistory(200, dbClient);
      res.json({ status: 'success', data: history });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// PATCH /api/workspaces/clusters/access-requests/:id/decision — approve unlocks the cluster
// for the decider-set window only; refuse just records the decision.
workspacesRouter.patch(
  '/clusters/access-requests/:id/decision',
  requirePermission('authorize_cluster_management', 'approve', CLUSTER_AUTH_DECIDER_ROLES),
  validateBody(ClusterAccessDecisionSchema),
  async (req, res) => {
    try {
      const { decision, note, startsAt, endsAt } = req.body;
      const decided = await ClusterAuthorizationService.decide(
        req.params.id,
        decision,
        req.user!.id,
        req.user!.full_name,
        req.user!.role,
        note,
        startsAt,
        endsAt
      );
      res.json({ status: 'success', data: decided });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);
