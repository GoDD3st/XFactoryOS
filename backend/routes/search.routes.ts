import { Router } from 'express';
import { SearchService } from '../../services/search/searchService';

export const searchRouter = Router();

searchRouter.post('/workstations', (req, res) => {
  try {
    const results = SearchService.searchWorkstations(req.body);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

searchRouter.post('/reservations', (req, res) => {
  try {
    const results = SearchService.searchReservations(req.body);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});
