import { Router } from 'express';
import { WorkspaceService } from '@/services/workspaces/workspaceService';

export const workspacesRouter = Router();

workspacesRouter.get('/clusters', async (req, res) => {
  try {
    const todayDate = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const clusters = await WorkspaceService.fetchClustersWithOverlays(todayDate);
    res.json({
      status: 'success',
      data: clusters,
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

workspacesRouter.patch('/clusters/:clusterId/seats/:seatId/visibility', async (req, res) => {
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
});

workspacesRouter.patch('/clusters/:clusterId/seats/:seatId/maintenance', async (req, res) => {
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
});
