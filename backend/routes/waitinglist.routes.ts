import { Router } from 'express';
import { WaitingListService } from '@/services/waitinglist/waitingListService';
import { WaitingListRepository } from '@/database/repositories/waitingListRepository';
import { requireOwnerOrAdmin } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import { CreateWaitingListEntrySchema } from '../validators';

export const waitingListRouter = Router();

// Roles allowed to see/manage the whole waiting list (matches the p_waiting_list_read/
// p_waiting_list_update RLS policies). Everyone else only sees/cancels their own entries —
// SRS §11.14 "Sécurité: Visible uniquement au demandeur et admins".
const WAITING_LIST_OPS_ROLES = ['super_admin', 'admin', 'building_manager', 'gci_manager', 'receptionist'];

// GET /api/waiting-list — own entries only, unless an ops/admin role
waitingListRouter.get('/', async (req, res) => {
  try {
    const data = await WaitingListRepository.getWaitingList();
    const isOps = WAITING_LIST_OPS_ROLES.includes(req.user!.role);
    const scoped = isOps ? data : data.filter((e) => e.user_id === req.user!.id);
    res.json({ success: true, data: scoped });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de la récupération de la liste d\'attente' });
  }
});

// POST /api/waiting-list — Add to waiting list (user_id forced from req.user)
waitingListRouter.post('/', validateBody(CreateWaitingListEntrySchema), async (req, res) => {
  try {
    const payload = {
      ...req.body,
      user_id: req.user!.id,
      user_name: req.user!.full_name,
      user_department: req.user!.department,
    };
    const entry = await WaitingListService.addToWaitingList(payload);
    res.status(201).json({ success: true, data: entry });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Échec de l\'ajout à la liste d\'attente' });
  }
});

// DELETE /api/waiting-list/:id — Cancel waiting list entry (owner or admin only)
waitingListRouter.delete(
  '/:id',
  requireOwnerOrAdmin(async (req) => {
    const list = await WaitingListRepository.getWaitingList();
    const entry = list.find((e) => e.id === req.params.id);
    return entry ? entry.user_id : null;
  }),
  async (req, res) => {
    try {
      await WaitingListService.cancelWaitingListEntry(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Échec de l\'annulation de l\'entrée' });
    }
  }
);

// POST /api/waiting-list/:id/accept — BPMN D5 GWRESP "ACCEPTE" (owner only)
waitingListRouter.post(
  '/:id/accept',
  requireOwnerOrAdmin(async (req) => {
    const list = await WaitingListRepository.getWaitingList();
    const entry = list.find((e) => e.id === req.params.id);
    return entry ? entry.user_id : null;
  }),
  async (req, res) => {
    try {
      const reservation = await WaitingListService.acceptOffer(req.params.id, req.user!.id);
      res.json({ success: true, data: reservation });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "Échec de l'acceptation de l'offre" });
    }
  }
);

// POST /api/waiting-list/:id/decline — BPMN D5 GWRESP "REFUSE" (owner only)
waitingListRouter.post(
  '/:id/decline',
  requireOwnerOrAdmin(async (req) => {
    const list = await WaitingListRepository.getWaitingList();
    const entry = list.find((e) => e.id === req.params.id);
    return entry ? entry.user_id : null;
  }),
  async (req, res) => {
    try {
      await WaitingListService.declineOffer(req.params.id, req.user!.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "Échec du refus de l'offre" });
    }
  }
);
