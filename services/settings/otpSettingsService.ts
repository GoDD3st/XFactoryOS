import crypto from 'crypto';
import { SystemSettings } from '@/frontend/src/types';
import { SettingsRepository } from '@/database/repositories/settingsRepository';
import { AuditRepository } from '@/database/repositories/auditRepository';
import { NotificationService } from '../notifications/notificationService';

interface PendingConfigChallenge {
  challengeId: string;
  adminId: string;
  pendingSettings: Partial<SystemSettings>;
  otpCode: string;
  expiresAt: number;
}

// Store pending OTP challenges in memory
const pendingChallenges = new Map<string, PendingConfigChallenge>();

// Clean up expired OTPs periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, challenge] of pendingChallenges.entries()) {
    if (now > challenge.expiresAt) {
      pendingChallenges.delete(id);
    }
  }
}, 30 * 1000);

export class OTPSettingsService {
  /**
   * Request a configuration update. Generates a 6-digit OTP code valid for 1 MINUTE.
   */
  static async requestUpdate(
    adminId: string,
    newSettings: Partial<SystemSettings>
  ): Promise<{ challengeId: string; expiresAt: number; otpCodeDemo?: string }> {
    const challengeId = `cfg_chg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    // Generate secure 6-digit OTP code (e.g. 849201)
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // ⏱️ Expiration set strictly to 1 MINUTE for maximum security per user requirement
    const expiresAt = Date.now() + 1 * 60 * 1000; 

    pendingChallenges.set(challengeId, {
      challengeId,
      adminId,
      pendingSettings: newSettings,
      otpCode,
      expiresAt,
    });

    // Notify admin with OTP (via NotificationService)
    NotificationService.sendNotification(
      adminId,
      '🔐 Code de vérification OTP - Modification Système',
      `Votre code de confirmation pour modifier les paramètres système est : ${otpCode} (Valable 1 minute).`,
      'alert'
    );

    console.log(`[OTP Settings Service] Challenge generated for Admin ${adminId}. OTP Code: ${otpCode}`);

    return {
      challengeId,
      expiresAt,
      otpCodeDemo: process.env.DEMO_MODE === 'true' ? otpCode : undefined,
    };
  }

  /**
   * Confirm and apply configuration update using OTP code.
   */
  static async confirmUpdate(
    challengeId: string,
    otpCode: string,
    adminId: string,
    adminName?: string,
    adminRole?: string
  ): Promise<{ success: boolean; updatedSettings?: SystemSettings; error?: string }> {
    const challenge = pendingChallenges.get(challengeId);

    if (!challenge) {
      return {
        success: false,
        error: 'Session de vérification invalide ou expirée. Veuillez réitérer votre demande.',
      };
    }

    if (Date.now() > challenge.expiresAt) {
      pendingChallenges.delete(challengeId);
      return {
        success: false,
        error: 'Code OTP expiré (délai de 1 minute dépassé). Modification annulée.',
      };
    }

    if (challenge.otpCode !== otpCode.trim()) {
      return {
        success: false,
        error: 'Code OTP incorrect. Veuillez vérifier le code reçu.',
      };
    }

    // OTP is valid — consume challenge immediately (single-use)
    pendingChallenges.delete(challengeId);

    // Get old settings for audit diff
    const oldSettings = await SettingsRepository.getSettings();

    // Save new settings permanently to Supabase DB
    const updatedSettings = await SettingsRepository.updateSettings(challenge.pendingSettings, adminId);

    // Log audit event for traceability & versioning
    await AuditRepository.logEvent(
      'SETTINGS_CHANGE',
      adminId,
      adminName || 'Administrateur',
      adminRole || 'admin',
      'public.settings',
      `Mise à jour des paramètres système (v${updatedSettings.configVersion}). Modifications: ${JSON.stringify(challenge.pendingSettings)}`
    );

    return {
      success: true,
      updatedSettings,
    };
  }
}