import { SystemSettings } from '@/frontend/src/types';
import { SettingsRepository } from '@/database/repositories/settingsRepository';
import { AuditRepository } from '@/database/repositories/auditRepository';
import { supabase } from '@/database/client';
import { sendNotification } from '../notifications/notificationService';

/**
 * OTP-Verified Settings Update Service
 *
 * Implements the "Dynamic Reservation Constraint Engine & Super Admin OTP Verification"
 * plan (Component 2): a Super Admin submits a settings change, gets a 6-digit OTP,
 * and must confirm it within 10 minutes before the change is persisted.
 *
 * Storage: the pending challenge lives in an in-memory Map (works immediately, no
 * migration required) AND is best-effort mirrored to a `settings_change_requests`
 * Supabase table if it exists (see database/migrations/add_settings_otp_challenges.sql),
 * so the challenge survives a server restart across serverless invocations. If the
 * table isn't present yet, the in-memory copy is authoritative and everything still works.
 */

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes, per plan
const MAX_OTP_ATTEMPTS = 5;

interface PendingSettingsChallenge {
  challengeId: string;
  adminId: string;
  adminName: string;
  currentSettings: SystemSettings;
  newSettings: Partial<SystemSettings>;
  otpCode: string;
  expiresAt: number; // epoch ms
  attempts: number;
}

const pendingChallenges = new Map<string, PendingSettingsChallenge>();

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateChallengeId(): string {
  return `otp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function diffSettings(before: SystemSettings, after: Partial<SystemSettings>): string {
  const changedKeys = Object.keys(after).filter(
    (key) => JSON.stringify((before as any)[key]) !== JSON.stringify((after as any)[key])
  );
  if (changedKeys.length === 0) return 'Aucun changement de valeur détecté';
  return changedKeys
    .map((key) => `${key}: ${JSON.stringify((before as any)[key])} → ${JSON.stringify((after as any)[key])}`)
    .join(', ');
}

export class OtpSettingsService {
  /**
   * DEMO_MODE_OTP_DISCLOSURE: while there is no email/SMS provider wired up, the OTP is
   * returned directly in the response and shown in the confirmation modal, per the plan's
   * explicit "User Review Required" note. Flip to false once real delivery exists.
   */
  static readonly DEMO_MODE_OTP_DISCLOSURE = true;

  /**
   * Step 1: Super Admin submits a settings change → generate OTP, stash the pending diff.
   */
  static async requestSettingsUpdate(
    adminId: string,
    adminName: string,
    newSettings: Partial<SystemSettings>
  ): Promise<{ challengeId: string; expiresAt: string; otpCode?: string }> {
    const currentSettings = await SettingsRepository.getSettings();
    const otpCode = generateOtp();
    const challengeId = generateChallengeId();
    const expiresAt = Date.now() + OTP_TTL_MS;

    pendingChallenges.set(challengeId, {
      challengeId,
      adminId,
      adminName,
      currentSettings,
      newSettings,
      otpCode,
      expiresAt,
      attempts: 0,
    });

    // Best-effort mirror to Supabase so the challenge is recoverable across instances/restarts.
    try {
      await supabase.from('settings_change_requests').insert({
        challenge_id: challengeId,
        admin_id: adminId,
        admin_name: adminName,
        new_settings: newSettings,
        otp_code: otpCode,
        status: 'PENDING',
        expires_at: new Date(expiresAt).toISOString(),
      });
    } catch (err) {
      console.warn('[OTP] settings_change_requests table unavailable, using in-memory challenge only:', err);
    }

    sendNotification(
      adminId,
      'Code de vérification — Modification des paramètres',
      `Votre code de vérification à 6 chiffres est ${otpCode}. Il expire dans 10 minutes.`,
      'info'
    );

    await AuditRepository.logEvent(
      'SETTINGS_UPDATE_REQUESTED',
      adminId,
      adminName,
      'super_admin',
      'settings',
      `Demande de modification des paramètres système (challenge ${challengeId}) — ${diffSettings(currentSettings, newSettings)}`
    );

    return {
      challengeId,
      expiresAt: new Date(expiresAt).toISOString(),
      ...(this.DEMO_MODE_OTP_DISCLOSURE ? { otpCode } : {}),
    };
  }

  /**
   * Step 2: Super Admin submits the OTP code → validate, persist, audit with a diff.
   */
  static async confirmSettingsUpdate(
    challengeId: string,
    otpCode: string,
    adminId: string
  ): Promise<SystemSettings> {
    let challenge = pendingChallenges.get(challengeId);

    // If this server instance didn't originate the request (e.g. serverless cold start
    // routed the confirm call elsewhere), fall back to the Supabase mirror.
    if (!challenge) {
      try {
        const { data } = await supabase
          .from('settings_change_requests')
          .select('*')
          .eq('challenge_id', challengeId)
          .eq('status', 'PENDING')
          .single();

        if (data) {
          challenge = {
            challengeId: data.challenge_id,
            adminId: data.admin_id,
            adminName: data.admin_name,
            currentSettings: await SettingsRepository.getSettings(),
            newSettings: data.new_settings,
            otpCode: data.otp_code,
            expiresAt: new Date(data.expires_at).getTime(),
            attempts: 0,
          };
        }
      } catch {
        // handled by the null-check below
      }
    }

    if (!challenge) {
      throw new Error('Aucune demande de modification en attente pour ce code. Veuillez recommencer.');
    }

    if (Date.now() > challenge.expiresAt) {
      pendingChallenges.delete(challengeId);
      throw new Error('Le code de vérification a expiré (10 minutes). Veuillez recommencer la demande.');
    }

    if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
      pendingChallenges.delete(challengeId);
      throw new Error('Trop de tentatives incorrectes. Veuillez recommencer la demande.');
    }

    if (challenge.otpCode !== otpCode.trim()) {
      challenge.attempts += 1;
      pendingChallenges.set(challengeId, challenge);
      throw new Error(`Code de vérification incorrect. Tentative ${challenge.attempts}/${MAX_OTP_ATTEMPTS}.`);
    }

    // OTP valid — persist the change.
    const updated = await SettingsRepository.updateSettings(challenge.newSettings, adminId);

    pendingChallenges.delete(challengeId);
    try {
      await supabase.from('settings_change_requests').update({ status: 'CONFIRMED' }).eq('challenge_id', challengeId);
    } catch {
      // non-blocking
    }

    await AuditRepository.logEvent(
      'SETTINGS_UPDATED',
      adminId,
      challenge.adminName,
      'super_admin',
      'settings',
      `Paramètres système modifiés (v${updated.configVersion ?? '?'}) — ${diffSettings(challenge.currentSettings, challenge.newSettings)}`
    );

    return updated;
  }
}

export const requestSettingsUpdate = OtpSettingsService.requestSettingsUpdate.bind(OtpSettingsService);
export const confirmSettingsUpdate = OtpSettingsService.confirmSettingsUpdate.bind(OtpSettingsService);