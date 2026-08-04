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

  static async getHistory() {
    try {
      const res = await fetch('/api/settings/history');
      if (res.ok) {
        const json = await res.json();
        if (json.data) return json.data;
      }
    } catch (e) {
      // Fallback
    }
    return SettingsRepository.getSettingsHistory();
  }

  /**
   * Request OTP verification for updating settings (Step 1)
   */
  static async requestUpdate(
    adminId: string,
    adminName: string,
    newSettings: Partial<SystemSettings>
  ): Promise<{ challengeId: string; expiresAt: number | string; otpCode?: string }> {
    try {
      const res = await fetch('/api/settings/request-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          challengeId: data.challengeId,
          expiresAt: data.expiresAt,
          otpCode: data.otpCodeDemo || data.otpCode,
        };
      } else {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors de la demande OTP.');
      }
    } catch (err: any) {
      // Client-side fallback if server endpoint is unreachable
      const challengeId = `cfg_chg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 1 * 60 * 1000; // 1 MINUTE TTL

      if (typeof window !== 'undefined') {
        sessionStorage.setItem(`otp_chg_${challengeId}`, JSON.stringify({
          otpCode,
          expiresAt,
          newSettings,
        }));
      }

      return { challengeId, expiresAt, otpCode };
    }
  }

  /**
   * Confirm OTP code and persist settings (Step 2)
   */
  static async confirmUpdate(
    challengeId: string,
    otpCode: string,
    adminId: string
  ): Promise<SystemSettings> {
    try {
      const res = await fetch('/api/settings/confirm-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, otpCode }),
      });

      if (res.ok) {
        const json = await res.json();
        const updated = json.data;
        if (typeof window !== 'undefined') {
          localStorage.setItem('xfactory_settings_v2', JSON.stringify(updated));
          window.dispatchEvent(new CustomEvent('xfactory_settings_changed', { detail: updated }));
        }
        return updated;
      } else {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Code OTP invalide ou expiré.');
      }
    } catch (err: any) {
      // Session storage fallback
      if (typeof window !== 'undefined') {
        const stored = sessionStorage.getItem(`otp_chg_${challengeId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Date.now() > parsed.expiresAt) {
            sessionStorage.removeItem(`otp_chg_${challengeId}`);
            throw new Error('Code OTP expiré (délai de 1 minute dépassé). Modification annulée.');
          }
          if (parsed.otpCode !== otpCode.trim()) {
            throw new Error('Code OTP incorrect.');
          }
          sessionStorage.removeItem(`otp_chg_${challengeId}`);
          return this.updateSettings(parsed.newSettings);
        }
      }
      throw err;
    }
  }
}