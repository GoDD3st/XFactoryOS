import { Router } from 'express';
import { WorkspaceService } from '@/services/workspaces/workspaceService';
import { requireRole } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import { MaintenanceToggleSchema, VisibilityToggleSchema } from '../validators';

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
