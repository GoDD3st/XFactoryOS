import { Router } from 'express';
import { ReservationService } from '@/services/reservations/reservationService';
import { validateBody } from '../middleware/validateBody';
import { requireOwnerOrAdmin } from '../middleware/rbacMiddleware';
import { reservationLimiter } from '../middleware/rateLimiter';
import { CreateReservationSchema, UpdateReservationStatusSchema } from '../validators';
import { ReservationRepository } from '@/database/repositories/reservationRepository';

export const reservationsRouter = Router();

// GET /api/reservations — Authenticated users only
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

// POST /api/reservations — Create reservation (Rate limited + Zod validated + Zero-trust user identity)
reservationsRouter.post('/', reservationLimiter, validateBody(CreateReservationSchema), async (req, res) => {
  try {
    // 🛡️ Untrust client input: user_id, user_name, user_department come from req.user (JWT)
    const payload = {
      ...req.body,
      user_id: req.user!.id,
      user_name: req.user!.full_name,
      user_department: req.user!.department,
    };

    const reservation = await ReservationService.createReservation(payload);
    res.status(201).json({
      status: 'success',
      data: reservation,
    });
  } catch (error: any) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

// PATCH /api/reservations/:id/status — Ownership check (Only owner or admin can update)
reservationsRouter.patch(
  '/:id/status',
  requireOwnerOrAdmin(async (req) => {
    const resv = await ReservationRepository.getReservationById(req.params.id);
    return resv ? resv.user_id : null;
  }),
  validateBody(UpdateReservationStatusSchema),
  async (req, res) => {
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
  }
);

// DELETE /api/reservations/:id — Ownership check (Only owner or admin can delete)
reservationsRouter.delete(
  '/:id',
  requireOwnerOrAdmin(async (req) => {
    const resv = await ReservationRepository.getReservationById(req.params.id);
    return resv ? resv.user_id : null;
  }),
  async (req, res) => {
    try {
      const result = await ReservationService.deleteReservation(req.params.id);
      res.json({
        status: 'success',
        deleted: result,
      });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);
