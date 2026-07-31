import { Router } from 'express';
import { NoShowService } from '../../services';

export const noShowRouter = Router();

noShowRouter.get('/detect', (req, res) => {
  const count = NoShowService.detectNoShows();
  res.json({ detected: count });
});

noShowRouter.get('/stats', (req, res) => {
  const stats = NoShowService.getNoShowStats();
  res.json(stats);
});
