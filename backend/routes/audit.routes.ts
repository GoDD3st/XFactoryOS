import { Router } from 'express';
import { AuditService } from '@/services/audit/auditService';

export const auditRouter = Router();

auditRouter.get('/', async (req, res) => {
  try {
    const data = AuditService.getAuditLogs();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
  }
});

auditRouter.post('/', async (req, res) => {
  try {
    const { action, actor_id, actor_name, actor_role, target_resource, details, ip_address } = req.body;
    const log = AuditService.logAuditEvent(action, actor_id, actor_name, actor_role, target_resource, details, ip_address);
    res.json({ success: true, data: log });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to record audit event' });
  }
});
