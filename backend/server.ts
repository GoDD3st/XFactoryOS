import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { authRouter } from './routes/auth.routes';
import { usersRouter } from './routes/users.routes';
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
import { seedDatabaseIfEmpty } from '../database/seeder';
import { NoShowService } from '../services/noshow/noShowService';
import { authenticateJWT } from './middleware/authMiddleware';
import { apiGeneralLimiter } from './middleware/rateLimiter';


export function createExpressApp() {
  const app = express();

  app.use(express.json());

  // Health check endpoint (Public)
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'OCP SA XFactory OS Backend API',
      site: 'Safi Site Digital Twin',
      timestamp: new Date().toISOString(),
    });
  });

  // 🛡️ ZERO-TRUST GLOBAL MIDDLEWARE: Rate limiting + JWT Verification for ALL /api/* routes
  app.use('/api', apiGeneralLimiter);
  app.use('/api', authenticateJWT);

  // Microservices Express Routers (All protected by JWT + RBAC guards)
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
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

  return app;
}

async function startServer() {
  const app = createExpressApp();
  const PORT = process.env.PORT || 3000;

  // Auto-seed Supabase Database if empty
  await seedDatabaseIfEmpty();

  const { hasAdminClient } = await import('../database/serverClient');
  if (!hasAdminClient()) {
    console.warn('');
    console.warn('⚠️  SUPABASE_SERVICE_ROLE_KEY is not set in .env');
    console.warn('   Backend DB operations (reservations, seed) will fail with "permission denied".');
    console.warn('   Fix: Supabase Dashboard → Project Settings → API → copy service_role key');
    console.warn('   Add to .env:  SUPABASE_SERVICE_ROLE_KEY=your_key_here');
    console.warn('   Then restart: npm run dev');
    console.warn('');
  } else {
    console.log('✅ Supabase service role configured — backend DB access enabled.');
  }

  // Background No-Show Auto Detection Ticker (BPMN D4 / SRS BR-12)
  setInterval(async () => {
    try {
      const detected = await NoShowService.detectNoShows();
      if (detected > 0) {
        console.log(`[No-Show Ticker] Auto-released ${detected} un-checked-in reservation(s).`);
      }
    } catch (err) {
      // Background ticker non-blocking catch
    }
  }, 60000);

  // Background Auto Check-Out Ticker
  const { CheckInOutService } = await import('../services/checkinout/checkInOutService');
  setInterval(async () => {
    try {
      const count = await CheckInOutService.autoCheckOutExpired();
      if (count > 0) {
        console.log(`[Auto Check-Out] Released ${count} expired check-in reservation(s).`);
      }
    } catch (err) {
      // non-blocking
    }
  }, 120000);

  // Background Waiting List Offer Expiry Ticker (BPMN D5 GWRESP "expire" branch)
  const { WaitingListService } = await import('../services/waitinglist/waitingListService');
  setInterval(async () => {
    try {
      const expired = await WaitingListService.expireStaleOffers();
      if (expired > 0) {
        console.log(`[Waiting List Ticker] Expired ${expired} unanswered offer(s) and cascaded to next in FIFO.`);
      }
    } catch (err) {
      // non-blocking
    }
  }, 60000);

  // Background Temporary Seat Expiry Ticker — auto-disables extension seats added via the
  // "Ajouter un poste" form as temporary once their end-of-window is reached.
  const { WorkspaceService } = await import('../services/workspaces/workspaceService');
  setInterval(async () => {
    try {
      const disabled = await WorkspaceService.expireTemporarySeats();
      if (disabled > 0) {
        console.log(`[Temporary Seat Ticker] Auto-disabled ${disabled} expired temporary seat(s).`);
      }
    } catch (err) {
      // non-blocking
    }
  }, 60000);

  // Vite middleware or Static files handler
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) return next();
      try {
        const url = req.originalUrl;
        const template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        const html = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`[OCP XFactory Backend] Zero-Trust Server running on http://0.0.0.0:${PORT}`);
    });
  }
}

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  startServer();
}
