import { supabase } from '../client';
import { SystemSettings, UserRole } from '@/frontend/src/types';

export class SettingsRepository {
  static DEFAULT_SETTINGS: SystemSettings = {
    bookingWindowDays: 2,
    minReservationMinutes: 30,
    maxReservationMinutes: 480,
    maxReservationDaysWithoutApproval: 2,
    maxReservationsPerUserPerDay: 2,
    maxReservationsPerUserPerWeek: 5,
    workingHoursStart: '08:00',
    workingHoursEnd: '18:00',
    workingDays: [1, 2, 3, 4, 5],
    bypassRoles: ['admin', 'super_admin', 'director', 'executive_assistant'] as UserRole[],
    allowWeekendBooking: false,
    allowHolidayBooking: false,
    noShowDelayMinutes: 30,
    extensionSeatsVisibleByDefault: false,
    managementClustersEnabled: false,
    theme: 'dark',
    siteName: 'OCP SA - Safi Site XFactory OS',
    configVersion: 1,
  };

  static async getSettings(): Promise<SystemSettings> {
    try {
      const { data, error } = await supabase.from('settings').select('*').limit(1).single();

      if (error || !data) return this.DEFAULT_SETTINGS;

      // Extract raw config JSON if present, or column values
      const raw = data.raw_config || {};

      return {
        bookingWindowDays: data.booking_window_days ?? raw.bookingWindowDays ?? 2,
        minReservationMinutes: data.min_reservation_minutes ?? raw.minReservationMinutes ?? 30,
        maxReservationMinutes: data.max_reservation_minutes ?? raw.maxReservationMinutes ?? 480,
        maxReservationDaysWithoutApproval: data.max_duration_hours_no_approval 
          ? Math.round(data.max_duration_hours_no_approval / 24) 
          : (raw.maxReservationDaysWithoutApproval ?? 2),
        maxReservationsPerUserPerDay: data.max_reservations_per_day ?? raw.maxReservationsPerUserPerDay ?? 2,
        maxReservationsPerUserPerWeek: data.max_reservations_per_week ?? raw.maxReservationsPerUserPerWeek ?? 5,
        workingHoursStart: data.business_hours_start ? data.business_hours_start.substring(0, 5) : (raw.workingHoursStart ?? '08:00'),
        workingHoursEnd: data.business_hours_end ? data.business_hours_end.substring(0, 5) : (raw.workingHoursEnd ?? '18:00'),
        workingDays: data.business_days || raw.workingDays || [1, 2, 3, 4, 5],
        bypassRoles: (data.bypass_roles || raw.bypassRoles || ['admin', 'super_admin', 'director', 'executive_assistant']) as UserRole[],
        allowWeekendBooking: data.allow_weekend_booking ?? raw.allowWeekendBooking ?? false,
        allowHolidayBooking: data.allow_holiday_booking ?? raw.allowHolidayBooking ?? false,
        noShowDelayMinutes: data.no_show_window_minutes || raw.noShowDelayMinutes || 30,
        extensionSeatsVisibleByDefault: raw.extensionSeatsVisibleByDefault ?? false,
        managementClustersEnabled: raw.managementClustersEnabled ?? false,
        theme: raw.theme || 'dark',
        siteName: raw.siteName || 'OCP SA - Safi Site XFactory OS',
        configVersion: data.config_version || raw.configVersion || 1,
        updated_at: data.updated_at,
        updated_by: data.updated_by,
      };
    } catch (err) {
      console.warn('getSettings fallback to default:', err);
      return this.DEFAULT_SETTINGS;
    }
  }

  static async updateSettings(settings: Partial<SystemSettings>, adminId?: string): Promise<SystemSettings> {
    try {
      const current = await this.getSettings();
      const updated: SystemSettings = {
        ...current,
        ...settings,
        configVersion: (current.configVersion || 1) + 1,
        updated_at: new Date().toISOString(),
        updated_by: adminId || current.updated_by,
      };

      const dbPayload = {
        booking_window_days: updated.bookingWindowDays,
        min_reservation_minutes: updated.minReservationMinutes,
        max_reservation_minutes: updated.maxReservationMinutes,
        max_duration_hours_no_approval: updated.maxReservationDaysWithoutApproval * 24,
        max_reservations_per_day: updated.maxReservationsPerUserPerDay,
        max_reservations_per_week: updated.maxReservationsPerUserPerWeek,
        business_hours_start: `${updated.workingHoursStart}:00`,
        business_hours_end: `${updated.workingHoursEnd}:00`,
        business_days: updated.workingDays,
        bypass_roles: updated.bypassRoles,
        allow_weekend_booking: updated.allowWeekendBooking,
        allow_holiday_booking: updated.allowHolidayBooking,
        no_show_window_minutes: updated.noShowDelayMinutes,
        config_version: updated.configVersion,
        raw_config: updated,
        updated_by: adminId,
        updated_at: updated.updated_at,
      };

      const { data: existing } = await supabase.from('settings').select('id').limit(1).single();

      if (existing) {
        await supabase.from('settings').update(dbPayload).eq('id', existing.id);
      } else {
        await supabase.from('settings').insert(dbPayload);
      }

      return updated;
    } catch (err) {
      console.warn('Update settings fallback:', err);
      return { ...this.DEFAULT_SETTINGS, ...settings };
    }
  }

  /**
   * Retrieve the configuration version history (who changed what, and when),
   * sourced from audit_logs entries logged by OtpSettingsService on every confirmed change.
   */
  static async getSettingsHistory(limit: number = 25): Promise<Array<{
    id: string;
    action: string;
    admin_name: string;
    details: string;
    created_at: string;
  }>> {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .in('action', ['SETTINGS_UPDATED', 'SETTINGS_UPDATE_REQUESTED'])
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error || !data) return [];

      return data.map((l: any) => ({
        id: l.id,
        action: l.action,
        admin_name: l.before?.actor_name || 'Super Admin',
        details: l.after?.details || '',
        created_at: l.created_at,
      }));
    } catch (err) {
      console.warn('getSettingsHistory fallback:', err);
      return [];
    }
  }
}