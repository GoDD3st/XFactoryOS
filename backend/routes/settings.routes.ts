import { Router } from 'express';
import { SettingsService } from '../../services/settings/settingsService';
import { SettingsRepository } from '../../database/repositories/settingsRepository';
import { AuditRepository } from '../../database/repositories/auditRepository';
import { createVerificationClient } from '../../database/serverClient';
import { requirePermission } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import { SystemSettingsUpdateSchema, ConfirmSettingsWithPasswordSchema, SiteLogoSchema } from '../validators';
import { validateLogoDataUrl } from '@/services/settings/logoValidation';
import { SystemSettings } from '@/frontend/src/types';

export const settingsRouter = Router();

const SETTINGS_LABELS: Partial<Record<keyof SystemSettings, string>> = {
  bookingWindowDays: 'Délai minimum de réservation',
  minReservationMinutes: 'Durée minimum',
  maxReservationMinutes: 'Durée maximum',
  maxReservationDaysWithoutApproval: 'Durée max sans approbation',
  maxReservationsPerUserPerDay: 'Quota par jour',
  maxReservationsPerUserPerWeek: 'Quota par semaine',
  workingHoursStart: "Heure d'ouverture",
  workingHoursEnd: 'Heure de fermeture',
  workingDays: 'Jours ouvrés',
  bypassRoles: 'Rôles exemptés',
  allowWeekendBooking: 'Réservation week-end',
  allowHolidayBooking: 'Réservation jours fériés',
  holidays: 'Jours fériés',
  closedDates: 'Dates de fermeture',
  noShowDelayMinutes: 'Délai no-show',
  extensionSeatsVisibleByDefault: 'Postes extension visibles par défaut',
  managementClustersEnabled: 'Clusters management activés',
  theme: 'Thème',
  siteName: 'Nom du site',
};

function formatSettingValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'aucun';
    if (typeof value[0] === 'object') return `${value.length} élément(s)`;
    return value.join(', ');
  }
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  return String(value);
}

/**
 * Builds a readable "field: old → new" line per changed field, instead of dumping the entire
 * settings payload as JSON (which is what the audit history table was rendering verbatim as one
 * giant unreadable line, whether or not most of those fields had actually changed).
 */
function formatSettingsDiff(oldSettings: SystemSettings, newSettings: Partial<SystemSettings>): string {
  const changes = (Object.keys(newSettings) as (keyof SystemSettings)[])
    .filter((key) => JSON.stringify(oldSettings[key]) !== JSON.stringify(newSettings[key]))
    .map((key) => {
      const label = SETTINGS_LABELS[key] || key;
      return `${label} : ${formatSettingValue(oldSettings[key])} → ${formatSettingValue(newSettings[key])}`;
    });

  return changes.length > 0 ? changes.join(' · ') : 'Aucune valeur modifiée.';
}

// GET /api/settings - Authenticated users
settingsRouter.get('/', async (req, res) => {
  try {
    const settings = await SettingsService.getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Échec de la récupération des paramètres' });
  }
});

// PUT /api/settings/logo - site mark upload, Admin & Super Admin only.
//
// Separate from the main settings PUT: it carries a large base64 payload with its own validation
// pipeline, and it deliberately skips the password-confirmation flow that guards the booking
// rules - replacing a logo is cosmetic, not a change to how reservations behave.
//
// The uploaded bytes are validated before they touch the database (magic bytes, declared-vs-real
// type, size, dimensions, embedded-script detection, SVG refused). See
// services/settings/logoValidation.ts for what that does and does NOT cover.
settingsRouter.put(
  '/logo',
  requirePermission('reservation_settings', 'update', ['admin', 'super_admin']),
  validateBody(SiteLogoSchema),
  async (req, res) => {
    try {
      // null clears the logo and restores the text mark.
      if (req.body.logo === null) {
        await SettingsService.updateSiteLogo(null, req.user!.id);
        return res.json({ status: 'success', data: { logo: null } });
      }

      const verdict = validateLogoDataUrl(req.body.logo);
      if (!verdict.ok) {
        return res.status(400).json({ status: 'error', message: verdict.error });
      }

      // Persist the NORMALISED data URI rebuilt from the sniffed type, not the submitted string.
      await SettingsService.updateSiteLogo(verdict.dataUrl!, req.user!.id);

      const { AuditRepository } = await import('@/database/repositories/auditRepository');
      AuditRepository.logEvent(
        'SETTINGS_CHANGE',
        req.user!.id,
        req.user!.full_name,
        req.user!.role,
        'site-logo',
        `Logo du site mis à jour (${verdict.meta!.format}, ${verdict.meta!.width}×${verdict.meta!.height}, ${Math.round(
          verdict.meta!.bytes / 1024
        )} Ko).`
      ).catch(() => {});

      res.json({ status: 'success', data: { logo: verdict.dataUrl, meta: verdict.meta } });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message || 'Échec de la mise à jour du logo' });
    }
  }
);

// PUT /api/settings - Admin & Super Admin only (Zod validated)
settingsRouter.put('/', requirePermission('reservation_settings', 'update', ['admin', 'super_admin']), validateBody(SystemSettingsUpdateSchema), async (req, res) => {
  try {
    const settings = await SettingsService.updateSettings(req.body);
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Échec de la mise à jour des paramètres' });
  }
});

// POST /api/settings/reset - Super Admin only
settingsRouter.post('/reset', requirePermission('reservation_settings', 'delete', ['super_admin']), async (req, res) => {
  try {
    const settings = await SettingsService.resetSettings();
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Échec de la réinitialisation des paramètres' });
  }
});

// GET /api/settings/history - Super Admin only. Version history of past config changes.
settingsRouter.get('/history', requirePermission('reservation_settings', 'read', ['super_admin']), async (req, res) => {
  try {
    const history = await SettingsRepository.getSettingsHistory();
    res.json({ status: 'success', data: history });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/settings/confirm-with-password - SRS §13 row "Paramètres réservation": CRUD for both
// Super Admin and Admin. Step-up re-authentication replacing the old same-session OTP (which was
// delivered as an in-app notification to the very session requesting the change - no real second
// factor). The admin re-enters their password; it's verified with a fresh, throwaway
// signInWithPassword call (never touches or replaces the caller's actual session/token), proving
// they still hold the credential right now before a sensitive config change is applied.
settingsRouter.post(
  '/confirm-with-password',
  requirePermission('reservation_settings', 'update', ['admin', 'super_admin']),
  validateBody(ConfirmSettingsWithPasswordSchema),
  async (req, res) => {
    try {
      const { password, settings: newSettings } = req.body;

      const verifyClient = createVerificationClient();
      const { error: authError } = await verifyClient.auth.signInWithPassword({
        email: req.user!.email,
        password,
      });

      if (authError) {
        res.status(401).json({ status: 'error', message: 'Mot de passe incorrect.' });
        return;
      }

      const oldSettings = await SettingsService.getSettings();
      const updated = await SettingsService.updateSettings(newSettings);

      await AuditRepository.logEvent(
        'SETTINGS_CHANGE',
        req.user!.id,
        req.user!.full_name,
        req.user!.role,
        'public.settings',
        `Paramètres mis à jour (v${updated.configVersion}) - ${formatSettingsDiff(oldSettings as SystemSettings, newSettings)}`
      );

      res.json({ status: 'success', data: updated });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);