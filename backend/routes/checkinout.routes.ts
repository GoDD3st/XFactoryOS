import { Router } from 'express';
import { CheckInOutService } from '../../services';

export const checkInOutRouter = Router();

checkInOutRouter.post('/check-in', (req, res) => {
  const { reservationId, userId } = req.body;
  const success = CheckInOutService.performCheckIn(reservationId, userId);
  res.json({ success });
});

checkInOutRouter.post('/check-out', (req, res) => {
  const { reservationId, userId } = req.body;
  const success = CheckInOutService.performCheckOut(reservationId, userId);
  res.json({ success });
});

checkInOutRouter.get('/auto-checkout', (req, res) => {
  const count = CheckInOutService.autoCheckOutExpired();
  res.json({ checkedOut: count });
});

checkInOutRouter.get('/reminders', (req, res) => {
  const reminders = CheckInOutService.getCheckInReminders();
  res.json(reminders);
});
