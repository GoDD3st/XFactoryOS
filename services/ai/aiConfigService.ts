import { SupabaseClient } from '@supabase/supabase-js';
import {
  AIModel,
  AIFailureKind,
  AIProviderError,
  getProvider,
  isSupportedProvider,
} from './providers';
import { presentAIError } from './aiErrorMessages';
import {
  encryptCredential,
  decryptCredential,
  isCredentialStorageAvailable,
  redactSecrets,
} from './credentialCrypto';

/**
 * The global AI configuration (§3).
 *
 * One row is active for the whole installation. Every AI request resolves it at call time, so an
 * admin changing the provider takes effect on the next request with no redeploy and no frontend
 * rebuild (§21). A short in-memory cache keeps that resolution cheap and is invalidated on write.
 */

const TABLE = 'ai_provider_config';

/** Everything the frontend is allowed to see. Deliberately has no credential field at all. */
export interface AIConfigMetadata {
  provider: string | null;
  providerName: string | null;
  model: string | null;
  configured: boolean;
  status: string;
  lastValidatedAt: string | null;
  configuredBy: string | null;
  credentialHint: string | null;
  modelCapabilities: Record<string, boolean>;
  validationError: string | null;
  /** False when AI_CREDENTIAL_SECRET is missing, so the UI can explain why saving is blocked. */
  credentialStorageAvailable: boolean;
}

/**
 * Result of an activation attempt.
 *
 * Flat rather than a discriminated union on purpose: this project does not compile with
 * `strict`, and without strictNullChecks TypeScript will not narrow a `ok: true | false` union,
 * so callers would have to cast at every use. `ok` is still the field to branch on.
 */
export interface AIActivationResult {
  ok: boolean;
  /** Present when ok. */
  metadata?: AIConfigMetadata;
  /** Present when not ok - an AIFailureKind. */
  status?: string;
  /** User-facing sentence. Never the raw provider body. */
  error?: string;
  /** Raw provider text, redacted. For the collapsed "technical detail" area only. */
  technicalDetail?: string;
  /** Compatible model ids worth trying instead. */
  suggestions?: string[];
}

/** Outcome of the validation chain, with no side effects on the active configuration. */
export interface AIValidationResult {
  ok: boolean;
  kind?: AIFailureKind;
  /** User-facing sentence drawn from the presentation layer. */
  message?: string;
  title?: string;
  retryable?: boolean;
  technicalDetail?: string;
  suggestions?: string[];
  /** Capabilities of the validated model, persisted on activation. */
  capabilities?: Record<string, boolean>;
}

/**
 * Builds a failure result: normalised kind, a user-facing title/message from the presentation
 * layer, and the vendor's own words kept aside as technical detail rather than shown as the
 * primary message (§13, §19).
 */
function fail(kind: AIFailureKind, technicalDetail?: string, suggestions?: string[]): AIValidationResult {
  const presented = presentAIError(kind);
  return {
    ok: false,
    kind,
    title: presented.title,
    message: presented.message,
    retryable: presented.retryable,
    technicalDetail: technicalDetail ? redactSecrets(technicalDetail) : undefined,
    suggestions,
  };
}

/** Compatible ids worth trying instead, rolling aliases first since they track the live release. */
function suggestAlternatives(models: AIModel[], excludeId: string): string[] {
  return models
    .filter((m) => m.compatible && m.id !== excludeId)
    .sort((a, b) => {
      const aLatest = a.id.includes('latest') ? 0 : 1;
      const bLatest = b.id.includes('latest') ? 0 : 1;
      return aLatest - bLatest || a.id.localeCompare(b.id);
    })
    .slice(0, 3)
    .map((m) => m.id);
}

/** Same, but tolerant of the catalogue call itself failing - suggestions are a nicety. */
async function suggestAlternativesSafely(
  provider: { listModels(key: string): Promise<AIModel[]> },
  apiKey: string,
  excludeId: string
): Promise<string[]> {
  try {
    return suggestAlternatives(await provider.listModels(apiKey), excludeId);
  } catch {
    return [];
  }
}

/** Internal shape - carries the decrypted key and must never cross the API boundary. */
interface ResolvedConfig {
  provider: string;
  model: string;
  apiKey: string;
  source: 'database' | 'env';
}

let cache: ResolvedConfig | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 30_000;

async function db(): Promise<SupabaseClient> {
  const { getAdminClient } = await import('@/database/serverClient');
  const admin = getAdminClient();
  if (!admin) {
    throw new Error('Client admin Supabase indisponible - configuration IA inaccessible.');
  }
  return admin;
}

/**
 * There is deliberately NO environment-variable fallback for the provider credential.
 *
 * §23 allowed an env bootstrap "if appropriate"; it isn't here. The AI provider account is owned
 * and paid for by the customer's Super Admin, not by whoever deploys the code, so a key sitting
 * in a developer's .env must never become the platform's active configuration. Billing would land
 * on the wrong party, and the Settings screen would show a provider nobody in the organisation
 * chose.
 *
 * The database row written through Settings is the single source of truth. With no row, AI is
 * simply unconfigured and degrades gracefully until a Super Admin configures it.
 */

export class AIConfigService {
  /** Drops the cache so the next AI request re-reads the active row. */
  static invalidate(): void {
    cache = null;
    cacheLoadedAt = 0;
  }

  /**
   * Resolves the configuration an AI request should actually use.
   * Returns null when nothing is configured - callers degrade gracefully rather than throwing.
   */
  static async resolveActive(): Promise<ResolvedConfig | null> {
    if (cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return cache;

    try {
      const client = await db();
      const { data } = await client
        .from(TABLE)
        .select('provider, model, encrypted_credential, credential_iv, credential_tag')
        .eq('is_active', true)
        .maybeSingle();

      if (data) {
        const apiKey = decryptCredential({
          ciphertext: data.encrypted_credential,
          iv: data.credential_iv,
          tag: data.credential_tag,
        });

        if (apiKey) {
          cache = { provider: data.provider, model: data.model, apiKey, source: 'database' };
          cacheLoadedAt = Date.now();
          return cache;
        }
      }
    } catch (err) {
      // Not cached: a transient read failure should be retried on the next request rather than
      // pinning "unconfigured" for the cache lifetime.
      console.warn('[AI] Lecture de la configuration active impossible:', redactSecrets(String(err)));
    }

    return null;
  }

  /** Safe metadata for the Settings screen. Never touches credential columns beyond the hint. */
  static async getMetadata(): Promise<AIConfigMetadata> {
    const base: AIConfigMetadata = {
      provider: null,
      providerName: null,
      model: null,
      configured: false,
      status: 'NOT_CONFIGURED',
      lastValidatedAt: null,
      configuredBy: null,
      credentialHint: null,
      modelCapabilities: {},
      validationError: null,
      credentialStorageAvailable: isCredentialStorageAvailable(),
    };

    try {
      const client = await db();
      const { data } = await client
        .from(TABLE)
        .select(
          'provider, model, status, last_validated_at, credential_hint, model_capabilities, validation_error, users:configured_by(full_name)'
        )
        .eq('is_active', true)
        .maybeSingle();

      if (data) {
        return {
          ...base,
          provider: data.provider,
          providerName: getProvider(data.provider)?.name || data.provider,
          model: data.model,
          configured: true,
          status: data.status,
          lastValidatedAt: data.last_validated_at,
          configuredBy: (data as any).users?.full_name || null,
          credentialHint: data.credential_hint,
          modelCapabilities: data.model_capabilities || {},
          validationError: data.validation_error,
        };
      }
    } catch (err) {
      console.warn('[AI] Métadonnées de configuration indisponibles:', redactSecrets(String(err)));
    }

    // No active row = genuinely not configured. Nothing else can stand in for it.
    return base;
  }

  /**
   * Lists models for a provider.
   *
   * `apiKey` is optional: when omitted, the stored credential for that provider is reused so an
   * admin can browse models without re-typing the key.
   */
  static async listModels(providerId: string, apiKey?: string): Promise<AIModel[]> {
    const provider = getProvider(providerId);
    if (!provider) throw new AIProviderError('UNKNOWN', `Provider non supporté : ${providerId}.`);

    let key = apiKey;
    if (!key) {
      const active = await this.resolveActive();
      if (active?.provider === providerId) key = active.apiKey;
    }
    if (!key) {
      throw new AIProviderError(
        'INVALID_CREDENTIALS',
        'Aucun credential disponible pour ce provider. Saisissez une clé API pour lister les modèles.'
      );
    }

    return provider.listModels(key);
  }

  /**
   * Runs the full validation chain WITHOUT touching the active configuration.
   *
   * Backs both the explicit "Tester la configuration" button and the first half of activation, so
   * the two can never disagree about what "valid" means. Nothing here writes to the database.
   */
  static async testConfiguration(params: {
    providerId: string;
    model: string;
    apiKey?: string;
  }): Promise<AIValidationResult> {
    const { providerId, model } = params;

    if (!isSupportedProvider(providerId)) {
      return fail('MODEL_NOT_SUPPORTED', `Provider non supporté : ${providerId}.`);
    }
    if (!isCredentialStorageAvailable()) {
      return fail(
        'UNKNOWN',
        "AI_CREDENTIAL_SECRET n'est pas configuré côté serveur - impossible de stocker un credential de manière sécurisée."
      );
    }

    const provider = getProvider(providerId)!;

    // Reuse the stored key when the admin is only switching model on the same provider.
    let apiKey = params.apiKey;
    if (!apiKey) {
      const active = await this.resolveActive();
      if (active?.provider === providerId) apiKey = active.apiKey;
    }
    if (!apiKey) {
      return fail('INVALID_CREDENTIALS', 'Clé API requise pour ce provider.');
    }

    try {
      // 1. Credential must be genuine.
      const valid = await provider.validateApiKey(apiKey);
      if (!valid) return fail('INVALID_CREDENTIALS');

      // 2. Model must exist for this credential and pass the XFactory compatibility policy.
      const models = await provider.listModels(apiKey);
      const chosen = models.find((m) => m.id === model);

      if (!chosen) {
        return fail(
          'MODEL_UNAVAILABLE',
          `Le modèle « ${model} » n'apparaît pas dans le catalogue de ce compte.`,
          suggestAlternatives(models, model)
        );
      }

      // A specialised model (computer-use, embeddings, audio...) is rejected here rather than being
      // discovered at generation time, where the vendor's error is about quota rather than fit.
      if (!chosen.compatible) {
        return fail(
          'MODEL_NOT_SUPPORTED',
          chosen.incompatibilityReason || 'Modèle incompatible avec les capacités XFactory AI.',
          suggestAlternatives(models, model)
        );
      }

      // 3. Minimum real generation. The only step that catches a model the vendor advertises but
      //    refuses to serve - restricted previews, zero free-tier quota, region locks - none of
      //    which appear in the catalogue. Kept to 16 output tokens to stay cheap (§11).
      await provider.generate(apiKey, model, {
        systemInstruction: 'Réponds par un seul mot.',
        prompt: 'Réponds exactement : OK',
        maxOutputTokens: 16,
        temperature: 0,
      });

      return { ok: true, capabilities: chosen.capabilities as unknown as Record<string, boolean> };
    } catch (err) {
      const kind = err instanceof AIProviderError ? err.kind : 'UNKNOWN';
      const detail = redactSecrets(err instanceof Error ? err.message : String(err));

      // Alternatives are only meaningful when the model itself is the problem; a bad key or a
      // provider outage would fail identically for every model in the list.
      const suggestions =
        kind === 'MODEL_UNAVAILABLE' || kind === 'QUOTA_EXCEEDED' || kind === 'MODEL_NOT_SUPPORTED'
          ? await suggestAlternativesSafely(provider, apiKey, model)
          : [];

      return fail(kind, detail, suggestions);
    }
  }

  /**
   * Validates and, only on success, activates a new configuration (§7, §8).
   *
   * Re-runs the full validation rather than trusting an earlier "Tester" click: activation is the
   * transactional boundary, and a direct PUT must never be able to activate something unvalidated.
   * The existing active row is untouched until every check passes.
   */
  static async validateAndActivate(params: {
    providerId: string;
    model: string;
    apiKey?: string;
    userId: string;
  }): Promise<AIActivationResult> {
    const { providerId, model, userId } = params;

    const validation = await this.testConfiguration(params);
    if (!validation.ok) {
      return {
        ok: false,
        status: validation.kind,
        error: validation.message,
        technicalDetail: validation.technicalDetail,
        suggestions: validation.suggestions,
      };
    }

    // Resolve the key again for persistence - testConfiguration deliberately does not return it.
    let apiKey = params.apiKey;
    if (!apiKey) {
      const active = await this.resolveActive();
      if (active?.provider === providerId) apiKey = active.apiKey;
    }
    if (!apiKey) {
      return { ok: false, status: 'INVALID_CREDENTIALS', error: 'Clé API requise pour ce provider.' };
    }

    try {
      const chosenCapabilities = validation.capabilities || {};

      // Everything passed - now, and only now, swap the active configuration.
      const client = await db();
      const encrypted = encryptCredential(apiKey);

      // Deactivate first: the partial unique index allows only one active row, so the insert
      // would otherwise collide with the configuration currently in place.
      await client.from(TABLE).update({ is_active: false }).eq('is_active', true);

      const { error } = await client.from(TABLE).insert({
        provider: providerId,
        model,
        encrypted_credential: encrypted.ciphertext,
        credential_iv: encrypted.iv,
        credential_tag: encrypted.tag,
        credential_hint: encrypted.hint,
        status: 'CONNECTED',
        is_active: true,
        model_capabilities: chosenCapabilities,
        configured_by: userId,
        last_validated_at: new Date().toISOString(),
        validation_error: null,
      });

      if (error) throw new Error(error.message);

      this.invalidate();
      return { ok: true, metadata: await this.getMetadata() };
    } catch (err) {
      // Reaching here means persistence failed AFTER validation passed. The previous row was
      // already deactivated, so report it plainly rather than claiming nothing changed.
      const kind = err instanceof AIProviderError ? err.kind : 'UNKNOWN';
      return {
        ok: false,
        status: kind,
        error: "L'enregistrement de la configuration validée a échoué.",
        technicalDetail: redactSecrets(err instanceof Error ? err.message : String(err)),
      };
    }
  }

  /** Configuration history for the Settings panel. Credential columns are never selected. */
  static async getHistory(limit = 10): Promise<
    { provider: string; model: string; status: string; configuredBy: string | null; createdAt: string }[]
  > {
    try {
      const client = await db();
      const { data } = await client
        .from(TABLE)
        .select('provider, model, status, created_at, users:configured_by(full_name)')
        .order('created_at', { ascending: false })
        .limit(limit);

      return (data || []).map((r: any) => ({
        provider: r.provider,
        model: r.model,
        status: r.status,
        configuredBy: r.users?.full_name || null,
        createdAt: r.created_at,
      }));
    } catch {
      return [];
    }
  }
}
