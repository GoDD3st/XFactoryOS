import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

interface RateLimiterOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  message?: string;
  keyGenerator?: (req: Request) => string;
}

/**
 * Client identity for rate-limiting purposes.
 *
 * `req.ip` is only the real caller once Express is told how many proxies sit in front of it -
 * see `app.set('trust proxy', 1)` in server.ts. Without that, every request behind Vercel reports
 * the proxy's address, so the whole internet shared ONE bucket: a single busy client could spend
 * the global quota and 429 everybody else, while an attacker got no per-source limit at all.
 *
 * X-Forwarded-For is attacker-controlled beyond the hops we trust, so this deliberately uses
 * Express's parsed `req.ip` rather than reading the header directly.
 */
function clientKey(req: Request): string {
  return req.user?.id || req.ip || 'unknown';
}

/**
 * In-process rate limiter, keyed per user id when authenticated and per client IP otherwise.
 *
 * SCOPE, stated honestly: the counters live in this process's memory. On a serverless platform
 * each instance has its own map and instances come and go, so this bounds abuse per instance
 * rather than globally. It is a backstop against runaway clients and casual brute force, NOT a
 * guarantee. Platform-level protection (Vercel WAF) or a shared store (Redis/Upstash) is what
 * enforces a true global limit.
 */
export function rateLimiter(options: RateLimiterOptions) {
  const { windowMs, maxRequests, message } = options;
  const keyGen = options.keyGenerator || clientKey;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.path}:${keyGen(req)}`;
    const now = Date.now();
    const record = rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (record.count >= maxRequests) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      res.status(429).json({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: message || `Trop de requêtes. Veuillez réessayer dans ${retryAfterSeconds} secondes.`,
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    record.count += 1;
    return next();
  };
}

/** Pre-configured Rate Limiters for critical actions */
export const reservationLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10, // Max 10 reservations per hour per user
  message: 'Limite de création de réservations atteinte (10 max par heure).',
});

export const apiGeneralLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60, // Max 60 API requests per minute per user/IP
  message: 'Trop de requêtes API. Ralentissez vos appels.',
});

/**
 * Credential-stuffing / brute-force guard for the sign-in endpoint.
 *
 * The general limiter allows 60 requests a minute, which is 60 password guesses a minute - no
 * obstacle at all to an online guessing attack. Sign-in gets its own, far stricter budget, keyed
 * per client IP (there is no authenticated user yet, by definition).
 */
export const authLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
  message:
    'Trop de tentatives de connexion. Réessayez dans quelques minutes ou contactez un administrateur.',
});
