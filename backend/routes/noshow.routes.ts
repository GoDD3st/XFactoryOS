import { Router } from 'express';
import { NoShowService } from '../../services';
import { requireRole } from '../middleware/rbacMiddleware';

export const noShowRouter = Router();

// GET /api/noshow/detect — Building Manager & Admin roles only
noShowRouter.get('/detect', requireRole('building_manager', 'admin', 'super_admin'), (req, res) => {
  const count = NoShowService.detectNoShows();
  res.json({ detected: count });
});

// GET /api/noshow/stats — Building Manager & Admin roles only
noShowRouter.get('/stats', requireRole('building_manager', 'admin', 'super_admin'), (req, res) => {
  const stats = NoShowService.getNoShowStats();
  res.json(stats);
});
