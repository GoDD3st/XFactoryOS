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
 * In-Memory Rate Limiter Middleware
 * Rate limits endpoints per user ID (or IP address if unauthenticated).
 */
export function rateLimiter(options: RateLimiterOptions) {
  const { windowMs, maxRequests, message } = options;
  const keyGen = options.keyGenerator || ((req: Request) => req.user?.id || req.ip || 'anonymous');

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
