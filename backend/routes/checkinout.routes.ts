import { Router } from 'express';
import { CheckInOutService } from '../../services';
import { SeatQRTokenService } from '@/services/qr/seatQrTokenService';
import { ReservationRepository } from '@/database/repositories/reservationRepository';
import { WorkstationRepository } from '@/database/repositories/workstationRepository';
import { validateBody } from '../middleware/validateBody';
import { requireRole } from '../middleware/rbacMiddleware';
import {
  CheckInOutSchema,
  ScanSeatSchema,
  DecodeSeatSchema,
  CheckInOnBehalfSchema,
  LateCheckInRequestSchema,
  LateCheckInDecisionSchema,
} from '../validators';
import { LateCheckInService, LATE_CHECKIN_REVIEWER_ROLES } from '@/services/checkinout/lateCheckInService';
import { UserRole } from '@/frontend/src/types';

export const checkInOutRouter = Router();

const SEAT_QR_MANAGER_ROLES: UserRole[] = ['admin', 'super_admin', 'building_manager', 'gci_manager'];
const SEAT_SCAN_OVERRIDE_ROLES: UserRole[] = ['receptionist', 'admin', 'super_admin', 'building_manager', 'gci_manager'];
/** Roles allowed to run a site-wide sweep by hand. Operational staff, not every session holder. */
const MAINTENANCE_ROLES: UserRole[] = ['admin', 'super_admin', 'building_manager', 'gci_manager'];

// POST /api/checkinout/check-in - the collaborator's own check-in, CONFIRMED -> OCCUPIED.
//
// This is the ONLY place a self check-in is committed, and it is where the fresh validation
// happens: the user id comes from the JWT, never the body, and CheckInOutService.checkIn re-reads
// the reservation and re-checks ownership, status and the time window at this instant. Nothing
// established earlier in the flow - a QR scan, a screen the user has been looking at for ten
// minutes - is carried forward as proof.
//
// It takes no QR token. The desk badge identifies a WORKSTATION and is not a credential (see
// services/qr/seatQrTokenService.ts); authorisation comes from the JWT plus the reservation.
checkInOutRouter.post('/check-in', validateBody(CheckInOutSchema), async (req, res) => {
  const { reservationId } = req.body;
  const userId = req.user!.id;

  const result = await CheckInOutService.checkIn(reservationId, userId);
  if (!result.ok) {
    res.status(400).json({ status: 'error', message: result.message || 'Échec du check-in.' });
    return;
  }

  // checkInAt is the timestamp that was actually written to the database. The interface displays
  // this value rather than reading the browser clock, which can be wrong or deliberately altered.
  res.json({ success: true, message: 'Check-in effectué avec succès', data: { checkInAt: result.checkInAt } });
});

// POST /api/checkinout/check-in-for - reception-desk check-in on a collaborator's behalf.
// Distinct from /check-in, which forces the caller's own id and so can only ever check the
// caller in. The reservation holder is resolved server-side from the reservation itself, so the
// caller cannot check in an arbitrary user - only whoever actually holds that booking.
checkInOutRouter.post(
  '/check-in-for',
  requireRole(...SEAT_SCAN_OVERRIDE_ROLES),
  validateBody(CheckInOnBehalfSchema),
  async (req, res) => {
    try {
      const result = await CheckInOutService.performCheckInOnBehalf(req.body.reservationId, {
        id: req.user!.id,
        name: req.user!.full_name,
        role: req.user!.role,
      });

      if (!result.ok) {
        res.status(400).json({ status: 'error', message: result.message || 'Échec du check-in.' });
        return;
      }

      res.json({ status: 'success', data: result });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);

// ── Late check-in request workflow ───────────────────────────────────────────────────────────
// Authorization is enforced here AND by RLS on late_check_in_requests. The UI hiding a button is
// not authorization; both layers restrict deciding to Building Manager / Admin / Super Admin.

// POST /api/checkinout/late-check-in - a reservation holder asks for a late check-in.
// The requester is taken from the session, never from the body, so one user cannot open a
// request in another's name.
checkInOutRouter.post('/late-check-in', validateBody(LateCheckInRequestSchema), async (req, res) => {
  try {
    const created = await LateCheckInService.request(
      req.body.reservationId,
      req.user!.id,
      req.body.justification
    );
    res.status(201).json({ status: 'success', data: created });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

// GET /api/checkinout/late-check-in/mine - the caller's own requests and their status.
checkInOutRouter.get('/late-check-in/mine', async (req, res) => {
  try {
    res.json({ status: 'success', data: await LateCheckInService.listForUser(req.user!.id) });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET /api/checkinout/late-check-in - full queue + history, reviewers only.
checkInOutRouter.get(
  '/late-check-in',
  requireRole(...LATE_CHECKIN_REVIEWER_ROLES),
  async (req, res) => {
    try {
      res.json({ status: 'success', data: await LateCheckInService.list() });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// PATCH /api/checkinout/late-check-in/:id/decision - approve or reject.
// Approval routes through the existing check-in path and is recorded with origin=LATE_CHECK_IN.
checkInOutRouter.patch(
  '/late-check-in/:id/decision',
  requireRole(...LATE_CHECKIN_REVIEWER_ROLES),
  validateBody(LateCheckInDecisionSchema),
  async (req, res) => {
    try {
      const decided = await LateCheckInService.decide(
        req.params.id,
        req.body.decision,
        { id: req.user!.id, name: req.user!.full_name, role: req.user!.role },
        req.body.reviewerComment
      );
      res.json({ status: 'success', data: decided });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);

// POST /api/checkinout/check-out - Check out (userId forced from req.user)
checkInOutRouter.post('/check-out', validateBody(CheckInOutSchema), async (req, res) => {
  const { reservationId } = req.body;
  const userId = req.user!.id;
  const success = await CheckInOutService.performCheckOut(reservationId, userId);
  if (!success) {
    res.status(400).json({ status: 'error', message: 'Échec du check-out.' });
    return;
  }
  res.json({ success: true, message: 'Check-out effectué avec succès' });
});

// GET /api/checkinout/seat-qr/:workstationId - Issue the static, printable badge token for a seat
checkInOutRouter.get('/seat-qr/:workstationId', requireRole(...SEAT_QR_MANAGER_ROLES), (req, res) => {
  const { workstationId } = req.params;
  const token = SeatQRTokenService.generateSeatToken(workstationId);
  res.json({ status: 'success', token });
});

// POST /api/checkinout/scan-seat/decode - Read-only: resolve which seat a scanned QR belongs
// to, without performing any check-in/out. Used by the receptionist scan-assist UI, which
// needs the seat's code to filter today's reservations down to a user picker.
checkInOutRouter.post(
  '/scan-seat/decode',
  requireRole(...SEAT_SCAN_OVERRIDE_ROLES),
  validateBody(DecodeSeatSchema),
  async (req, res) => {
    const { seatToken } = req.body;
    const qrResult = SeatQRTokenService.verifySeatToken(seatToken);
    if (!qrResult.valid || !qrResult.workstationId) {
      res.status(401).json({ status: 'error', code: 'QR_INVALID', message: qrResult.error });
      return;
    }

    const workstationCode = await WorkstationRepository.getWorkstationCode(qrResult.workstationId);
    if (!workstationCode) {
      res.status(404).json({ status: 'error', message: 'Poste introuvable.' });
      return;
    }

    res.json({ status: 'success', workstationId: qrResult.workstationId, workstationCode });
  }
);

// POST /api/checkinout/scan-seat - resolve a scanned desk badge. READ-ONLY, BY DESIGN.
//
// Scanning a QR must never move a reservation's state. It used to: this endpoint toggled the
// caller straight into check-in, or - worse - straight into check-out if they were already
// occupying the desk, so a stray scan of your own desk ended your session. The scan now only
// answers "what is mine on this desk, and what can I do about it"; the acting is done by an
// explicit button that calls /check-in or /check-out, each of which re-validates from scratch.
//
// The response carries the CALLER'S OWN reservation and nothing else. When somebody else holds
// the desk the answer is a flat "no access" - never a name, an email or any hint of who is
// sitting there, which the badge being public would otherwise turn into an identity oracle.
checkInOutRouter.post('/scan-seat', validateBody(ScanSeatSchema), async (req, res) => {
  const { seatToken } = req.body;
  const caller = req.user!;

  const qrResult = SeatQRTokenService.verifySeatToken(seatToken);
  if (!qrResult.valid || !qrResult.workstationId) {
    res.status(401).json({ status: 'error', code: 'QR_INVALID', message: qrResult.error });
    return;
  }

  const resolved = await CheckInOutService.resolveSeatScan(qrResult.workstationId, {
    id: caller.id,
    name: caller.full_name,
  });

  // A scan has THREE valid outcomes, and only the third is a refusal:
  //   - the caller holds a reservation here      -> `reservation`, with the action available;
  //   - they hold nothing but the desk is free   -> `walkIn`, the window they may take;
  //   - neither                                  -> refused, describing the DESK and nobody on it.
  // Testing `reservation` alone was wrong: a free desk carries no reservation, so every walk-in
  // was answered with "vous n'avez pas accès à ce poste" and the offer never reached the screen.
  if (!resolved.reservation && !resolved.walkIn) {
    res.status(404).json({
      status: 'error',
      code: 'NO_ACCESS',
      message: resolved.message || "Vous n'avez pas accès à ce poste.",
    });
    return;
  }

  res.json({ status: 'success', data: resolved });
});

// POST /api/checkinout/check-out-for - reception-desk check-out on a collaborator's behalf.
// The counterpart of /check-in-for, and role-gated the same way. The holder is resolved from the
// reservation itself, and the audit trail names the staff member who performed it.
checkInOutRouter.post(
  '/check-out-for',
  requireRole(...SEAT_SCAN_OVERRIDE_ROLES),
  validateBody(CheckInOnBehalfSchema),
  async (req, res) => {
    const reservation = await ReservationRepository.getReservationById(req.body.reservationId);
    if (!reservation) {
      res.status(404).json({ status: 'error', message: 'Réservation introuvable.' });
      return;
    }

    const success = await CheckInOutService.performCheckOut(reservation.id, reservation.user_id, {
      id: req.user!.id,
      name: req.user!.full_name,
      role: req.user!.role,
    });

    if (!success) {
      res.status(400).json({ status: 'error', message: 'Échec du check-out.' });
      return;
    }

    res.json({ status: 'success', data: { workstationCode: reservation.workstation_code } });
  }
);

// ── Site-wide maintenance operations ─────────────────────────────────────────────────────────
// These act on EVERY reservation on the site, not on the caller's own. Holding a valid session is
// therefore not sufficient to trigger them: any collaborator could otherwise force a site-wide
// sweep, or enumerate whose reservations are about to start. Scheduled execution goes through
// /api/cron/sweep, which authenticates with CRON_SECRET; these routes exist for operational staff
// running a sweep by hand.

// GET /api/checkinout/auto-checkout - close every reservation whose end time has passed.
checkInOutRouter.get('/auto-checkout', requireRole(...MAINTENANCE_ROLES), async (req, res) => {
  const count = await CheckInOutService.autoCheckOutExpired();
  res.json({ checkedOut: count });
});

// GET /api/checkinout/reminders - reservations starting shortly and still awaiting check-in.
checkInOutRouter.get('/reminders', requireRole(...MAINTENANCE_ROLES), async (req, res) => {
  const reminders = await CheckInOutService.getCheckInReminders();
  res.json(reminders);
});
