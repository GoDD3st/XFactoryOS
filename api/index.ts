import type { Request, Response } from 'express';
import { createExpressApp } from '../backend/server';

/**
 * Vercel serverless entry point.
 *
 * createExpressApp() can refuse to build - assertDemoModeIsSafe() throws when a production
 * deployment is configured with DEMO_MODE=true. Left uncaught, that throw happens at module scope,
 * the function crashes on cold start, and every route in the application answers a bare 500 with
 * no body: /api/branding, /api/health, everything. The cause is legible only in the function log,
 * and only to someone who already suspects the boot sequence.
 *
 * Catching it does not soften the guard. A refusal still serves nothing - every request gets 503
 * and no route is reachable - but it says so, and the browser console shows a reason instead of an
 * unexplained 500 storm. The detail goes to the log; the response deliberately carries only enough
 * to point at the configuration, since anyone can call it.
 */
let app: ReturnType<typeof createExpressApp> | null = null;
let bootError: Error | null = null;

try {
  app = createExpressApp();
} catch (err: any) {
  bootError = err instanceof Error ? err : new Error(String(err));
  console.error('[BOOT] Application refused to start:', bootError.message);
}

export default function handler(req: Request, res: Response) {
  if (!app) {
    return res.status(503).json({
      status: 'error',
      code: 'BOOT_FAILED',
      message:
        "L'application n'a pas pu démarrer : configuration serveur invalide. " +
        'Consultez les logs de la fonction pour le détail.',
    });
  }
  return app(req, res);
}
