import crypto from 'crypto';

/**
 * Seat Badge QR Token Service
 * Deterministic HMAC-SHA256 signature over a workstation id - no expiry, no nonce,
 * because this token is meant to be printed and taped to a desk for months at a time,
 * unlike the single-reservation, time-boxed tokens in qrTokenService.ts. Re-generating
 * the QR image for the same seat always reproduces the same token, so nothing needs to
 * be persisted to invalidate/reprint it.
 */

const QR_SECRET = process.env.QR_HMAC_SECRET || 'xfactory_safi_qr_hmac_secret_key_2026_ocp';

export interface SeatQRTokenPayload {
  workstationId: string;
}

export class SeatQRTokenService {
  static generateSeatToken(workstationId: string): string {
    const payload: SeatQRTokenPayload = { workstationId };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', QR_SECRET).update(payloadB64).digest('base64url');
    return `${payloadB64}.${signature}`;
  }

  /**
   * Verifies a scanned desk badge and returns which desk it names.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * SECURITY MODEL - read this before treating the result as an authorisation.
   *
   * A valid token proves ONE thing: this string was signed by us and names workstation X. It
   * proves nothing whatsoever about WHO scanned it.
   *
   * The token is deliberately not a secret. It is printed on a sticker on a desk in a shared
   * office; anyone who walks past can photograph it, and it never expires. Treating it as
   * evidence of identity would mean anyone who has seen a desk could check in as its owner.
   *
   * What makes the flow safe is what the CALLER does with this result: /api/checkinout/scan-seat
   * takes the user from the JWT - never from the request body - and then requires a reservation
   * matching that user AND this workstation, right now. Scanning a stranger's desk finds no
   * matching reservation and does nothing.
   *
   * IF YOU REUSE THIS FUNCTION SOMEWHERE NEW, carry that rule with it. A caller that acts on the
   * workstation id alone has built an unauthenticated endpoint.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   *
   * Rejects on a malformed shape and on a signature mismatch. The comparison is over the payload
   * exactly as received, so altering the workstation id inside the token invalidates it - which
   * is the point: without the signature, a scanner could simply edit the id and check into any
   * desk in the building.
   *
   * Depends on QR_HMAC_SECRET. Rotating it invalidates every badge already printed and taped to a
   * desk - they all have to be reprinted. See README §18.
   */
  static verifySeatToken(token: string): { valid: boolean; workstationId?: string; error?: string } {
    try {
      const parts = token.split('.');
      if (parts.length !== 2) {
        return { valid: false, error: 'Format de QR Code invalide.' };
      }

      const [payloadB64, signature] = parts;
      const expectedSig = crypto.createHmac('sha256', QR_SECRET).update(payloadB64).digest('base64url');

      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSig);
      if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        return { valid: false, error: 'Signature QR Code falsifiée ou invalide (tentative de contrefaçon).' };
      }

      const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf-8');
      const payload: SeatQRTokenPayload = JSON.parse(payloadStr);
      if (!payload.workstationId) {
        return { valid: false, error: 'QR Code de poste invalide.' };
      }

      return { valid: true, workstationId: payload.workstationId };
    } catch (err) {
      return { valid: false, error: 'Échec du décodage du QR Code.' };
    }
  }
}
