import { Router } from 'express';
import { ReservationService } from '@/services/reservations/reservationService';

export const reservationsRouter = Router();

reservationsRouter.get('/', async (req, res) => {
  try {
    const reservations = await ReservationService.fetchReservations();
    res.json({
      status: 'success',
      data: reservations,
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

reservationsRouter.post('/', async (req, res) => {
  try {
    const reservation = await ReservationService.createReservation(req.body);
    res.json({
      status: 'success',
      data: reservation,
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

reservationsRouter.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const result = await ReservationService.updateReservationStatus(req.params.id, status);
    res.json({
      status: 'success',
      updated: result,
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

reservationsRouter.delete('/:id', async (req, res) => {
  try {
    const result = await ReservationService.deleteReservation(req.params.id);
    res.json({
      status: 'success',
      deleted: result,
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});
