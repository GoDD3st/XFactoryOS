import { Router } from 'express';
import { NoShowService } from '../../services';
import { requireRole, requirePermission } from '../middleware/rbacMiddleware';

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
// GET /api/noshow/stats - a KPI card, not an operation.
//
// It was gated with requireRole('building_manager', 'admin', 'super_admin') alongside /detect and
// /scan, which is the right list for those two: they RUN the sweep and change reservation state.
// /stats only counts. It feeds the "No-Shows Détectés" card on the executive dashboard, and that
// dashboard is on the menu for GCI Manager, Director, Executive Assistant and Building Manager -
// so every role outside those three got a 403 for a panel their own navigation had just opened,
// and the card sat at zero as though the site had no no-shows at all. Reported from the console as
// `GET /api/noshow/stats 403` on a gci_manager session.
//
// SRS §13 grants Analytics R to exactly the set that should see this, so it is gated the same way
// the rest of the telemetry is - through the `analytics` permission, which also means a Super
// Admin can move it from the Roles & Permissions screen like every other analytics read.
const NOSHOW_STATS_ROLES = [
  'super_admin',
  'admin',
  'building_manager',
  'gci_manager',
  'executive_assistant',
  'director',
  'it_admin',
  'security_guard',
] as const;

noShowRouter.get('/stats', requirePermission('analytics', 'read', NOSHOW_STATS_ROLES), async (req, res) => {
  try {
    const stats = await NoShowService.getNoShowStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});
