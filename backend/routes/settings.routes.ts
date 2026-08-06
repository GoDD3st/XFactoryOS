import { Router } from 'express';
import { SettingsService } from '../../services/settings/settingsService';
import { SettingsRepository } from '../../database/repositories/settingsRepository';
import { OTPSettingsService } from '../../services/settings/otpSettingsService';
import { requireRole } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import { SystemSettingsUpdateSchema, ConfirmSettingsUpdateSchema } from '../validators';

export const settingsRouter = Router();

// GET /api/settings — Authenticated users
settingsRouter.get('/', async (req, res) => {
  try {
    const settings = await SettingsService.getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Échec de la récupération des paramètres' });
  }
});

// PUT /api/settings — Admin & Super Admin only (Zod validated)
settingsRouter.put('/', requireRole('admin', 'super_admin'), validateBody(SystemSettingsUpdateSchema), async (req, res) => {
  try {
    const settings = await SettingsService.updateSettings(req.body);
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Échec de la mise à jour des paramètres' });
  }
});

// POST /api/settings/reset — Super Admin only
settingsRouter.post('/reset', requireRole('super_admin'), async (req, res) => {
  try {
    const settings = await SettingsService.resetSettings();
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Échec de la réinitialisation des paramètres' });
  }
});

// GET /api/settings/history — Super Admin only. Version history of past config changes.
settingsRouter.get('/history', requireRole('super_admin'), async (req, res) => {
  try {
    const history = await SettingsRepository.getSettingsHistory();
    res.json({ status: 'success', data: history });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/settings/request-update — Super Admin only. Step 1 of OTP flow (1-min TTL):
// validates requested changes and issues a 6-digit OTP.
settingsRouter.post(
  '/request-update',
  requireRole('super_admin'),
  validateBody(SystemSettingsUpdateSchema),
  async (req, res) => {
    try {
      const result = await OTPSettingsService.requestUpdate(
        req.user!.id,
        req.body
      );
      res.json({ status: 'otp_sent', ...result });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);

// POST /api/settings/confirm-update — Super Admin only. Step 2 of OTP flow:
// validates OTP code and, if correct, applies & persists change + logs audit diff.
settingsRouter.post(
  '/confirm-update',
  requireRole('super_admin'),
  validateBody(ConfirmSettingsUpdateSchema),
  async (req, res) => {
    try {
      const result = await OTPSettingsService.confirmUpdate(
        req.body.challengeId,
        req.body.otpCode,
        req.user!.id
      );

      if (!result.success) {
        res.status(400).json({ status: 'error', message: result.error });
        return;
      }

      res.json({ status: 'success', data: result.updatedSettings });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);