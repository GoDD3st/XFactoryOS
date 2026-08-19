import { Router } from 'express';

export const cronRouter = Router();

/**
 * Serverless replacement for the setInterval tickers in server.ts.
 *
 * On Vercel `startServer()` never runs (it is guarded on `process.env.VERCEL`), so every
 * background sweep is dead: no-show detection, auto check-out, check-in reminders, waiting-list
 * offer expiry, temporary-seat expiry and cluster-authorisation re-lock. That is not cosmetic -
 * no-show detection is what triggers the BPMN D5 waiting-list cascade, so without it a freed desk
 * is never offered to the queue. Vercel Cron calls this endpoint on the schedules in vercel.json.
 *
 * Self-hosted deployments keep using the in-process tickers and can ignore this route.
 */
const JOBS: Record<string, () => Promise<{ label: string; count: number }>> = {
  'no-show': async () => {
    const { NoShowService } = await import('@/services/noshow/noShowService');
    return { label: 'reservations marked no-show', count: await NoShowService.detectNoShows() };
  },
  'auto-checkout': async () => {
    const { CheckInOutService } = await import('@/services/checkinout/checkInOutService');
    return { label: 'expired check-ins released', count: await CheckInOutService.autoCheckOutExpired() };
  },
  'checkin-reminder': async () => {
    const { CheckInOutService } = await import('@/services/checkinout/checkInOutService');
    return { label: 'check-in reminders sent', count: await CheckInOutService.sendCheckInReminders() };
  },
  'waiting-list-expiry': async () => {
    const { WaitingListService } = await import('@/services/waitinglist/waitingListService');
    return { label: 'stale offers expired and cascaded', count: await WaitingListService.expireStaleOffers() };
  },
  'temp-seat-expiry': async () => {
    const { WorkspaceService } = await import('@/services/workspaces/workspaceService');
    return { label: 'temporary seats disabled', count: await WorkspaceService.expireTemporarySeats() };
  },
  'cluster-auth-expiry': async () => {
    const { ClusterAuthorizationService } = await import('@/services/workspaces/clusterAuthorizationService');
    return { label: 'clusters re-locked', count: await ClusterAuthorizationService.relockExpiredAuthorizations() };
  },
};

/**
 * GET /api/cron/sweep?job=<name>
 *
 * Authenticated by CRON_SECRET rather than by a user session: the caller is Vercel's scheduler,
 * which has no JWT. Vercel sends `Authorization: Bearer $CRON_SECRET` on cron invocations. Without
 * the secret configured the route refuses to run at all - an open endpoint here would let anyone
 * force no-show detection across the whole site.
 */
cronRouter.get('/sweep', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({ status: 'error', message: 'CRON_SECRET absent - tâches planifiées désactivées.' });
  }

  const provided = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (provided !== secret) {
    return res.status(401).json({ status: 'error', message: 'Non autorisé.' });
  }

  const name = String(req.query.job || '');
  const job = JOBS[name];
  if (!job) {
    return res.status(400).json({ status: 'error', message: `Tâche inconnue : ${name}`, available: Object.keys(JOBS) });
  }

  try {
    const started = Date.now();
    const { label, count } = await job();
    const ms = Date.now() - started;
    if (count > 0) console.log(`[Cron ${name}] ${count} ${label} (${ms} ms)`);
    res.json({ status: 'success', job: name, count, label, ms });
  } catch (error: any) {
    console.error(`[Cron ${name}] failed:`, error);
    res.status(500).json({ status: 'error', job: name, message: error.message });
  }
});
