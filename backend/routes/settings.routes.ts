import { Router } from 'express';
import { SettingsService } from '../../services/settings/settingsService';
import { requireRole } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import { SystemSettingsUpdateSchema } from '../validators';

export const settingsRouter = Router();

// GET /api/settings — Authenticated users
settingsRouter.get('/', (req, res) => {
  try {
    const settings = SettingsService.getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Échec de la récupération des paramètres' });
  }
});

// PUT /api/settings — Admin & Super Admin only (Zod validated)
settingsRouter.put('/', requireRole('admin', 'super_admin'), validateBody(SystemSettingsUpdateSchema), (req, res) => {
  try {
    const settings = SettingsService.updateSettings(req.body);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Échec de la mise à jour des paramètres' });
  }
});

// POST /api/settings/reset — Super Admin only
settingsRouter.post('/reset', requireRole('super_admin'), (req, res) => {
  try {
    const settings = SettingsService.resetSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Échec de la réinitialisation des paramètres' });
  }
});
