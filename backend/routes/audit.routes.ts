import { Router } from 'express';
import { AuditService } from '@/services/audit/auditService';
import { requireRole } from '../middleware/rbacMiddleware';

export const auditRouter = Router();

// GET /api/audit — SRS §13 matrix "Audit logs": R = Super Admin, Admin, Building Manager,
// GCI Manager, Director, IT Admin, Security. (Was missing building_manager/director/security_guard
// entirely — their Audit tab silently rendered empty, not an error, so it looked "broken".)
auditRouter.get('/', requireRole('super_admin', 'admin', 'building_manager', 'gci_manager', 'director', 'it_admin', 'security_guard'), async (req, res) => {
  try {
    const data = await AuditService.getAuditLogs();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de la récupération des journaux d\'audit' });
  }
});

// POST /api/audit — System audit log entry (Actor info extracted directly from authenticated JWT session)
auditRouter.post('/', async (req, res) => {
  try {
    const { action, target_resource, details } = req.body;
    const actor_id = req.user!.id;
    const actor_name = req.user!.full_name;
    const actor_role = req.user!.role;
    const ip_address = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';

    const log = AuditService.logAuditEvent(action, actor_id, actor_name, actor_role, target_resource, details, ip_address);
    res.json({ success: true, data: log });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de l\'enregistrement de l\'événement d\'audit' });
  }
});
