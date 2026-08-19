import { Router } from 'express';
import { TelemetryService } from '@/services/telemetry/telemetryService';
import { requirePermission } from '../middleware/rbacMiddleware';

export const telemetryRouter = Router();

// SRS §13 matrix row "Analytics": R for Super Admin, Admin, Building Manager, GCI Manager,
// Executive Assistant, Director, IT Admin, Security - X for Receptionist/Employee/Visitor. These
// routes had no role check at all, so any authenticated collaborator could hit occupancy/trend
// data the UI never surfaces to them.
//
// IT Admin and Security keep their R here even though neither has a Dashboard tab in RoleShell -
// that omission is deliberate (see the it_admin block there: the executive KPI view is the
// business roles' surface, not technical operations). The permission is not dead: requirePermission
// reads role_permissions and only falls back to this list when the table is unreadable, so a Super
// Admin can grant or revoke analytics for these roles from the Roles & Permissions screen and the
// API follows immediately. Narrowing this list would contradict the SRS row above AND take that
// toggle away, so it stays.
//
// Caveat, if you are here because a Super Admin granted analytics and "nothing happened": the
// toggle moves the API only. The tab lists in RoleShell are a hardcoded Record<UserRole, Tab[]>
// and read no permission at all, so the Dashboard tab will not appear. Making the menu follow the
// policy table is unbuilt work, not a bug in this file.
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
telemetryRouter.get('/occupancy', requirePermission('analytics', 'read', ANALYTICS_ROLES), async (req, res) => {
  try {
    const data = await TelemetryService.getRealTimeTelemetry();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de la récupération des télémétries' });
  }
});

// GET /api/telemetry/trends - FR-86 daily reservation volume (last N days)
telemetryRouter.get('/trends', requirePermission('analytics', 'read', ANALYTICS_ROLES), async (req, res) => {
  try {
    // The window is the caller's choice. It used to be clamped to 7..60, which silently
    // rewrote any request outside that band - asking for a year returned two months with no
    // indication the answer was not what was asked. The remaining bounds only stop a degenerate
    // request (0 or negative) and an unbounded scan.
    const requested = parseInt(String(req.query.days ?? '14'), 10);
    const days = Math.min(730, Math.max(1, Number.isFinite(requested) ? requested : 14));
    const data = await TelemetryService.getReservationTrends(days);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de la récupération des tendances' });
  }
});

// GET /api/telemetry/departments - SRS "User Statistics" / "Department Statistics"
telemetryRouter.get('/departments', requirePermission('analytics', 'read', ANALYTICS_ROLES), async (req, res) => {
  try {
    const data = await TelemetryService.getUserDepartmentStats();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de la récupération des statistiques utilisateurs' });
  }
});

// GET /api/telemetry/prediction - SRS "AI Predictions" (same-weekday historical average).
// Takes no parameters on purpose: capacity is derived server-side, see getOccupancyPrediction.
telemetryRouter.get('/prediction', requirePermission('analytics', 'read', ANALYTICS_ROLES), async (req, res) => {
  try {
    const data = await TelemetryService.getOccupancyPrediction();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec du calcul de la prévision d’occupation' });
  }
});
