import crypto from 'crypto';

/**
 * Secure One-Time Reservation Confirmation Token Service
 * Generates cryptographic one-time tokens, stores their SHA-256 hashes,
 * and validates/invalidates them on use to prevent replay attacks.
 */

interface StoredConfirmationToken {
  hash: string;
  reservationId: string;
  expiresAt: number;
  used: boolean;
}

// In-memory store for confirmation tokens (syncs to audit log)
const tokenStore = new Map<string, StoredConfirmationToken>();

export class ConfirmationService {
  /**
   * Generate a one-time confirmation token for a reservation
   */
  static generateConfirmationToken(reservationId: string): string {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24h validity

    tokenStore.set(hash, {
      hash,
      reservationId,
      expiresAt,
      used: false,
    });

    return rawToken;
  }

  /**
   * Validate and consume a one-time confirmation token (single-use)
   */
  static confirmReservationWithToken(rawToken: string): { success: boolean; reservationId?: string; error?: string } {
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const stored = tokenStore.get(hash);

    if (!stored) {
      return { success: false, error: 'Jeton de confirmation invalide ou inconnu.' };
    }

    if (stored.used) {
      return { success: false, error: 'Ce jeton de confirmation a déjà été utilisé (tentative de rejeu).' };
    }

    if (Date.now() > stored.expiresAt) {
      return { success: false, error: 'Jeton de confirmation expiré (valable 24h).' };
    }

    // Mark token as used immediately (single-use)
    stored.used = true;
    tokenStore.set(hash, stored);

    return { success: true, reservationId: stored.reservationId };
  }
}
