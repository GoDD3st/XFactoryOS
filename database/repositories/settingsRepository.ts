import { supabase } from '../client';
import { SystemSettings } from '@/frontend/src/types';

export class SettingsRepository {
  static DEFAULT_SETTINGS: SystemSettings = {
    maxReservationDaysWithoutApproval: 3,
    noShowDelayMinutes: 30,
    workingHoursStart: '08:00',
    workingHoursEnd: '18:00',
    workingDays: [1, 2, 3, 4, 5],
    extensionSeatsVisibleByDefault: false,
    managementClustersEnabled: false,
    theme: 'dark',
    siteName: 'OCP SA - Safi Site XFactory OS',
  };

  static async getSettings(): Promise<SystemSettings> {
    try {
      const { data, error } = await supabase.from('settings').select('*').limit(1).single();

      if (error || !data) return this.DEFAULT_SETTINGS;

      return {
        maxReservationDaysWithoutApproval: Math.round((data.max_duration_hours_no_approval || 72) / 24),
        noShowDelayMinutes: data.no_show_window_minutes || 30,
        workingHoursStart: data.business_hours_start ? data.business_hours_start.substring(0, 5) : '08:00',
        workingHoursEnd: data.business_hours_end ? data.business_hours_end.substring(0, 5) : '18:00',
        workingDays: data.business_days || [1, 2, 3, 4, 5],
        extensionSeatsVisibleByDefault: false,
        managementClustersEnabled: false,
        theme: 'dark',
        siteName: 'OCP SA - Safi Site XFactory OS',
      };
    } catch (err) {
      return this.DEFAULT_SETTINGS;
    }
  }

  static async updateSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
    try {
      const dbPayload = {
        max_duration_hours_no_approval: (settings.maxReservationDaysWithoutApproval || 3) * 24,
        no_show_window_minutes: settings.noShowDelayMinutes || 30,
        business_hours_start: settings.workingHoursStart ? `${settings.workingHoursStart}:00` : '08:00:00',
        business_hours_end: settings.workingHoursEnd ? `${settings.workingHoursEnd}:00` : '18:00:00',
        business_days: settings.workingDays || [1, 2, 3, 4, 5],
        updated_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase.from('settings').select('id').limit(1).single();

      if (existing) {
        await supabase.from('settings').update(dbPayload).eq('id', existing.id);
      } else {
        await supabase.from('settings').insert(dbPayload);
      }

      return { ...this.DEFAULT_SETTINGS, ...settings };
    } catch (err) {
      console.warn('Update settings fallback:', err);
      return { ...this.DEFAULT_SETTINGS, ...settings };
    }
  }
}
