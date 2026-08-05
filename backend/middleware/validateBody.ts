import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Zod Input Validation Middleware
 * Validates req.body against a strict Zod schema, strips unknown properties,
 * and returns 400 Bad Request with formatted field errors on failure.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate and parse (strict schemas strip/reject unknown fields)
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.issues.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        }));

        res.status(400).json({
          status: 'error',
          code: 'VALIDATION_FAILED',
          message: formattedErrors[0]?.message || 'Données de requête invalides.',
          errors: formattedErrors,
        });
        return;
      }

      res.status(400).json({
        status: 'error',
        code: 'BAD_REQUEST',
        message: 'Payload de requête invalide.',
      });
    }
  };
}
