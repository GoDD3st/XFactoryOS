/**
 * Provider-agnostic contract for the model execution layer.
 *
 * Nothing above this file knows which vendor is configured. The AI assistant calls
 * `aiService.generate(...)`; the service resolves the active configuration and dispatches to
 * whichever adapter implements this interface. Swapping OpenAI for Gemini is a settings change,
 * not a code change.
 */

export type AIProviderId = 'openai' | 'gemini' | 'anthropic';

/** What XFactory needs a model to be able to do. */
export interface AIModelCapabilities {
  supportsTextGeneration: boolean;
  supportsStructuredOutput: boolean;
  supportsToolCalling: boolean;
  supportsLongContext: boolean;
}

export interface AIModel {
  /** Provider-side identifier passed back on generate, e.g. "gpt-4o-mini". */
  id: string;
  /** Human label for the settings dropdown. */
  name: string;
  description?: string;
  contextWindow?: number;
  capabilities: AIModelCapabilities;
  /**
   * False when the model cannot support the assistant's required capabilities. Surfaced in the
   * UI as a disabled option rather than hidden, so an admin can see WHY a model is unavailable.
   */
  compatible: boolean;
  /** COMPATIBLE / UNSUPPORTED / UNAVAILABLE - drives the badge next to the option. */
  availability?: 'COMPATIBLE' | 'UNSUPPORTED' | 'UNAVAILABLE';
  incompatibilityReason?: string;
}

export interface AIGenerateRequest {
  /** System-level behavioural rules. Built by the prompt policy layer, never by the caller. */
  systemInstruction: string;
  /** The authorised context plus user question, already scoped by the role policy. */
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AIGenerateResponse {
  text: string;
  /** Provider-reported token usage when available; used for audit, never for billing logic. */
  usage?: { inputTokens?: number; outputTokens?: number };
}

/**
 * Normalised failure taxonomy. Every provider error is mapped onto exactly one of these before it
 * leaves the adapter, so nothing above this layer parses vendor-specific strings.
 *
 * QUOTA_EXCEEDED and RATE_LIMITED are separate on purpose even though both arrive as HTTP 429:
 * a rate limit clears on its own in seconds, whereas an exhausted (or zero) quota needs an admin
 * to change plan or pick a different model. Telling a user to "retry shortly" when their quota is
 * structurally zero sends them into a loop that can never succeed.
 */
export type AIFailureKind =
  | 'INVALID_CREDENTIALS'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'MODEL_UNAVAILABLE'
  | 'MODEL_NOT_SUPPORTED'
  | 'PROVIDER_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

export class AIProviderError extends Error {
  kind: AIFailureKind;
  constructor(kind: AIFailureKind, message: string) {
    super(message);
    this.name = 'AIProviderError';
    this.kind = kind;
  }
}

export interface AIProvider {
  id: AIProviderId;
  name: string;
  /** Where an admin obtains a key, shown as help text in Settings. */
  credentialHelpUrl: string;
  /** Cheap round-trip that proves the credential works, without generating anything. */
  validateApiKey(apiKey: string): Promise<boolean>;
  /** Live model list from the vendor, already mapped through the approval policy. */
  listModels(apiKey: string): Promise<AIModel[]>;
  generate(apiKey: string, model: string, request: AIGenerateRequest): Promise<AIGenerateResponse>;
}

// Capability requirements and the compatibility verdict now live in
// services/ai/modelCompatibility.ts, which also knows about specialised model families. Keeping a
// second capability check here would let the two disagree about what "compatible" means.

/** Shared fetch wrapper: bounded timeout so a hanging vendor never holds an XFactory request. */
export async function providerFetch(
  url: string,
  init: RequestInit,
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new AIProviderError('TIMEOUT', 'Le provider IA n’a pas répondu dans le délai imparti.');
    }
    // A transport failure is a network problem, distinct from the vendor answering with an error.
    throw new AIProviderError('NETWORK_ERROR', 'Le provider IA est injoignable depuis le serveur.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pulls the human-readable sentence out of a provider error body.
 *
 * All three vendors wrap the useful text in JSON of a different shape, so dumping the raw body
 * into the UI produced a truncated `{ "error": { "code": 404, "message": "This model...` with the
 * actual explanation cut off mid-word. Falls back to the raw text when the shape is unfamiliar.
 */
export function extractProviderErrorMessage(bodyText: string): string {
  if (!bodyText) return '';
  try {
    const parsed: any = JSON.parse(bodyText);
    const message =
      parsed?.error?.message ?? // OpenAI + Gemini
      parsed?.error?.[0]?.message ??
      parsed?.message ?? // Anthropic surfaces {type, message}
      parsed?.error?.type;
    if (typeof message === 'string' && message.trim()) return message.trim();
  } catch {
    /* not JSON - fall through to the raw text */
  }
  return bodyText.trim();
}

/** Maps an HTTP status alone onto the taxonomy. Prefer classifyProviderError when a body exists. */
export function classifyHttpStatus(status: number): AIFailureKind {
  if (status === 401 || status === 403) return 'INVALID_CREDENTIALS';
  if (status === 404) return 'MODEL_UNAVAILABLE';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'PROVIDER_UNAVAILABLE';
  return 'UNKNOWN';
}

/**
 * Classifies using the status AND the response body.
 *
 * Status alone is not enough. Gemini returns 429 both for genuine throttling and for
 * "Quota exceeded for metric: ...generate_content_free_tier_input_token_count, limit: 0", which
 * means the selected model has no free-tier allowance at all. The first clears by waiting; the
 * second never does. Classifying both as RATE_LIMITED told admins to retry a configuration that
 * could not succeed.
 *
 * A 403 whose body talks about quota is likewise a billing problem, not a bad key - reporting it
 * as INVALID_CREDENTIALS would send someone to regenerate a key that was fine.
 */
export function classifyProviderError(status: number, bodyText: string): AIFailureKind {
  const body = (bodyText || '').toLowerCase();

  const mentionsQuota =
    body.includes('quota') ||
    body.includes('billing') ||
    body.includes('insufficient_quota') ||
    body.includes('resource_exhausted') ||
    body.includes('exceeded your current quota');

  // "limit: 0" / free-tier metrics are structural, not transient.
  const isHardQuota =
    mentionsQuota &&
    (body.includes('limit: 0') ||
      body.includes('free_tier') ||
      body.includes('billing') ||
      body.includes('insufficient_quota'));

  if (status === 429) return isHardQuota || mentionsQuota ? 'QUOTA_EXCEEDED' : 'RATE_LIMITED';
  if (status === 403 && mentionsQuota) return 'QUOTA_EXCEEDED';
  if (status === 400 && mentionsQuota) return 'QUOTA_EXCEEDED';

  // Some vendors answer 400 for an unknown/unsupported model rather than 404.
  if ((status === 400 || status === 404) && (body.includes('model') || body.includes('not found'))) {
    return 'MODEL_UNAVAILABLE';
  }

  return classifyHttpStatus(status);
}
