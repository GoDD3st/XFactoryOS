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
} from '../validators';
import { getServerWriteClient, extractBearerToken, hasAdminClient, requireAdminClient } from '@/database/serverClient';

const VIP_ROLES = ['director', 'executive_assistant', 'admin', 'super_admin'] as const;

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

// PATCH /api/workspaces/clusters/:clusterId/seats/:seatId/visibility — Admins only
workspacesRouter.patch(
  '/clusters/:clusterId/seats/:seatId/visibility',
  requireRole('admin', 'super_admin'),
  validateBody(VisibilityToggleSchema),
  async (req, res) => {
    try {
      const { visibleToUsers } = req.body;
      await WorkspaceService.toggleExtensionSeatVisibility(
        req.params.clusterId,
        req.params.seatId,
        visibleToUsers
      );
      res.json({ status: 'success' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// PATCH /api/workspaces/clusters/:clusterId/seats/:seatId/maintenance — Building Manager & Admins only
workspacesRouter.patch(
  '/clusters/:clusterId/seats/:seatId/maintenance',
  requireRole('building_manager', 'admin', 'super_admin'),
  validateBody(MaintenanceToggleSchema),
  async (req, res) => {
    try {
      const { isMaintenance } = req.body;
      await WorkspaceService.setSeatMaintenanceStatus(
        req.params.clusterId,
        req.params.seatId,
        isMaintenance
      );
      res.json({ status: 'success' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// PATCH /api/workspaces/clusters/:clusterId/management-lock — BR-09: GCI/Building Manager or Admins only
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
      await WorkspaceService.addClusterVipMember(req.params.clusterId, req.body.userId, req.user!.id, dbClient);
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
    await WorkspaceService.removeClusterVipMember(req.params.clusterId, req.params.userId, dbClient);
    res.json({ status: 'success' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/workspaces/clusters/:clusterId/seats — add the next extension seat (max 8/cluster)
workspacesRouter.post('/clusters/:clusterId/seats', requireRole(...VIP_ROLES), async (req, res) => {
  try {
    const dbClient = getDbClient(req);
    const seat = await WorkspaceService.addExtensionSeat(req.params.clusterId, dbClient);
    res.json({ status: 'success', data: seat });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

// PATCH /api/workspaces/seats/:seatId — full workstation update (status/reservable/metadata) for
// the admin edit modal. Previously this called Supabase directly from the browser, which silently
// no-oped under RLS whenever the session wasn't a real authenticated admin (e.g. demo mode).
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
      res.json({ status: 'success' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);
