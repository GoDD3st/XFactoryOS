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
import { aiConfigRouter } from './routes/aiConfig.routes';
import { telemetryRouter } from './routes/telemetry.routes';
import { hardwareRouter } from './routes/hardware.routes';
import { securityRouter } from './routes/security.routes';
import { noShowRouter } from './routes/noshow.routes';
import { checkInOutRouter } from './routes/checkinout.routes';
import { rolesRouter } from './routes/roles.routes';
import { approvalRouter } from './routes/approval.routes';
import { searchRouter } from './routes/search.routes';
import { settingsRouter, brandingRouter } from './routes/settings.routes';
import { historyRouter } from './routes/history.routes';
import { cronRouter } from './routes/cron.routes';
import { seedDatabaseIfEmpty } from '../database/seeder';
import { NoShowService } from '../services/noshow/noShowService';
import { authenticateJWT, assertDemoModeIsSafe } from './middleware/authMiddleware';
import { apiGeneralLimiter } from './middleware/rateLimiter';


export function createExpressApp() {
  // Checked at app construction, so it fires on the serverless path too - startServer() never
  // runs on Vercel, and a guard only in startServer() would protect exactly the deployment that
  // does not need it.
  assertDemoModeIsSafe();

  const app = express();

  // Trust exactly one proxy hop (Vercel's edge). Without this `req.ip` is the proxy's address,
  // so every caller shares a single rate-limit bucket and per-client limiting silently does
  // nothing. Deliberately `1`, not `true`: trusting the whole X-Forwarded-For chain would let a
  // client spoof its own source address and evade the limiter entirely.
  app.set('trust proxy', 1);

  app.use(express.json());

  // Health check endpoint (Public).
  // Previously returned status:'ok' unconditionally without touching anything - it would report
  // healthy with Postgres completely down, which makes it useless as the IT console's signal.
  // Each component is now actually probed.
  app.get('/api/health', async (req, res) => {
    const components: Record<string, { status: 'ok' | 'degraded' | 'down'; detail?: string }> = {};

    components.api = { status: 'ok' };

    // Real round-trip to Postgres rather than an assumption.
    try {
      const { getAdminClient } = await import('../database/serverClient');
      const admin = getAdminClient();
      if (!admin) {
        components.database = { status: 'degraded', detail: 'Clé service-role absente - accès serveur limité.' };
      } else {
        const started = Date.now();
        const { error } = await admin.from('clusters').select('id', { head: true, count: 'exact' });
        components.database = error
          ? { status: 'down', detail: error.message }
          : { status: 'ok', detail: `${Date.now() - started} ms` };
      }
    } catch (err: any) {
      components.database = { status: 'down', detail: err?.message || 'Erreur inconnue' };
    }

    // Auth mode is a real configuration fact, not a probe.
    components.authentication =
      process.env.DEMO_MODE === 'true'
        ? { status: 'degraded', detail: 'DEMO_MODE actif - authentification réelle contournée.' }
        : { status: 'ok', detail: 'Supabase Auth (JWT)' };

    try {
      const { PermissionService } = await import('../services/rbac/permissionService');
      components.rbac = PermissionService.isLoaded()
        ? { status: 'ok', detail: 'Politique role_permissions chargée' }
        : { status: 'degraded', detail: 'Politique illisible - repli sur les rôles codés en dur.' };
    } catch {
      components.rbac = { status: 'degraded', detail: 'État indéterminé' };
    }

    const values = Object.values(components).map((c) => c.status);
    const overall = values.includes('down') ? 'down' : values.includes('degraded') ? 'degraded' : 'ok';

    res.status(overall === 'down' ? 503 : 200).json({
      status: overall,
      service: 'XFactory OS Backend API',
      site: 'Safi Site Digital Twin',
      components,
      timestamp: new Date().toISOString(),
    });
  });

  // ZERO-TRUST GLOBAL MIDDLEWARE: Rate limiting + JWT Verification for ALL /api/* routes
  app.use('/api', apiGeneralLimiter);

  // Mounted BEFORE authenticateJWT, deliberately: the login screen needs the site name and logo
  // to render, and it has no session yet. Rate limiting above still applies. It exposes only
  // those two fields - see brandingRouter in routes/settings.routes.ts.
  app.use('/api/branding', brandingRouter);

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
  app.use('/api/ai-config', aiConfigRouter);
  app.use('/api/telemetry', telemetryRouter);
  app.use('/api/hardware', hardwareRouter);
  app.use('/api/security', securityRouter);
  app.use('/api/noshow', noShowRouter);
  app.use('/api/checkinout', checkInOutRouter);
  app.use('/api/roles', rolesRouter);
  app.use('/api/approvals', approvalRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/history', historyRouter);
  // Serverless scheduler entry point. Authenticated by CRON_SECRET, not by a user session.
  app.use('/api/cron', cronRouter);

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
    console.warn('SUPABASE_SERVICE_ROLE_KEY is not set in .env');
    console.warn('   Backend DB operations (reservations, seed) will fail with "permission denied".');
    console.warn('   Fix: Supabase Dashboard → Project Settings → API → copy service_role key');
    console.warn('   Add to .env:  SUPABASE_SERVICE_ROLE_KEY=your_key_here');
    console.warn('   Then restart: npm run dev');
    console.warn('');
  } else {
    console.log('Supabase service role configured - backend DB access enabled.');
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

  // Background Check-In Reminder Ticker (SRS FR-59) - nudges collaborators whose reservation
  // starts within 15 min and who haven't checked in yet.
  setInterval(async () => {
    try {
      const sent = await CheckInOutService.sendCheckInReminders();
      if (sent > 0) {
        console.log(`[Check-In Reminder Ticker] Sent ${sent} reminder(s).`);
      }
    } catch (err) {
      // non-blocking
    }
  }, 60000);

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

  // Background Temporary Seat Expiry Ticker - auto-disables extension seats added via the
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

  // Background Cluster Authorization Expiry Ticker (BR-09 / SRS §14.4) - re-locks a management
  // cluster once its approved temporary-access window has elapsed.
  const { ClusterAuthorizationService } = await import('../services/workspaces/clusterAuthorizationService');
  setInterval(async () => {
    try {
      const relocked = await ClusterAuthorizationService.relockExpiredAuthorizations();
      if (relocked > 0) {
        console.log(`[Cluster Auth Ticker] Re-locked ${relocked} cluster(s) after temporary access expired.`);
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

  // Warm the RBAC policy cache before serving traffic so the first gated request doesn't pay for
  // the load, and so a misconfigured/unseeded policy table is visible in the logs at boot rather
  // than surfacing as scattered 403s later.
  const { PermissionService } = await import('../services/rbac/permissionService');
  await PermissionService.load();
  console.log(
    PermissionService.isLoaded()
      ? 'RBAC policy loaded - route guards are enforced from role_permissions.'
      :'RBAC policy unavailable - route guards are using their hardcoded fallback role lists.'
  );

  if (!process.env.VERCEL) {
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`[OCP XFactory Backend] Zero-Trust Server running on http://0.0.0.0:${PORT}`);
    });
  }
}

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  startServer();
}
