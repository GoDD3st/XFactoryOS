import type { Request, Response } from 'express';
// The PRE-BUILT bundle, not ../backend/server.
//
// This package is "type": "module", so Vercel transpiles this file to ESM and runs it as ESM.
// Importing `../backend/server` from here deployed a function whose very first statement was an
// extensionless relative import - which Node's ESM resolver rejects outright - against a path that
// did not exist in the lambda anyway, because nothing had compiled `backend/` to JavaScript:
//
//   ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/backend/server'
//     imported from /var/task/api/index.js
//
// Every route answered 500 on that, including ones that touch nothing. `tsc --noEmit` was happy
// throughout: tsconfig sets moduleResolution "bundler", which permits extensionless specifiers
// precisely because it assumes a bundler will resolve them. Nothing was bundling this entry.
//
// So the bundling is done explicitly. `npm run build:server` already existed for the self-hosted
// `npm start` and does exactly what is needed - esbuild resolves the extensionless imports AND the
// `@/*` tsconfig aliases that riddle backend/, and emits one self-contained CommonJS file. The
// import below names it with its real extension, so ESM can resolve it, and a .cjs imported from
// ESM hands back its module.exports as the default binding.
//
// vercel.json runs build:server as part of the build and pins the output with includeFiles, so the
// file exists before this function is traced.
import serverBundle from '../server-dist/server.cjs';

const { createExpressApp } = serverBundle as { createExpressApp: () => (req: Request, res: Response) => void };

/**
 * createExpressApp() can also refuse to build - assertDemoModeIsSafe() throws when a production
 * deployment is configured with DEMO_MODE=true. Left uncaught that throw happens at module scope,
 * the function dies on cold start, and every route returns a bare 500 with no body, which is
 * indistinguishable from the packaging failure above. Catching it does not soften the guard: a
 * refused app still serves nothing, every request gets 503 - but it says which failure it was.
 * The detail goes to the log; the response carries only enough to point at the configuration,
 * since anyone can call it.
 */
let app: ((req: Request, res: Response) => void) | null = null;
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
