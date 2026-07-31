import { Router } from 'express';
import { TelemetryService } from '@/services/telemetry/telemetryService';

export const telemetryRouter = Router();

telemetryRouter.get('/occupancy', async (req, res) => {
  try {
    const data = await TelemetryService.getRealTimeTelemetry();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch telemetry data' });
  }
});
