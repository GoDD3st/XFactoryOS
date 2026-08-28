import crypto from 'crypto';

/**
 * Seat Badge QR Token Service - the project's ONLY QR system.
 *
 * Deterministic HMAC-SHA256 signature over a workstation id: no expiry, no nonce, no user, no
 * reservation. The token is printed and taped to a desk for months at a time, and re-generating
 * the image for the same desk always reproduces the same token, so nothing has to be persisted to
 * reprint one.
 *
 * A second, reservation-scoped token family (reservationId/userId/exp/nonce) once lived alongside
 * this one in qrTokenService.ts. Nothing generated or consumed it - no screen produced such a QR
 * and no caller ever passed one - so it was deleted rather than left as a plausible-looking
 * alternative for someone to wire up later. Identity belongs to the JWT, not to a QR code.
 */

/**
 * The signing key for every desk badge, resolved per call.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THERE IS NO HARDCODED FALLBACK ANY MORE
 *
 * This module used to read `process.env.QR_HMAC_SECRET || '<a literal secret>'`. A deployment
 * that simply forgot the variable therefore signed and accepted badges with a key checked into
 * the repository - which is to say, with a key anyone who can read the source can compute. They
 * could mint a badge for any desk in the building, and the signature would verify.
 *
 * A missing secret is now a configuration error, refused loudly, in line with how CRON_SECRET is
 * handled in backend/routes/cron.routes.ts. It is thrown at call time rather than at import time
 * so that a site with no QR usage still boots and every other feature keeps working.
 *
 * DEMO_MODE is the single exception, and it cannot reach production: backend/middleware/
 * authMiddleware.ts refuses to start a production deployment with DEMO_MODE=true. Even there the
 * key is random per process, so nothing signed by a demo instance is valid anywhere else.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
const DEMO_EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function qrSecret(): string {
  const configured = process.env.QR_HMAC_SECRET;
  if (configured) return configured;

  if (process.env.DEMO_MODE === 'true') {
    console.warn(
      '[QR] QR_HMAC_SECRET absent - clé éphémère de démonstration utilisée. Les badges imprimés ' +
        "cessent d'être valides à chaque redémarrage. Ne jamais utiliser en production."
    );
    return DEMO_EPHEMERAL_SECRET;
  }

  throw new Error(
    'QR_HMAC_SECRET manquant. Les badges QR des postes ne peuvent être ni générés ni vérifiés ' +
      "sans clé de signature. Définissez QR_HMAC_SECRET dans l'environnement du serveur."
  );
}

export interface SeatQRTokenPayload {
  workstationId: string;
}

export class SeatQRTokenService {
  static generateSeatToken(workstationId: string): string {
    const payload: SeatQRTokenPayload = { workstationId };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', qrSecret()).update(payloadB64).digest('base64url');
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
    // Resolved OUTSIDE the try on purpose. A missing QR_HMAC_SECRET is a deployment fault, not a
    // bad scan, and the catch below would otherwise bury it as "unreadable QR code" - sending
    // whoever has to fix it looking at the sticker instead of at the environment.
    const secret = qrSecret();

    try {
      const parts = token.split('.');
      if (parts.length !== 2) {
        return { valid: false, error: 'Format de QR Code invalide.' };
      }

      const [payloadB64, signature] = parts;
      const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

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
