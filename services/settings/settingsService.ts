import { SystemSettings } from '@/frontend/src/types';
import { SettingsRepository } from '@/database/repositories/settingsRepository';
import { supabase } from '@/database/client';
import { isDemoMode } from '@/frontend/src/modules/auth/utils/demoMode';

async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extra };

  if (!isDemoMode()) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Vous devez être connecté pour effectuer cette action.');
    headers.Authorization = `Bearer ${token}`;
  }
  // Demo mode: no Authorization header — AuthContext's global fetch interceptor
  // injects X-Demo-Role, which authMiddleware.ts's DEMO_MODE branch honors.

  return headers;
}

export class SettingsService {
  /**
   * Server (backend/routes/settings.routes.ts): reads live from Supabase.
   * Browser: returns the cached value immediately for a fast paint, then refreshes the cache
   * in the background — callers needing the live value from the browser should await
   * SettingsRepository.getSettings() (or the password-confirmed /api/settings flow) directly.
   */
  static getSettings(): SystemSettings | Promise<SystemSettings> {
    if (typeof window === 'undefined') {
      return SettingsRepository.getSettings();
    }

    SettingsRepository.getSettings().then((data) => {
      localStorage.setItem('xfactory_settings_v2', JSON.stringify(data));
    });

    const cached = localStorage.getItem('xfactory_settings_v2');
    if (cached) return JSON.parse(cached);
    return SettingsRepository.DEFAULT_SETTINGS;
  }

  /** Server-only direct write (bypasses password re-verification — used by the legacy
   * PUT /api/settings route only; the Super Admin/Admin UI goes through confirmWithPassword). */
  static async updateSettings(partial: Partial<SystemSettings>): Promise<SystemSettings> {
    return SettingsRepository.updateSettings(partial);
  }

  /**
   * Pure local helper for the Settings form's "Réinitialiser" button — resets the in-progress,
   * unsaved form back to defaults. Deliberately does NOT write to the database: persisting a
   * reset still has to go through the password-confirmed save flow like any other settings change.
   */
  static resetToDefaults(): SystemSettings {
    return { ...SettingsRepository.DEFAULT_SETTINGS };
  }

  /** Server-only: actually resets and persists defaults (used by POST /api/settings/reset). */
  static async resetSettings(): Promise<SystemSettings> {
    return SettingsRepository.updateSettings(SettingsRepository.DEFAULT_SETTINGS);
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
   * Step-up re-authentication: the admin re-enters their password, the server verifies it with
   * a fresh signInWithPassword check (never touches the caller's real session), then applies and
   * persists the settings change. Replaces the old same-session OTP, which was delivered as an
   * in-app notification to the very session making the request — no real second factor — and had
   * a client-only fallback that stored the "OTP" in sessionStorage (trivially readable via
   * devtools). A genuine network failure here is a real failure now, not a silent security
   * downgrade — no offline fallback.
   */
  static async confirmWithPassword(
    password: string,
    newSettings: Partial<SystemSettings>
  ): Promise<SystemSettings> {
    const res = await fetch('/api/settings/confirm-with-password', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ password, settings: newSettings }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || 'Mot de passe incorrect ou échec de la mise à jour.');
    }

    const json = await res.json();
    const updated = json.data;
    if (typeof window !== 'undefined') {
      localStorage.setItem('xfactory_settings_v2', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('xfactory_settings_changed', { detail: updated }));
    }
    return updated;
  }
}
