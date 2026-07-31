import { Router } from 'express';
import { WaitingListService } from '@/services/waitinglist/waitingListService';

export const waitingListRouter = Router();

waitingListRouter.get('/', async (req, res) => {
  try {
    const data = WaitingListService.getWaitingList();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch waiting list' });
  }
});

waitingListRouter.post('/', async (req, res) => {
  try {
    const entry = await WaitingListService.addToWaitingList(req.body);
    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to add to waiting list' });
  }
});

waitingListRouter.delete('/:id', async (req, res) => {
  try {
    await WaitingListService.cancelWaitingListEntry(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to cancel waiting list entry' });
  }
});
