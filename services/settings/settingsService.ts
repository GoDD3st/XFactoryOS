import { SystemSettings } from '@/frontend/src/types';

export class SettingsService {
  private static readonly STORAGE_KEY = 'xfactory_settings';

  private static readonly DEFAULT_SETTINGS: SystemSettings = {
    maxReservationDaysWithoutApproval: 3,
    noShowDelayMinutes: 30,
    workingHoursStart: '08:00',
    workingHoursEnd: '18:00',
    workingDays: [1, 2, 3, 4, 5],
    extensionSeatsVisibleByDefault: false,
    managementClustersEnabled: false,
    theme: 'dark',
    siteName: 'OCP SA - Safi Site XFactory'
  };

  static getSettings(): SystemSettings {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        return { ...this.DEFAULT_SETTINGS, ...JSON.parse(data) };
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }
    return { ...this.DEFAULT_SETTINGS };
  }

  static updateSettings(partial: Partial<SystemSettings>): SystemSettings {
    const current = this.getSettings();
    const updated = { ...current, ...partial };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('xfactory_settings_changed', { detail: updated }));
    return updated;
  }

  static resetSettings(): SystemSettings {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.DEFAULT_SETTINGS));
    window.dispatchEvent(new CustomEvent('xfactory_settings_changed', { detail: this.DEFAULT_SETTINGS }));
    return { ...this.DEFAULT_SETTINGS };
  }
}
