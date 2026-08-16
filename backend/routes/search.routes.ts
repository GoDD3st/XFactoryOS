import { Router } from 'express';
import { SearchService } from '../../services/search/searchService';

export const searchRouter = Router();

// POST /api/search/workstations - Search workstations
searchRouter.post('/workstations', async (req, res) => {
  try {
    const results = await SearchService.searchWorkstations(req.body);
    res.json({ status: 'success', data: results });
  } catch (error) {
    res.status(500).json({ status: 'error', error: 'Échec de la recherche de postes' });
  }
});

// POST /api/search/reservations - Search reservations (scoped to own unless an ops role)
searchRouter.post('/reservations', async (req, res) => {
  try {
    const results = await SearchService.searchReservations(req.body, req.user!.id, req.user!.role);
    res.json({ status: 'success', data: results });
  } catch (error) {
    res.status(500).json({ status: 'error', error: 'Échec de la recherche de réservations' });
  }
});
