import { Router } from 'express';
import { SecurityService } from '@/services/security/securityService';
import { requireRole } from '../middleware/rbacMiddleware';

export const securityRouter = Router();

// GET /api/security/evacuation-roster — Security Guard & Admin roles only
securityRouter.get('/evacuation-roster', requireRole('security_guard', 'admin', 'super_admin'), async (req, res) => {
  try {
    const data = await SecurityService.getEvacuationRoster();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de la récupération du registre d\'évacuation' });
  }
});
