import test from 'node:test';
import assert from 'node:assert/strict';
import { walkInWindowFrom } from '@/services/reservations/walkInService';
import { RESERVATION_TRANSFER_ROLES } from '@/services/reservations/reservationTransferService';
import { Reservation, UserRole } from '@/frontend/src/types';

/**
 * Walk-in: taking a free desk on the spot by scanning its badge.
 *
 * The window is always "from now until the next reservation, or close of business". These tests
 * pin that boundary, and the two refusals that carry business weight: a desk that is occupied
 * right now, and hours that belong to the next holder's extension offer.
 */

const DAY = '2026-08-28';
const CONTEXT = {
  now: { date: DAY, minutes: 10 * 60 }, // 10:00
  businessStart: 8 * 60,
  businessEnd: 18 * 60,
  minMinutes: 30,
  userId: 'walker',
};

function res(over: Partial<Reservation>): Reservation {
  return {
    id: 'r',
    user_id: 'someone',
    workstation_id: 'ws-a',
    workstation_code: 'CL-A-01',
    cluster_id: 'cl-a',
    cluster_name: 'Cluster A',
    reservation_date: DAY,
    start_time: '08:00',
    end_time: '12:00',
    status: 'confirmée',
    ...over,
  } as Reservation;
}

const hhmm = (m?: number) =>
  m === undefined ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

test('an empty desk is free from now until close of business', () => {
  const verdict = walkInWindowFrom([], CONTEXT);
  assert.equal(verdict.available, true);
  assert.equal(hhmm(verdict.start), '10:00');
  assert.equal(hhmm(verdict.end), '18:00');
  assert.equal(verdict.endReason, 'business_close');
});

test('the window ends where the next reservation begins', () => {
  const later = res({ id: 'later', start_time: '14:00', end_time: '16:00' });
  const verdict = walkInWindowFrom([later], CONTEXT);
  assert.equal(verdict.available, true);
  assert.equal(hhmm(verdict.start), '10:00');
  assert.equal(hhmm(verdict.end), '14:00');
  assert.equal(verdict.endReason, 'next_reservation');
});

test('a desk occupied right now cannot be taken, and the refusal names nobody', () => {
  const held = res({ start_time: '09:00', end_time: '12:00', status: 'check-in' });
  const verdict = walkInWindowFrom([held], CONTEXT);
  assert.equal(verdict.available, false);
  assert.match(verdict.message || '', /occupé jusqu'à 12:00/);
  assert.doesNotMatch(verdict.message || '', /someone/, 'the occupant must never be identified');
});

test('a gap shorter than the minimum reservation is not offered', () => {
  const soon = res({ id: 'soon', start_time: '10:20', end_time: '12:00' });
  const verdict = walkInWindowFrom([soon], CONTEXT);
  assert.equal(verdict.available, false);
  assert.match(verdict.message || '', /moins de 30 minutes/);
});

test('cancelled and completed bookings do not block a walk-in', () => {
  const dead = [
    res({ id: 'a', status: 'annulée', start_time: '09:00', end_time: '12:00' }),
    res({ id: 'b', status: 'no-show', start_time: '09:00', end_time: '12:00' }),
  ];
  assert.equal(walkInWindowFrom(dead, CONTEXT).available, true);
});

test('hours reserved for the next holder are not offered to a passer-by', () => {
  // Ahmed held 08:00-12:00 and checked out at 09:30; Sara holds 12:00-16:00. Those 09:30-12:00
  // hours are Sara's to claim as an extension, so a walk-in must not be able to take them.
  const ahmed = res({
    id: 'ahmed',
    user_id: 'ahmed',
    status: 'terminée',
    start_time: '08:00',
    end_time: '12:00',
    check_out_at: new Date(`${DAY}T09:30:00`).toISOString(),
  });
  const sara = res({ id: 'sara', user_id: 'sara', start_time: '12:00', end_time: '16:00' });

  const passerBy = walkInWindowFrom([ahmed, sara], CONTEXT);
  assert.equal(passerBy.available, false);
  assert.match(passerBy.message || '', /priorité au collaborateur/);

  // Sara herself is not blocked by her own offer - she has the extension banner for that, and the
  // one-desk-at-a-time rule stops her holding two slots either way.
  const sarasView = walkInWindowFrom([ahmed, sara], { ...CONTEXT, userId: 'sara' });
  assert.equal(sarasView.available, true);
});

test('nothing is offered once the site has closed', () => {
  const verdict = walkInWindowFrom([], { ...CONTEXT, now: { date: DAY, minutes: 18 * 60 } });
  assert.equal(verdict.available, false);
  assert.match(verdict.message || '', /ferme à 18:00/);
});

/**
 * Moving a reservation between desks is an allocation decision, not a front-desk one.
 */
test('only allocation roles may move a reservation to another desk', () => {
  for (const role of ['building_manager', 'admin', 'super_admin', 'director', 'executive_assistant'] as UserRole[]) {
    assert.ok(RESERVATION_TRANSFER_ROLES.includes(role), `${role} should be allowed`);
  }
  for (const role of ['collaborator', 'receptionist', 'security', 'visitor', 'it_admin'] as UserRole[]) {
    assert.equal(RESERVATION_TRANSFER_ROLES.includes(role), false, `${role} must not be allowed`);
  }
});
