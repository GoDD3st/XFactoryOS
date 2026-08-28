import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSeatAvailability } from '@/services/workspaces/seatAvailability';
import { findOwnSlotClash } from '@/services/reservations/slotOverlap';
import { checkInWindowVerdict } from '@/services/checkinout/checkInOutService';
import { validateReservationConstraints } from '@/frontend/src/shared/utils/dateValidation';
import { Reservation, SystemSettings } from '@/frontend/src/types';

const DAY = '2026-08-28';

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

/**
 * An early check-out must not show up as availability anywhere.
 *
 * This is the negative half of the rule: services/reservations/earlyExtensionService.ts decides
 * who may take the freed hours, and the seat overlay - which is what the whole floor plan reads -
 * must stay entirely unaware that they were ever special.
 */
test('a desk checked out of early carries no special availability state', () => {
  const left = res({ status: 'terminée', check_out_at: new Date(`${DAY}T10:30:00`).toISOString() });
  const availability = deriveSeatAvailability([left], DAY, '10:30', '12:00', '08:00', '18:00');

  // The completed booking holds nothing, so the desk simply reads as free - exactly as it would
  // if it had never been booked. No extra status, no "released" hours, nothing to advertise.
  assert.equal(availability.status, 'disponible');
  assert.deepEqual(Object.keys(availability).sort(), [
    'checkedIn',
    'gaps',
    'intervals',
    'status',
    'windowFree',
  ]);
});

/**
 * ...and the lead-time rule must stay closed, whatever happened on the desk.
 */
test('the reservation lead time is not bypassable', () => {
  const settings = {
    bookingWindowDays: 2,
    bypassRoles: [],
    closedDates: [],
    holidays: [],
    allowWeekendBooking: true,
    allowHolidayBooking: true,
    workingHoursStart: '08:00',
    workingHoursEnd: '18:00',
    minReservationMinutes: 30,
    maxReservationMinutes: 600,
    maxReservationDaysWithoutApproval: 2,
  } as unknown as SystemSettings;

  const today = new Date();
  const iso = (d: Date) => d.toISOString().split('T')[0];
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const verdict = validateReservationConstraints(
    iso(tomorrow),
    iso(tomorrow),
    '10:30',
    '12:00',
    settings,
    'collaborator'
  );

  // validateReservationConstraints takes no "this desk was released" escape hatch any more, and
  // must never be given one: the extension workflow modifies an existing reservation instead.
  assert.equal(verdict.valid, false);
  assert.match(verdict.errorMessage || '', /au moins 2 jour/);
  assert.equal(validateReservationConstraints.length, 6, 'no extra grant parameter may be added');
});

/**
 * One person, one desk at a time - the constraint added alongside these rules.
 */
test('overlapping reservations for the same person are refused, back-to-back ones are not', () => {
  const held = [res({ start_time: '08:00', end_time: '10:00' })];

  assert.ok(
    findOwnSlotClash(held, { startDate: DAY, startTime: '08:00', endTime: '10:00' }),
    'same hours on another desk must clash'
  );
  assert.ok(
    findOwnSlotClash(held, { startDate: DAY, startTime: '09:00', endTime: '11:00' }),
    'partial overlap must clash'
  );
  assert.equal(
    findOwnSlotClash(held, { startDate: DAY, startTime: '10:00', endTime: '12:00' }),
    null,
    'starting exactly when the other ends is a desk change, not a conflict'
  );
  assert.equal(
    findOwnSlotClash(held, { startDate: DAY, startTime: '08:00', endTime: '10:00' }, { excludeReservationId: 'r' }),
    null,
    'a reservation must not conflict with itself when being modified'
  );
});

/**
 * The check-in window, which the fresh validation on the CHECK IN button applies.
 */
test('check-in opens shortly before the slot and closes with the no-show delay', () => {
  const booking = { reservation_date: DAY, start_time: '09:00' };
  const startMs = new Date(`${DAY}T09:00:00`).getTime();
  const min = 60000;

  assert.equal(checkInWindowVerdict(booking, 30, startMs - 60 * min).ok, false, 'an hour early: refused');
  assert.equal(checkInWindowVerdict(booking, 30, startMs - 10 * min).ok, true, 'ten minutes early: allowed');
  assert.equal(checkInWindowVerdict(booking, 30, startMs).ok, true, 'on time: allowed');
  assert.equal(checkInWindowVerdict(booking, 30, startMs + 29 * min).ok, true, 'inside the delay: allowed');
  assert.equal(
    checkInWindowVerdict(booking, 30, startMs + 31 * min).ok,
    false,
    'past the no-show delay: refused, and routed to the late check-in request'
  );

  // The boundary follows the administrator's setting rather than a constant of its own, so it can
  // never disagree with the sweep that marks no-shows.
  assert.equal(checkInWindowVerdict(booking, 90, startMs + 60 * min).ok, true);
});
