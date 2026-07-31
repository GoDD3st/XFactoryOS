import { Router } from 'express';
import { HardwareService } from '@/services/hardware/hardwareService';

export const hardwareRouter = Router();

hardwareRouter.get('/diagnostics', async (req, res) => {
  try {
    const data = HardwareService.getHardwareDiagnostics();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch hardware diagnostics' });
  }
});

hardwareRouter.post('/reset-port', async (req, res) => {
  try {
    const { workstation_code } = req.body;
    HardwareService.resetHardwarePort(workstation_code);
    res.json({ success: true, message: `Port ETH-SAF-${workstation_code} reset successfully` });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to reset port' });
  }
});
