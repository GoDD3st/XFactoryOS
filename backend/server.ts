import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { authRouter } from './routes/auth.routes';
import { reservationsRouter } from './routes/reservations.routes';
import { workspacesRouter } from './routes/workspaces.routes';
import { waitingListRouter } from './routes/waitinglist.routes';
import { auditRouter } from './routes/audit.routes';
import { notificationsRouter } from './routes/notifications.routes';
import { aiRouter } from './routes/ai.routes';
import { telemetryRouter } from './routes/telemetry.routes';
import { hardwareRouter } from './routes/hardware.routes';
import { securityRouter } from './routes/security.routes';
import { noShowRouter } from './routes/noshow.routes';
import { checkInOutRouter } from './routes/checkinout.routes';
import { approvalRouter } from './routes/approval.routes';
import { searchRouter } from './routes/search.routes';
import { settingsRouter } from './routes/settings.routes';
import { historyRouter } from './routes/history.routes';
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'OCP SA XFactory OS Backend API',
      site: 'Safi Site Digital Twin',
      timestamp: new Date().toISOString(),
    });
  });

  // Microservices Express Routers
  app.use('/api/auth', authRouter);
  app.use('/api/reservations', reservationsRouter);
  app.use('/api/workspaces', workspacesRouter);
  app.use('/api/waiting-list', waitingListRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/telemetry', telemetryRouter);
  app.use('/api/hardware', hardwareRouter);
  app.use('/api/security', securityRouter);
  app.use('/api/noshow', noShowRouter);
  app.use('/api/checkinout', checkInOutRouter);
  app.use('/api/approvals', approvalRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/history', historyRouter);
  // Vite middleware or Static files handler
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[OCP XFactory Backend] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
