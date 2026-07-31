import { Router } from 'express';
import { SettingsService } from '../../services/settings/settingsService';

export const settingsRouter = Router();

settingsRouter.get('/', (req, res) => {
  try {
    const settings = SettingsService.getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

settingsRouter.put('/', (req, res) => {
  try {
    const settings = SettingsService.updateSettings(req.body);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

settingsRouter.post('/reset', (req, res) => {
  try {
    const settings = SettingsService.resetSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset settings' });
  }
});
