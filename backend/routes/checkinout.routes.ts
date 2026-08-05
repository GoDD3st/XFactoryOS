import { Router } from 'express';
import { CheckInOutService } from '../../services';
import { QRTokenService } from '../../services/qr/qrTokenService';
import { validateBody } from '../middleware/validateBody';
import { CheckInOutSchema } from '../validators';

export const checkInOutRouter = Router();

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
