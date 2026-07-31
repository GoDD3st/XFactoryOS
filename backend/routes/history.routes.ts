import { Router } from 'express';
import { HistoryService } from '../../services/history/historyService';

export const historyRouter = Router();

historyRouter.post('/', (req, res) => {
  try {
    const results = HistoryService.getReservationHistory(req.body);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

historyRouter.get('/workstation/:code', (req, res) => {
  try {
    const results = HistoryService.getWorkstationHistory(req.params.code);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch workstation history' });
  }
});

historyRouter.get('/user/:id', (req, res) => {
  try {
    const results = HistoryService.getUserHistory(req.params.id);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user history' });
  }
});

historyRouter.post('/export-csv', (req, res) => {
  try {
    const reservations = req.body;
    const csvContent = HistoryService.exportHistoryAsCSV(reservations);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="history.csv"');
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export history' });
  }
});
