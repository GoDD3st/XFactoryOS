import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOffer } from '@/services/reservations/earlyExtensionService';
import { Reservation } from '@/frontend/src/types';

/**
 * The early check-out rule.
 *
 * Two things are being protected here, and they pull in opposite directions:
 *   - the hours a departing occupant gives back must NOT become a public opening (that would let
 *     anyone book inside the reservation lead time simply because someone left early);
 *   - the one person who already holds the next slot on that same desk may start earlier.
 *
 * Every test below pins one of the boundaries between those two, so a future change that widens
 * the offer to a second user, to another desk, or to hours nobody released, fails here.
 */

const DAY = '2026-08-28';

/** A reservation on WS-A for DAY, with the fields the timeline logic reads. */
function res(over: Partial<Reservation>): Reservation {
  return {
    id: 'r',
    user_id: 'u',
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

/** An instant on DAY, expressed in the process timezone the services run in. */
function at(hhmm: string): string {
  return new Date(`${DAY}T${hhmm}:00`).toISOString();
}

const NOW_0900 = { date: DAY, minutes: 9 * 60 };

/** Ahmed 08:00-12:00, left at 10:30. Sara holds 12:00-16:00 on the same desk. */
const ahmedLeftEarly = res({
  id: 'ahmed',
  user_id: 'ahmed',
  status: 'terminée',
  start_time: '08:00',
  end_time: '12:00',
  check_out_at: at('10:30'),
});

const sara = res({ id: 'sara', user_id: 'sara', start_time: '12:00', end_time: '16:00' });

test('the next holder is offered the released hours', () => {
  const offer = buildOffer(sara, [ahmedLeftEarly, sara], NOW_0900);
  assert.ok(offer, 'Sara should be offered an earlier start');
  assert.equal(offer.proposedStart, '10:30');
  assert.equal(offer.currentStart, '12:00');
  assert.equal(offer.currentEnd, '16:00');
  assert.equal(offer.gainedMinutes, 90);
});

test('a holder who is NOT next cannot claim the released hours', () => {
  // Karim holds 16:00-18:00. Sara's booking sits between him and the freed period, so the hours
  // are not his to take even though his reservation is on the same desk and the same day.
  const karim = res({ id: 'karim', user_id: 'karim', start_time: '16:00', end_time: '18:00' });
  const offer = buildOffer(karim, [ahmedLeftEarly, sara, karim], NOW_0900);
  assert.equal(offer, null);
});

test('a holder on a different desk is never offered anything', () => {
  const otherDesk = res({
    id: 'other',
    user_id: 'sara',
    workstation_id: 'ws-b',
    workstation_code: 'CL-A-02',
    start_time: '12:00',
    end_time: '16:00',
  });
  // The desk's own timeline is what is passed in; WS-B's day contains no early departure.
  assert.equal(buildOffer(otherDesk, [otherDesk], NOW_0900), null);
});

test('a reservation that ran its full course releases nothing', () => {
  const ahmedFullTerm = { ...ahmedLeftEarly, check_out_at: at('12:00') } as Reservation;
  assert.equal(buildOffer(sara, [ahmedFullTerm, sara], NOW_0900), null);
});

test('the automatic end-of-slot completion releases nothing either', () => {
  // The sweep writes 'terminée' with a timestamp AFTER the end time. Those hours were used.
  const sweptClosed = { ...ahmedLeftEarly, check_out_at: at('12:05') } as Reservation;
  assert.equal(buildOffer(sara, [sweptClosed, sara], NOW_0900), null);
});

test('a cancelled previous booking is not an early check-out', () => {
  // Nobody occupied and left: this is ordinary unbooked time, governed by the normal rules.
  const cancelled = res({ id: 'x', user_id: 'ahmed', status: 'annulée', start_time: '08:00', end_time: '12:00' });
  assert.equal(buildOffer(sara, [cancelled, sara], NOW_0900), null);
});

test('the offer never reaches over a live booking sitting in the gap', () => {
  // Someone else holds 11:00-12:00 on the desk, so the released period is not free to give.
  const inBetween = res({ id: 'mid', user_id: 'other', start_time: '11:00', end_time: '12:00' });
  assert.equal(buildOffer(sara, [ahmedLeftEarly, inBetween, sara], NOW_0900), null);
});

test('the offer is not contiguous with the reservation, so nothing is offered', () => {
  // Ahmed's slot ended at 11:00 and Sara's starts at 12:00: the 11:00-12:00 stretch was never
  // anyone's, and joining it onto Sara's booking would hand her ordinary free time without the
  // lead time that governs it.
  const endedEarlier = { ...ahmedLeftEarly, end_time: '11:00', check_out_at: at('10:30') } as Reservation;
  assert.equal(buildOffer(sara, [endedEarlier, sara], NOW_0900), null);
});

test('hours already elapsed are not offered', () => {
  // It is 11:30. The 10:30-11:30 stretch is gone; only what remains before Sara's start is real.
  const offer = buildOffer(sara, [ahmedLeftEarly, sara], { date: DAY, minutes: 11 * 60 + 30 });
  assert.ok(offer);
  assert.equal(offer.proposedStart, '11:30');
});

test('no offer once the clock has passed the reservation start', () => {
  assert.equal(buildOffer(sara, [ahmedLeftEarly, sara], { date: DAY, minutes: 12 * 60 }), null);
});

test('a cancelled or completed next reservation is not extended', () => {
  for (const status of ['annulée', 'terminée', 'no-show', 'rejetée'] as const) {
    const dead = { ...sara, status } as Reservation;
    assert.equal(buildOffer(dead, [ahmedLeftEarly, dead], NOW_0900), null, status);
  }
});

test('a reservation already checked in can still be moved earlier', () => {
  // Sara arrived at her desk before her slot began via a late/assisted flow; the hours in front
  // of her are still hers to claim, and refusing here would strand them.
  const occupied = { ...sara, status: 'check-in' } as Reservation;
  const offer = buildOffer(occupied, [ahmedLeftEarly, occupied], NOW_0900);
  assert.ok(offer);
  assert.equal(offer.proposedStart, '10:30');
});

test('multi-day reservations are out of scope', () => {
  const multi = { ...sara, end_date: '2026-08-29' } as Reservation;
  assert.equal(buildOffer(multi, [ahmedLeftEarly, multi], NOW_0900), null);
});
