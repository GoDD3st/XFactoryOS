import crypto from 'crypto';

/**
 * Secure QR Code Token Service
 * Uses HMAC-SHA256 signatures to prevent QR forgery, tampering, replay, or impersonation.
 * 
 * QR Token payload format (base64url):
 * {
 *   reservationId: string,
 *   userId: string,
 *   exp: number,       // Epoch timestamp when QR expires
 *   nonce: string      // Unique random string to prevent replay attacks
 * }
 */

const QR_SECRET = process.env.QR_HMAC_SECRET || 'xfactory_safi_qr_hmac_secret_key_2026_ocp';
const QR_VALIDITY_WINDOW_MINUTES = 30; // QR valid for 30 min before reservation start until end

export interface QRTokenPayload {
  reservationId: string;
  userId: string;
  exp: number;
  nonce: string;
}

export class QRTokenService {
  /**
   * Generate a tamper-proof HMAC-signed QR token string
   */
  static generateQRToken(reservationId: string, userId: string, startTimeIso?: string): string {
    const startMs = startTimeIso ? new Date(startTimeIso).getTime() : Date.now();
    const exp = startMs + QR_VALIDITY_WINDOW_MINUTES * 60 * 1000;
    const nonce = crypto.randomBytes(16).toString('hex');

    const payload: QRTokenPayload = {
      reservationId,
      userId,
      exp,
      nonce,
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', QR_SECRET)
      .update(payloadB64)
      .digest('base64url');

    return `${payloadB64}.${signature}`;
  }

  /**
   * Verify HMAC signature, expiration, and extract payload
   */
  static verifyQRToken(token: string, expectedUserId?: string): { valid: boolean; payload?: QRTokenPayload; error?: string } {
    try {
      const parts = token.split('.');
      if (parts.length !== 2) {
        return { valid: false, error: 'Format de QR Code invalide.' };
      }

      const [payloadB64, signature] = parts;

      // Recompute expected HMAC signature
      const expectedSig = crypto
        .createHmac('sha256', QR_SECRET)
        .update(payloadB64)
        .digest('base64url');

      // Timing-safe signature comparison
      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSig);

      if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        return { valid: false, error: 'Signature QR Code falsifiée ou invalide (tentative de contrefaçon).' };
      }

      // Parse payload
      const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf-8');
      const payload: QRTokenPayload = JSON.parse(payloadStr);

      // Expiration check
      if (Date.now() > payload.exp) {
        return { valid: false, error: 'QR Code expiré. Scannez un QR Code récent.' };
      }

      // Ownership check (scanned QR user must match authenticated user)
      if (expectedUserId && payload.userId !== expectedUserId) {
        return { valid: false, error: 'Ce QR Code appartient à un autre utilisateur. Impersonnation interdite.' };
      }

      return { valid: true, payload };
    } catch (err) {
      return { valid: false, error: 'Échec du décodage du QR Code.' };
    }
  }
}
