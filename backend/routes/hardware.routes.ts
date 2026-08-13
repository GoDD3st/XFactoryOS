import { Router } from 'express';
import { HardwareService } from '@/services/hardware/hardwareService';
import { requirePermission } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import { HardwareResetSchema } from '../validators';

export const hardwareRouter = Router();

// GET /api/hardware/diagnostics — IT Admin & Admin roles only
hardwareRouter.get('/diagnostics', requirePermission('technical_administration', 'read', ['it_admin', 'admin', 'super_admin']), async (req, res) => {
  try {
    const data = await HardwareService.getHardwareDiagnostics();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de la récupération des diagnostics matériels' });
  }
});

// POST /api/hardware/reset-port — IT Admin & Admin roles only (Zod validated)
hardwareRouter.post('/reset-port', requirePermission('technical_administration', 'update', ['it_admin', 'admin', 'super_admin']), validateBody(HardwareResetSchema), async (req, res) => {
  try {
    const { workstation_code } = req.body;
    HardwareService.resetHardwarePort(workstation_code);
    res.json({ success: true, message: `Port ETH-SAF-${workstation_code} réinitialisé avec succès` });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de la réinitialisation du port' });
  }
});
