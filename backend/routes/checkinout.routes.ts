import { Router } from 'express';
import { CheckInOutService } from '../../services';
import { QRTokenService } from '../../services/qr/qrTokenService';
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

// POST /api/checkinout/check-in — Check in (userId forced from req.user, optionally supports QR token verification)
checkInOutRouter.post('/check-in', validateBody(CheckInOutSchema), async (req, res) => {
  const { reservationId, qrToken } = req.body;
  const userId = req.user!.id;

  if (qrToken) {
    const qrResult = QRTokenService.verifyQRToken(qrToken, userId);
    if (!qrResult.valid) {
      res.status(401).json({ status: 'error', code: 'QR_INVALID', message: qrResult.error });
      return;
    }
  }

  const success = await CheckInOutService.performCheckIn(reservationId, userId);
  if (!success) {
    res.status(400).json({ status: 'error', message: 'Échec du check-in. Réservation introuvable ou déjà validée.' });
    return;
  }
  res.json({ success: true, message: 'Check-in effectué avec succès' });
});

// POST /api/checkinout/check-in-for — reception-desk check-in on a collaborator's behalf.
// Distinct from /check-in, which forces the caller's own id and so can only ever check the
// caller in. The reservation holder is resolved server-side from the reservation itself, so the
// caller cannot check in an arbitrary user — only whoever actually holds that booking.
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

// POST /api/checkinout/late-check-in — a reservation holder asks for a late check-in.
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

// GET /api/checkinout/late-check-in/mine — the caller's own requests and their status.
checkInOutRouter.get('/late-check-in/mine', async (req, res) => {
  try {
    res.json({ status: 'success', data: await LateCheckInService.listForUser(req.user!.id) });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET /api/checkinout/late-check-in — full queue + history, reviewers only.
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

// PATCH /api/checkinout/late-check-in/:id/decision — approve or reject.
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

// POST /api/checkinout/check-out — Check out (userId forced from req.user)
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

// GET /api/checkinout/qr/:reservationId — Generate secure HMAC-signed QR token for user's reservation
checkInOutRouter.get('/qr/:reservationId', (req, res) => {
  const { reservationId } = req.params;
  const userId = req.user!.id;
  const token = QRTokenService.generateQRToken(reservationId, userId);
  res.json({ status: 'success', qrToken: token });
});

// GET /api/checkinout/seat-qr/:workstationId — Issue the static, printable badge token for a seat
checkInOutRouter.get('/seat-qr/:workstationId', requireRole(...SEAT_QR_MANAGER_ROLES), (req, res) => {
  const { workstationId } = req.params;
  const token = SeatQRTokenService.generateSeatToken(workstationId);
  res.json({ status: 'success', token });
});

// POST /api/checkinout/scan-seat/decode — Read-only: resolve which seat a scanned QR belongs
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

// POST /api/checkinout/scan-seat — Employee (or receptionist on their behalf) scans a desk's
// QR badge; toggles check-in/check-out on whichever active reservation that user holds on
// this seat right now.
checkInOutRouter.post('/scan-seat', validateBody(ScanSeatSchema), async (req, res) => {
  const { seatToken, targetUserId } = req.body;
  const caller = req.user!;

  const qrResult = SeatQRTokenService.verifySeatToken(seatToken);
  if (!qrResult.valid || !qrResult.workstationId) {
    res.status(401).json({ status: 'error', code: 'QR_INVALID', message: qrResult.error });
    return;
  }

  const canActForOthers = SEAT_SCAN_OVERRIDE_ROLES.includes(caller.role);
  const userId = targetUserId && canActForOthers ? targetUserId : caller.id;

  const reservation = await ReservationRepository.getActiveReservationForUserAndSeat(userId, qrResult.workstationId);
  if (!reservation) {
    res.status(404).json({
      status: 'error',
      code: 'NO_ACTIVE_RESERVATION',
      message: 'Aucune réservation active pour cet utilisateur sur ce poste actuellement.',
    });
    return;
  }

  if (reservation.status === 'confirmée') {
    const success = await CheckInOutService.performCheckIn(reservation.id, userId);
    if (!success) {
      res.status(400).json({ status: 'error', message: 'Échec du check-in.' });
      return;
    }
    res.json({ status: 'success', action: 'check-in', workstation_code: reservation.workstation_code });
    return;
  }

  if (reservation.status === 'check-in') {
    const success = await CheckInOutService.performCheckOut(reservation.id, userId);
    if (!success) {
      res.status(400).json({ status: 'error', message: 'Échec du check-out.' });
      return;
    }
    res.json({ status: 'success', action: 'check-out', workstation_code: reservation.workstation_code });
    return;
  }

  res.status(400).json({ status: 'error', message: 'Cette réservation ne peut pas être traitée depuis ce statut.' });
});

// GET /api/checkinout/auto-checkout — Internal system auto-checkout
checkInOutRouter.get('/auto-checkout', async (req, res) => {
  const count = await CheckInOutService.autoCheckOutExpired();
  res.json({ checkedOut: count });
});

// GET /api/checkinout/reminders — Check-in reminders
checkInOutRouter.get('/reminders', async (req, res) => {
  const reminders = await CheckInOutService.getCheckInReminders();
  res.json(reminders);
});
