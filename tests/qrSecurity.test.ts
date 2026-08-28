import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The QR badge is not a credential.
 *
 * It names a workstation, it is printed on a sticker anyone can photograph, and it never expires.
 * Everything that keeps the check-in flow safe therefore lives elsewhere - the JWT for identity,
 * the reservation for authorisation. What these tests protect is the one property the token
 * itself must have: it cannot be forged, and it cannot be signed with a key that is public
 * knowledge because somebody forgot to configure one.
 *
 * The module reads the secret per call, so each test can set the environment it needs before
 * importing it fresh.
 */

async function loadService() {
  // A cache-busting query keeps each case independent of the module-level state of the others.
  const mod = await import(`@/services/qr/seatQrTokenService?t=${Math.random()}`);
  return mod.SeatQRTokenService as typeof import('@/services/qr/seatQrTokenService').SeatQRTokenService;
}

test('a missing QR secret fails loudly instead of falling back to a known key', async () => {
  const before = { secret: process.env.QR_HMAC_SECRET, demo: process.env.DEMO_MODE };
  delete process.env.QR_HMAC_SECRET;
  delete process.env.DEMO_MODE;

  try {
    const service = await loadService();
    assert.throws(
      () => service.generateSeatToken('ws-1'),
      /QR_HMAC_SECRET manquant/,
      'generation must refuse rather than sign with a hardcoded secret'
    );
    assert.throws(
      () => service.verifySeatToken('anything.atall'),
      /QR_HMAC_SECRET manquant/,
      'verification must surface the configuration fault, not report a bad QR code'
    );
  } finally {
    if (before.secret) process.env.QR_HMAC_SECRET = before.secret;
    if (before.demo) process.env.DEMO_MODE = before.demo;
  }
});

test('a badge signed with the configured secret round-trips, a tampered one does not', async () => {
  const before = process.env.QR_HMAC_SECRET;
  process.env.QR_HMAC_SECRET = 'test-secret-for-this-run';

  try {
    const service = await loadService();
    const token = service.generateSeatToken('ws-42');

    const good = service.verifySeatToken(token);
    assert.equal(good.valid, true);
    assert.equal(good.workstationId, 'ws-42');

    // Editing the payload to name another desk must invalidate the signature - otherwise a
    // scanner could point itself at any workstation in the building.
    const forged = Buffer.from(JSON.stringify({ workstationId: 'ws-99' })).toString('base64url');
    const tampered = `${forged}.${token.split('.')[1]}`;
    assert.equal(service.verifySeatToken(tampered).valid, false);

    // A token signed with a different key must not verify either.
    process.env.QR_HMAC_SECRET = 'a-different-secret';
    const other = await loadService();
    assert.equal(other.verifySeatToken(token).valid, false);
  } finally {
    if (before) process.env.QR_HMAC_SECRET = before;
    else delete process.env.QR_HMAC_SECRET;
  }
});

test('demo mode may run without a configured secret, production may not', async () => {
  const before = { secret: process.env.QR_HMAC_SECRET, demo: process.env.DEMO_MODE };
  delete process.env.QR_HMAC_SECRET;
  process.env.DEMO_MODE = 'true';

  try {
    const service = await loadService();
    const token = service.generateSeatToken('ws-7');
    assert.equal(service.verifySeatToken(token).workstationId, 'ws-7');
  } finally {
    if (before.secret) process.env.QR_HMAC_SECRET = before.secret;
    if (before.demo) process.env.DEMO_MODE = before.demo;
    else delete process.env.DEMO_MODE;
  }
});
