import {
  AIProvider,
  AIModel,
  AIGenerateRequest,
  AIGenerateResponse,
  AIProviderError,
  classifyHttpStatus,
  classifyProviderError,
  extractProviderErrorMessage,
  providerFetch,
} from './types';
import { redactSecrets } from '../credentialCrypto';
import { assessModel, MIN_CONTEXT_WINDOW } from '../modelCompatibility';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Which ids belong to the Gemini conversational line at all. Everything past this gate is judged
 * by the shared compatibility registry (services/ai/modelCompatibility.ts), which is what decides
 * whether a model may actually drive XFactory AI.
 */
function isGeminiFamily(id: string): boolean {
  return id.startsWith('gemini-');
}

/**
 * Vendor deprecation signal.
 *
 * Google keeps models in /models after closing them to new accounts, marking that only in the
 * free-text description. Detecting it turns an opaque activation failure into an up-front
 * "unavailable" badge in the dropdown.
 */
function looksDeprecated(raw: any): boolean {
  const text = `${raw?.description || ''} ${raw?.displayName || ''}`.toLowerCase();
  return (
    text.includes('no longer available') ||
    text.includes('deprecated') ||
    text.includes('discontinued') ||
    text.includes('retired')
  );
}

/**
 * The credential goes in the header, never the query string.
 *
 * `?key=` would place the secret in the request URL, where it lands in proxy logs and any error
 * surface that echoes the URL back. x-goog-api-key is equivalent to Google but keeps the key out
 * of the line that gets logged.
 */
function authHeaders(apiKey: string): Record<string, string> {
  return { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' };
}

function toModel(raw: any): AIModel {
  // Vendor returns "models/gemini-2.0-flash"; the generate call wants the bare id.
  const id = String(raw?.name || '').replace(/^models\//, '');
  const contextWindow = Number(raw?.inputTokenLimit) || 0;
  const methods: string[] = raw?.supportedGenerationMethods || [];

  const capabilities = {
    supportsTextGeneration: methods.includes('generateContent'),
    supportsStructuredOutput: true,
    supportsToolCalling: !id.includes('flash-lite'),
    supportsLongContext: contextWindow >= MIN_CONTEXT_WINDOW,
  };

  const verdict = assessModel({ id, capabilities, deprecated: looksDeprecated(raw) });

  return {
    id,
    name: raw?.displayName || id,
    description: raw?.description,
    contextWindow: contextWindow || undefined,
    capabilities,
    compatible: verdict.xfactoryCompatible,
    availability: verdict.availability,
    incompatibilityReason: verdict.reason,
  };
}

export const geminiProvider: AIProvider = {
  id: 'gemini',
  name: 'Google Gemini',
  credentialHelpUrl: 'https://aistudio.google.com/app/apikey',

  async validateApiKey(apiKey: string): Promise<boolean> {
    const res = await providerFetch(`${BASE}/models`, { headers: authHeaders(apiKey) });
    if (res.status === 400 || res.status === 401 || res.status === 403) return false;
    if (!res.ok) {
      throw new AIProviderError(classifyHttpStatus(res.status), `Gemini a renvoyé ${res.status}.`);
    }
    return true;
  },

  async listModels(apiKey: string): Promise<AIModel[]> {
    const res = await providerFetch(`${BASE}/models?pageSize=200`, { headers: authHeaders(apiKey) });
    if (!res.ok) {
      throw new AIProviderError(
        classifyHttpStatus(res.status),
        `Impossible de récupérer les modèles Gemini (${res.status}).`
      );
    }

    const body: any = await res.json();
    return (body?.models || [])
      .map(toModel)
      .filter((m: AIModel) => isGeminiFamily(m.id))
      // Models with no generateContent support at all are dropped rather than listed as
      // unsupported - there are dozens and they would bury the usable options.
      .filter((m: AIModel) => m.capabilities.supportsTextGeneration)
      // Compatible first, then unsupported/unavailable, so the usable choices are at the top.
      .sort((a: AIModel, b: AIModel) => {
        if (a.compatible !== b.compatible) return a.compatible ? -1 : 1;
        return a.id.localeCompare(b.id);
      });
  },

  async generate(apiKey, model, request: AIGenerateRequest): Promise<AIGenerateResponse> {
    const res = await providerFetch(
      `${BASE}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
          generationConfig: {
            temperature: request.temperature ?? 0.3,
            maxOutputTokens: request.maxOutputTokens ?? 600,
          },
        }),
      },
      30000
    );

    if (!res.ok) {
      const rawBody = await res.text().catch(() => '');
      const detail = redactSecrets(extractProviderErrorMessage(rawBody));
      throw new AIProviderError(
        classifyProviderError(res.status, rawBody),
        detail || `Gemini ${res.status}.`
      );
    }

    const body: any = await res.json();
    const text = body?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).join('') || '';
    if (!text) throw new AIProviderError('UNKNOWN', 'Réponse vide du modèle Gemini.');

    return {
      text,
      usage: {
        inputTokens: body?.usageMetadata?.promptTokenCount,
        outputTokens: body?.usageMetadata?.candidatesTokenCount,
      },
    };
  },
};
