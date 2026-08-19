import { Router } from 'express';
import { HistoryService } from '../../services/history/historyService';
import { requireOwnerOrAdmin, requireRole } from '../middleware/rbacMiddleware';

export const historyRouter = Router();

// Roles allowed to search/browse history across everyone (matches SearchService's scoping).
const HISTORY_OPS_ROLES = ['super_admin', 'admin', 'building_manager', 'gci_manager', 'receptionist'] as const;

// POST /api/history - Search reservation history (scoped to own reservations unless an ops role)
historyRouter.post('/', async (req, res) => {
  try {
    const isOps = (HISTORY_OPS_ROLES as readonly string[]).includes(req.user!.role);
    const filters = { ...req.body, userId: isOps ? req.body.userId : req.user!.id };
    const results = await HistoryService.getReservationHistory(filters);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Échec de la recherche dans l\'historique' });
  }
});

// GET /api/history/workstation/:code - Workstation history (Admin/Building/GCI Manager - §28.8)
historyRouter.get('/workstation/:code', requireRole(...HISTORY_OPS_ROLES), async (req, res) => {
  try {
    const results = await HistoryService.getWorkstationHistory(req.params.code);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Échec de la récupération de l\'historique du poste' });
  }
});

// GET /api/history/user/:id - User history (Ownership enforced: owner or admin only)
historyRouter.get('/user/:id', requireOwnerOrAdmin(req => req.params.id), async (req, res) => {
  try {
    const results = await HistoryService.getUserHistory(req.params.id);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Échec de la récupération de l\'historique utilisateur' });
  }
});

// POST /api/history/export-csv - Export history as CSV
historyRouter.post('/export-csv', (req, res) => {
  try {
    const reservations = req.body;
    const csvContent = HistoryService.exportHistoryAsCSV(reservations);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="historique_reservations.csv"');
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({ error: 'Échec de l\'exportation CSV' });
  }
});
