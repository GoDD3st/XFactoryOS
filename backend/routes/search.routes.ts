import { Router } from 'express';
import { SearchService } from '../../services/search/searchService';

export const searchRouter = Router();

// POST /api/search/workstations — Search workstations
searchRouter.post('/workstations', (req, res) => {
  try {
    const results = SearchService.searchWorkstations(req.body);
    res.json({ status: 'success', data: results });
  } catch (error) {
    res.status(500).json({ status: 'error', error: 'Échec de la recherche de postes' });
  }
});

// POST /api/search/reservations — Search reservations
searchRouter.post('/reservations', (req, res) => {
  try {
    const results = SearchService.searchReservations(req.body);
    res.json({ status: 'success', data: results });
  } catch (error) {
    res.status(500).json({ status: 'error', error: 'Échec de la recherche de réservations' });
  }
});
