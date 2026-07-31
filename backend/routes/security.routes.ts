import { Router } from 'express';
import { SecurityService } from '@/services/security/securityService';

export const securityRouter = Router();

securityRouter.get('/evacuation-roster', async (req, res) => {
  try {
    const data = SecurityService.getEvacuationRoster();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch evacuation roster' });
  }
});

securityRouter.post('/print-badge', async (req, res) => {
  try {
    const { visitor_name, visitor_company, host_name, host_department } = req.body;
    const badge = SecurityService.generateVisitorBadge(
      visitor_name,
      visitor_company,
      host_name,
      host_department
    );
    res.json({ success: true, data: badge });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to generate visitor badge' });
  }
});
