import { Router } from 'express';
import { NoShowService } from '../../services';
import { requireRole } from '../middleware/rbacMiddleware';

export const noShowRouter = Router();

// GET /api/noshow/detect - Building Manager & Admin roles only
noShowRouter.get('/detect', requireRole('building_manager', 'admin', 'super_admin'), async (req, res) => {
  try {
    const count = await NoShowService.detectNoShows();
    res.json({ status: 'success', detected: count });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/noshow/scan - Trigger manual scan (Building Manager, Admin, Super Admin)
noShowRouter.post('/scan', requireRole('building_manager', 'admin', 'super_admin'), async (req, res) => {
  try {
    const count = await NoShowService.detectNoShows();
    res.json({ status: 'success', message: `No-show scan completed. Released ${count} seat(s).`, detected: count });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET /api/noshow/stats - Building Manager & Admin roles only
noShowRouter.get('/stats', requireRole('building_manager', 'admin', 'super_admin'), async (req, res) => {
  try {
    const stats = await NoShowService.getNoShowStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});
