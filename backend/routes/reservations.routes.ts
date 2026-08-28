import { Router } from 'express';
import { ReservationService, ReservationConflictError } from '@/services/reservations/reservationService';
import { validateBody } from '../middleware/validateBody';
import { requireOwnerOrAdmin, requirePermission } from '../middleware/rbacMiddleware';
import { reservationLimiter } from '../middleware/rateLimiter';
import { CreateReservationSchema, UpdateReservationStatusSchema, ExtendReservationSchema } from '../validators';
import { ReservationRepository } from '@/database/repositories/reservationRepository';
import { getServerWriteClient, extractBearerToken, hasAdminClient, requireAdminClient } from '@/database/serverClient';

function getDbClient(req: { headers: { authorization?: string } }) {
  if (hasAdminClient()) return requireAdminClient();
  return getServerWriteClient(extractBearerToken(req.headers.authorization));
}

export const reservationsRouter = Router();

// GET /api/reservations - Authenticated users only
reservationsRouter.get('/', async (req, res) => {
  try {
    const dbClient = getDbClient(req);
    const reservations = await ReservationRepository.getAllReservations(dbClient);
    res.json({ status: 'success', data: reservations });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/reservations - Create reservation (Rate limited + Zod validated + Zero-trust user identity)
//
// SRS §13 row "Réserver poste standard": C for every role EXCEPT Security and Visitor, which are
// X. This route previously had no role or permission guard at all - the `reserve_standard`
// permission existed in the policy table but was referenced nowhere in the codebase, so any
// authenticated user could book, including the roles the matrix forbids.
const RESERVE_FALLBACK_ROLES = [
  'collaborator',
  'receptionist',
  'building_manager',
  'gci_manager',
  'executive_assistant',
  'director',
  'admin',
  'super_admin',
  'it_admin',
] as const;

reservationsRouter.post(
  '/',
  reservationLimiter,
  requirePermission('reserve_standard', 'create', RESERVE_FALLBACK_ROLES),
  validateBody(CreateReservationSchema),
  async (req, res) => {
  try {
    const dbClient = getDbClient(req);
    const payload = {
      ...req.body,
      user_id: req.user!.id,
      user_name: req.user!.full_name,
      user_department: req.user!.department,
    };

    const reservation = await ReservationService.createReservation(payload, req.user!.role, dbClient);
    res.status(201).json({ status: 'success', data: reservation });
  } catch (error: any) {
    // BPMN D1 ALT path: surface alternative desks alongside the conflict so the client can
    // offer them instead of a flat rejection.
    if (error instanceof ReservationConflictError) {
      res.status(409).json({ status: 'error', message: error.message, alternatives: error.alternatives });
      return;
    }
    res.status(400).json({ status: 'error', message: error.message });
  }
});

// ── Early-extension offers ───────────────────────────────────────────────────────────────────
//
// When someone checks out before the end of their slot, the hours they give back are NOT opened
// to the site. The only person who may take them is whoever already holds the next reservation on
// that same desk, and only by moving their own booking's start earlier. Both routes below are
// scoped to the caller's own reservations for that reason.
//
// See services/reservations/earlyExtensionService.ts for the rule and its validation.

// GET /api/reservations/extension-offers - what the caller may currently extend into.
reservationsRouter.get('/extension-offers', async (req, res) => {
  try {
    const { EarlyExtensionService } = await import('@/services/reservations/earlyExtensionService');
    const offers = await EarlyExtensionService.listOffersForUser(req.user!.id);
    res.json({ status: 'success', data: offers });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/reservations/:id/extend - accept an extension, explicitly.
//
// The requested start is re-checked against an offer rebuilt from the database, so a client that
// asks for more than it was shown gains nothing. Ownership is taken from the session, never the
// body: the id in the URL is not authority to modify that reservation.
reservationsRouter.post(
  '/:id/extend',
  reservationLimiter,
  validateBody(ExtendReservationSchema),
  async (req, res) => {
    try {
      const { EarlyExtensionService } = await import('@/services/reservations/earlyExtensionService');
      const result = await EarlyExtensionService.acceptOffer(
        req.params.id,
        req.user!.id,
        req.body.newStartTime
      );

      if (!result.ok) {
        res.status(409).json({ status: 'error', message: result.message });
        return;
      }

      res.json({ status: 'success', data: result.reservation });
    } catch (error: any) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);

// PATCH /api/reservations/:id/status - Ownership check (Only owner or admin can update)
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
      res.json({ status: 'success', updated: result });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// DELETE /api/reservations/:id - Ownership check (Only owner or admin can delete)
reservationsRouter.delete(
  '/:id',
  requireOwnerOrAdmin(async (req) => {
    const resv = await ReservationRepository.getReservationById(req.params.id);
    return resv ? resv.user_id : null;
  }),
  async (req, res) => {
    try {
      const result = await ReservationService.deleteReservation(req.params.id);
      res.json({ status: 'success', deleted: result });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);
