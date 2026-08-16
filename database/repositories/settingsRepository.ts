import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../client';
import { SystemSettings, UserRole } from '@/frontend/src/types';
import { OCP_SAFI_PUBLIC_HOLIDAYS_2026 } from '@/frontend/src/shared/utils/dateValidation';

// settings write access (p_settings_admin_write) requires has_role(SUPER_ADMIN/ADMIN/IT_ADMIN),
// which needs a real Supabase Auth session - the password-confirmed settings change runs
// server-side (backend/routes/settings.routes.ts), where demo mode has no such session, so it
// must bypass RLS via the service-role client.
async function resolveClient(): Promise<SupabaseClient> {
  if (typeof window === 'undefined') {
    const { getAdminClient } = await import('../serverClient');
    const admin = getAdminClient();
    if (admin) return admin;
  }
  return supabase;
}

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
    holidays: OCP_SAFI_PUBLIC_HOLIDAYS_2026,
    closedDates: [],
    noShowDelayMinutes: 30,
    extensionSeatsVisibleByDefault: false,
    managementClustersEnabled: false,
    theme: 'dark',
    siteName: 'XFactory OS - Site Safi',
    configVersion: 1,
  };

  static async getSettings(): Promise<SystemSettings> {
    try {
      const db = await resolveClient();
      const { data, error } = await db.from('settings').select('*').limit(1).single();

      if (error || !data) return this.DEFAULT_SETTINGS;

      // `settings` only has dedicated columns for a handful of fields (business_days,
      // business_hours_*, max_duration_hours_no_approval, no_show_window_minutes) - everything
      // else lives in raw_config (jsonb), including holidays/closedDates.
      const raw = data.raw_config || {};

      return {
        bookingWindowDays: raw.bookingWindowDays ?? 2,
        minReservationMinutes: raw.minReservationMinutes ?? 30,
        maxReservationMinutes: raw.maxReservationMinutes ?? 480,
        maxReservationDaysWithoutApproval: data.max_duration_hours_no_approval
          ? Math.round(data.max_duration_hours_no_approval / 24)
          : (raw.maxReservationDaysWithoutApproval ?? 2),
        maxReservationsPerUserPerDay: raw.maxReservationsPerUserPerDay ?? 2,
        maxReservationsPerUserPerWeek: raw.maxReservationsPerUserPerWeek ?? 5,
        workingHoursStart: data.business_hours_start ? data.business_hours_start.substring(0, 5) : (raw.workingHoursStart ?? '08:00'),
        workingHoursEnd: data.business_hours_end ? data.business_hours_end.substring(0, 5) : (raw.workingHoursEnd ?? '18:00'),
        workingDays: data.business_days || raw.workingDays || [1, 2, 3, 4, 5],
        bypassRoles: (raw.bypassRoles || ['admin', 'super_admin', 'director', 'executive_assistant']) as UserRole[],
        allowWeekendBooking: raw.allowWeekendBooking ?? false,
        allowHolidayBooking: raw.allowHolidayBooking ?? false,
        holidays: raw.holidays ?? OCP_SAFI_PUBLIC_HOLIDAYS_2026,
        closedDates: raw.closedDates ?? [],
        noShowDelayMinutes: data.no_show_window_minutes ?? raw.noShowDelayMinutes ?? 30,
        extensionSeatsVisibleByDefault: raw.extensionSeatsVisibleByDefault ?? false,
        managementClustersEnabled: raw.managementClustersEnabled ?? false,
        theme: raw.theme || 'dark',
        siteName: raw.siteName || 'XFactory OS - Site Safi',
        // Own column, not part of raw_config - see updateSiteLogo.
        siteLogoDataUrl: data.site_logo_data_url ?? null,
        configVersion: raw.configVersion || 1,
        updated_at: data.updated_at,
        updated_by: data.updated_by,
      };
    } catch (err) {
      console.warn('getSettings fallback to default:', err);
      return this.DEFAULT_SETTINGS;
    }
  }

  /**
   * Writes the site logo to its own column.
   *
   * Kept out of the raw_config JSON blob that carries the rest of the settings: that blob is
   * read, merged and rewritten on every settings save, and round-tripping a few hundred KB of
   * base64 through it on each change would be wasteful and easy to clobber.
   */
  static async updateSiteLogo(dataUrl: string | null, adminId?: string): Promise<void> {
    const db = await resolveClient();
    const { data: existing } = await db.from('settings').select('id').limit(1).maybeSingle();

    const payload: Record<string, unknown> = {
      site_logo_data_url: dataUrl,
      updated_at: new Date().toISOString(),
    };
    if (adminId) payload.updated_by = adminId;

    const { error } = existing
      ? await db.from('settings').update(payload).eq('id', existing.id)
      : await db.from('settings').insert(payload);

    if (error) throw new Error(`Échec de l'enregistrement du logo : ${error.message}`);
  }

  /** Site logo for the header. Returns null when none is configured. */
  static async getSiteLogo(): Promise<string | null> {
    try {
      const db = await resolveClient();
      const { data } = await db.from('settings').select('site_logo_data_url').limit(1).maybeSingle();
      return data?.site_logo_data_url ?? null;
    } catch {
      // A missing logo must never break the header.
      return null;
    }
  }

  static async updateSettings(settings: Partial<SystemSettings>, adminId?: string): Promise<SystemSettings> {
    const current = await this.getSettings();
    const updated: SystemSettings = {
      ...current,
      ...settings,
      configVersion: (current.configVersion || 1) + 1,
      updated_at: new Date().toISOString(),
      updated_by: adminId || current.updated_by,
    };

    // Only write columns that actually exist on public.settings - everything else rides in
    // raw_config. (A previous version of this payload referenced columns like
    // booking_window_days/bypass_roles/config_version that were never real, which made every
    // settings update fail outright and silently fall back to defaults.)
    // The logo lives in its own column (site_logo_data_url) and must not be copied into
    // raw_config: getSettings() reads it back into the settings object, so leaving it here would
    // round-trip a base64 image into the JSON blob on every unrelated settings save - duplicating
    // up to 512 KB and creating a second, stale copy of the mark.
    const { siteLogoDataUrl, ...rawConfig } = updated;

    const dbPayload = {
      max_duration_hours_no_approval: updated.maxReservationDaysWithoutApproval * 24,
      business_hours_start: `${updated.workingHoursStart}:00`,
      business_hours_end: `${updated.workingHoursEnd}:00`,
      business_days: updated.workingDays,
      no_show_window_minutes: updated.noShowDelayMinutes,
      raw_config: rawConfig,
      updated_by: adminId,
      updated_at: updated.updated_at,
    };

    const db = await resolveClient();
    const { data: existing } = await db.from('settings').select('id').limit(1).single();

    const { error } = existing
      ? await db.from('settings').update(dbPayload).eq('id', existing.id)
      : await db.from('settings').insert(dbPayload);

    if (error) {
      throw new Error(`Échec de l'enregistrement des paramètres : ${error.message}`);
    }

    return updated;
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
      const db = await resolveClient();
      // 'SETTINGS_CHANGE' is the only value the audit_action enum actually has for this - the
      // three values previously queried here don't exist in the enum, so this always returned
      // empty even though OTPSettingsService.confirmUpdate was logging every change correctly.
      const { data, error } = await db
        .from('audit_logs')
        .select('*')
        .eq('action', 'SETTINGS_CHANGE')
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