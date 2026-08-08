import { Router } from 'express';
import { TelemetryService } from '@/services/telemetry/telemetryService';

export const telemetryRouter = Router();

// GET /api/telemetry/occupancy — Authenticated users
telemetryRouter.get('/occupancy', async (req, res) => {
  try {
    const data = await TelemetryService.getRealTimeTelemetry();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de la récupération des télémétries' });
  }
});

// GET /api/telemetry/trends — FR-86 daily reservation volume (last N days)
telemetryRouter.get('/trends', async (req, res) => {
  try {
    const days = Math.min(60, Math.max(7, parseInt(String(req.query.days || '14'), 10) || 14));
    const data = await TelemetryService.getReservationTrends(days);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de la récupération des tendances' });
  }
});
