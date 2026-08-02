import { SystemSettings } from '@/frontend/src/types';
import { SettingsRepository } from '@/database/repositories/settingsRepository';

export class SettingsService {
  static getSettings(): SystemSettings {
    SettingsRepository.getSettings().then((data) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('xfactory_settings_v2', JSON.stringify(data));
      }
    });

    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('xfactory_settings_v2');
      if (cached) return JSON.parse(cached);
    }
    return SettingsRepository.DEFAULT_SETTINGS;
  }

  static updateSettings(partial: Partial<SystemSettings>): SystemSettings {
    const updated = { ...this.getSettings(), ...partial };

    SettingsRepository.updateSettings(partial);

    if (typeof window !== 'undefined') {
      localStorage.setItem('xfactory_settings_v2', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('xfactory_settings_changed', { detail: updated }));
    }

    return updated;
  }

  static resetSettings(): SystemSettings {
    return this.updateSettings(SettingsRepository.DEFAULT_SETTINGS);
  }
}
