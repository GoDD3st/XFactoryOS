import { Router } from 'express';
import { AIConfigService } from '@/services/ai/aiConfigService';
import { CONFIG_UNCHANGED_NOTICE } from '@/services/ai/aiErrorMessages';
import { listSupportedProviders } from '@/services/ai/providers';
import { requirePermission } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import { AIConfigActivateSchema, AIModelListSchema } from '../validators';

export const aiConfigRouter = Router();

/**
 * Global AI configuration endpoints.
 *
 * Authorisation is enforced here, on the server - hiding the Settings section in the UI is a
 * convenience, not the control (§17). Every route is gated on the `ai_configuration` permission,
 * with admin/super_admin as the DB-outage fallback, matching the pattern used across the platform.
 *
 * `ai_configuration` is a dedicated permission rather than a reuse of `technical_administration`:
 * the §13 matrix grants the latter to IT Admin and withholds it from Administrator, which is the
 * exact inverse of who may configure AI.
 *
 * No response on this router ever contains the provider credential. The key is accepted on
 * activate/validate and immediately encrypted; it is never selected back out.
 */
const AI_CONFIG_ROLES = ['admin', 'super_admin'] as const;

// GET /api/ai-config/providers - the approved provider list for the dropdown
aiConfigRouter.get(
  '/providers',
  requirePermission('ai_configuration', 'read', AI_CONFIG_ROLES),
  (_req, res) => {
    res.json({ success: true, data: listSupportedProviders() });
  }
);

// GET /api/ai-config - safe metadata about the active configuration
aiConfigRouter.get(
  '/',
  requirePermission('ai_configuration', 'read', AI_CONFIG_ROLES),
  async (_req, res) => {
    try {
      res.json({ success: true, data: await AIConfigService.getMetadata() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Configuration IA illisible.' });
    }
  }
);

// GET /api/ai-config/history - previous configurations, no credentials
aiConfigRouter.get(
  '/history',
  requirePermission('ai_configuration', 'read', AI_CONFIG_ROLES),
  async (_req, res) => {
    res.json({ success: true, data: await AIConfigService.getHistory() });
  }
);

// POST /api/ai-config/models - list models for a provider (needs a credential, stored or supplied)
aiConfigRouter.post(
  '/models',
  requirePermission('ai_configuration', 'update', AI_CONFIG_ROLES),
  validateBody(AIModelListSchema),
  async (req, res) => {
    try {
      const models = await AIConfigService.listModels(req.body.provider, req.body.api_key);
      res.json({ success: true, data: models });
    } catch (err: any) {
      // 400 not 500: a rejected key is a client-supplied problem, not a server fault.
      res.status(400).json({ success: false, error: err?.message || 'Impossible de lister les modèles.' });
    }
  }
);

// POST /api/ai-config/test - run the full validation chain WITHOUT activating anything (§9)
aiConfigRouter.post(
  '/test',
  requirePermission('ai_configuration', 'update', AI_CONFIG_ROLES),
  validateBody(AIConfigActivateSchema),
  async (req, res) => {
    const result = await AIConfigService.testConfiguration({
      providerId: req.body.provider,
      model: req.body.model,
      apiKey: req.body.api_key,
    });

    // Always 200: a validation verdict is a successful answer to "is this configuration usable",
    // even when the verdict is no. The body carries ok/kind.
    res.json({ success: true, data: result });
  }
);

// PUT /api/ai-config - validate, then activate only on success
aiConfigRouter.put(
  '/',
  requirePermission('ai_configuration', 'update', AI_CONFIG_ROLES),
  validateBody(AIConfigActivateSchema),
  async (req, res) => {
    // Captured before the swap so the audit entry can record what was replaced.
    const previous = await AIConfigService.getMetadata();

    const result = await AIConfigService.validateAndActivate({
      providerId: req.body.provider,
      model: req.body.model,
      apiKey: req.body.api_key,
      userId: req.user!.id,
    });

    const { AuditRepository } = await import('@/database/repositories/auditRepository');

    if (!result.ok) {
      // A failed activation is itself security-relevant: it is an attempt to change a
      // platform-wide setting. Logged with the reason, never with the credential.
      AuditRepository.logEvent(
        'SETTINGS_CHANGE',
        req.user!.id,
        req.user!.full_name,
        req.user!.role,
        'ai-configuration',
        `Changement de configuration IA REFUSÉ (${result.status || 'UNKNOWN'}) : ${req.body.provider}/${req.body.model}. ` +
          `Configuration active inchangée (${previous.provider || 'aucune'}/${previous.model || ''}).`
      ).catch(() => {});

      return res.status(400).json({
        success: false,
        status: result.status || 'UNKNOWN',
        // Primary, user-facing sentence - never the raw provider body.
        error: result.error || 'Validation impossible.',
        // Vendor's own words, redacted, for the collapsed technical-detail area.
        technicalDetail: result.technicalDetail,
        suggestions: result.suggestions,
        message: CONFIG_UNCHANGED_NOTICE,
      });
    }

    AuditRepository.logEvent(
      'SETTINGS_CHANGE',
      req.user!.id,
      req.user!.full_name,
      req.user!.role,
      'ai-configuration',
      `Configuration IA modifiée. Précédent : ${previous.provider || 'aucune'}/${previous.model || ''}. ` +
        `Nouveau : ${result.metadata?.provider}/${result.metadata?.model}. Statut : activée.`
    ).catch(() => {});

    res.json({ success: true, data: result.metadata });
  }
);
