import { Router } from 'express';
import { WaitingListService } from '@/services/waitinglist/waitingListService';
import { validateBody } from '../middleware/validateBody';
import { CreateWaitingListEntrySchema } from '../validators';

export const waitingListRouter = Router();

// GET /api/waiting-list — Authenticated users
waitingListRouter.get('/', async (req, res) => {
  try {
    const data = WaitingListService.getWaitingList();
    res.json({ success: true, data });
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
    };
    const entry = await WaitingListService.addToWaitingList(payload);
    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de l\'ajout à la liste d\'attente' });
  }
});

// DELETE /api/waiting-list/:id — Cancel waiting list entry
waitingListRouter.delete('/:id', async (req, res) => {
  try {
    await WaitingListService.cancelWaitingListEntry(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de l\'annulation de l\'entrée' });
  }
});
