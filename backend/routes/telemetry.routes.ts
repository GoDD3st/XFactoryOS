import { Router } from 'express';
import { TelemetryService } from '@/services/telemetry/telemetryService';
import { requireRole } from '../middleware/rbacMiddleware';

export const telemetryRouter = Router();

// SRS §13 matrix row "Analytics": R for Super Admin, Admin, Building Manager, GCI Manager,
// Executive Assistant, Director, IT Admin, Security — X for Receptionist/Employee/Visitor. These
// routes had no role check at all, so any authenticated collaborator could hit occupancy/trend
// data the UI never surfaces to them.
const ANALYTICS_ROLES = [
  'super_admin',
  'admin',
  'building_manager',
  'gci_manager',
  'executive_assistant',
  'director',
  'it_admin',
  'security_guard',
] as const;

// GET /api/telemetry/occupancy
telemetryRouter.get('/occupancy', requireRole(...ANALYTICS_ROLES), async (req, res) => {
  try {
    const data = await TelemetryService.getRealTimeTelemetry();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de la récupération des télémétries' });
  }
});

// GET /api/telemetry/trends — FR-86 daily reservation volume (last N days)
telemetryRouter.get('/trends', requireRole(...ANALYTICS_ROLES), async (req, res) => {
  try {
    const days = Math.min(60, Math.max(7, parseInt(String(req.query.days || '14'), 10) || 14));
    const data = await TelemetryService.getReservationTrends(days);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de la récupération des tendances' });
  }
});
