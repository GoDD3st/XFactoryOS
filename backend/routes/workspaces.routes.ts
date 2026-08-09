import { Router } from 'express';
import { WorkspaceService } from '@/services/workspaces/workspaceService';
import { WorkstationRepository } from '@/database/repositories/workstationRepository';
import { UserRepository } from '@/database/repositories/userRepository';
import { requireRole } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import {
  MaintenanceToggleSchema,
  VisibilityToggleSchema,
  ManagementLockSchema,
  ClusterVipToggleSchema,
  ClusterVipMemberSchema,
  WorkstationUpdateSchema,
  ExtensionSeatSchema,
} from '../validators';
import { getServerWriteClient, extractBearerToken, hasAdminClient, requireAdminClient } from '@/database/serverClient';

// SRS 8.4: GCI Manager "peut autoriser les réservations de clusters management et suivre la
// valeur d'usage" — this is the specific authority the VIP/reserved-cluster endpoints below
// govern, so gci_manager belongs in this pool. It was previously absent here entirely (only
// appearing on the shared management-lock endpoint below), leaving the role almost powerless
// despite the SRS explicitly naming it as the approver of management-cluster access.
const VIP_ROLES = ['director', 'executive_assistant', 'gci_manager', 'admin', 'super_admin'] as const;

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
  requireRole('admin', 'super_admin', 'building_manager', 'gci_manager'),
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
  requireRole('building_manager', 'gci_manager', 'admin', 'super_admin'),
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
  requireRole('building_manager', 'gci_manager', 'admin', 'super_admin'),
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
  requireRole('admin', 'super_admin', 'building_manager', 'gci_manager'),
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
