import { AIConfigService } from './aiConfigService';
import { getProvider, AIProviderError, AIGenerateResponse } from './providers';
import { redactSecrets } from './credentialCrypto';

/**
 * The one entry point every AI feature uses (§9).
 *
 * Callers describe the task; this resolves the globally-configured provider and model at request
 * time and dispatches. No feature imports a vendor SDK, so changing provider in Settings changes
 * every capability at once with no code change.
 */

export class AIUnavailableError extends Error {
  kind: string;
  constructor(kind: string, message: string) {
    super(message);
    this.name = 'AIUnavailableError';
    this.kind = kind;
  }
}

export interface AIGenerateParams {
  systemInstruction: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AIGenerateResult extends AIGenerateResponse {
  provider: string;
  model: string;
}

export class AIService {
  /**
   * Runs a generation against the active configuration.
   *
   * Throws AIUnavailableError on any failure - never falls back to another provider (§13). A
   * silent switch would make behaviour unpredictable and could route data to a vendor the
   * organisation did not approve for it. Callers are expected to degrade gracefully.
   */
  static async generate(params: AIGenerateParams): Promise<AIGenerateResult> {
    const config = await AIConfigService.resolveActive();

    if (!config) {
      throw new AIUnavailableError(
        'NOT_CONFIGURED',
        "Aucune configuration IA active. Un Admin doit en définir une dans Paramètres → Configuration IA."
      );
    }

    const provider = getProvider(config.provider);
    if (!provider) {
      throw new AIUnavailableError(
        'PROVIDER_UNAVAILABLE',
        `Le provider configuré (${config.provider}) n'est plus supporté par cette version.`
      );
    }

    try {
      const response = await provider.generate(config.apiKey, config.model, {
        systemInstruction: params.systemInstruction,
        prompt: params.prompt,
        temperature: params.temperature,
        maxOutputTokens: params.maxOutputTokens,
      });
      return { ...response, provider: config.provider, model: config.model };
    } catch (err) {
      const kind = err instanceof AIProviderError ? err.kind : 'UNKNOWN';
      // redactSecrets because provider SDKs routinely echo the credential inside error bodies,
      // and this message reaches logs.
      throw new AIUnavailableError(
        kind,
        redactSecrets(err instanceof Error ? err.message : String(err))
      );
    }
  }

  /** Whether AI is usable at all, for UI affordances. Never throws. */
  static async isAvailable(): Promise<boolean> {
    try {
      return (await AIConfigService.resolveActive()) !== null;
    } catch {
      return false;
    }
  }
}
