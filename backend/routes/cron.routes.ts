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
 *
 * NOTE ON SCHEDULING: `vercel.json` no longer declares crons. Vercel's Hobby plan permits at most
 * one run per day and rejects any finer expression at deploy time, which is useless for sweeps
 * that need to run every few minutes. The schedule lives with an external caller instead - see
 * "Background jobs" in SETUP.md. Nothing about this route changes if the project later moves to a
 * plan where Vercel Cron can drive it again.
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
 * `job=all` runs every sweep in one request.
 *
 * This exists because Vercel's Hobby plan caps cron jobs at once per day - a sub-daily expression
 * is rejected at deploy time, not silently ignored - and a once-a-day no-show sweep is no sweep at
 * all: no-show detection is what releases a desk into the BPMN D5 cascade, so the queue would wait
 * a day for a seat freed at 09:05. Scheduling therefore has to come from outside Vercel, and an
 * external pinger is far easier to configure against one URL than against six.
 *
 * Runs in parallel rather than in sequence. Not because the budget is tight - Vercel's Hobby plan
 * allows 300s per invocation and the whole sweep measures ~430ms today - but because the sum of
 * six sequential round trips is the number that grows with the reservation table, while in
 * parallel the wall time is just the slowest job. It also means a single slow query delays only
 * itself instead of pushing everything behind it.
 *
 * allSettled, not all: one failing sweep must not cancel the other five. The response reports each
 * job's outcome separately and the status code reflects whether ANY of them failed, so a scheduler
 * that only watches HTTP status still notices, while the jobs that did work still ran.
 */
async function runAllJobs() {
  const names = Object.keys(JOBS);
  const settled = await Promise.allSettled(names.map((name) => JOBS[name]()));

  return names.map((name, i) => {
    const outcome = settled[i];
    return outcome.status === 'fulfilled'
      ? { job: name, ok: true, count: outcome.value.count, label: outcome.value.label }
      : { job: name, ok: false, error: outcome.reason?.message || String(outcome.reason) };
  });
}

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

  if (name === 'all') {
    const started = Date.now();
    const results = await runAllJobs();
    const ms = Date.now() - started;
    const failed = results.filter((r) => !r.ok);

    for (const r of results) {
      if (r.ok && r.count > 0) console.log(`[Cron ${r.job}] ${r.count} ${r.label}`);
      if (!r.ok) console.error(`[Cron ${r.job}] failed:`, r.error);
    }

    return res.status(failed.length > 0 ? 500 : 200).json({
      status: failed.length > 0 ? 'partial' : 'success',
      job: 'all',
      ms,
      failed: failed.length,
      results,
    });
  }

  const job = JOBS[name];
  if (!job) {
    return res.status(400).json({
      status: 'error',
      message: `Tâche inconnue : ${name}`,
      available: [...Object.keys(JOBS), 'all'],
    });
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
