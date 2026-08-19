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
import { assessModel } from '../modelCompatibility';

const BASE = 'https://api.anthropic.com/v1';
const API_VERSION = '2023-06-01';

function authHeaders(apiKey: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
    'Content-Type': 'application/json',
  };
}

function toModel(raw: any): AIModel {
  const id = String(raw?.id || '');
  // Every current Claude model carries a 200k window; the vendor list does not report it.
  const contextWindow = 200000;

  const capabilities = {
    supportsTextGeneration: true,
    supportsStructuredOutput: true,
    supportsToolCalling: true,
    supportsLongContext: true,
  };

  const verdict = assessModel({ id, capabilities });

  return {
    id,
    name: raw?.display_name || id,
    contextWindow,
    capabilities,
    compatible: verdict.xfactoryCompatible,
    availability: verdict.availability,
    incompatibilityReason: verdict.reason,
  };
}

export const anthropicProvider: AIProvider = {
  id: 'anthropic',
  name: 'Anthropic',
  credentialHelpUrl: 'https://console.anthropic.com/settings/keys',

  async validateApiKey(apiKey: string): Promise<boolean> {
    const res = await providerFetch(`${BASE}/models`, { headers: authHeaders(apiKey) });
    if (res.status === 401 || res.status === 403) return false;
    if (!res.ok) {
      throw new AIProviderError(classifyHttpStatus(res.status), `Anthropic a renvoyé ${res.status}.`);
    }
    return true;
  },

  async listModels(apiKey: string): Promise<AIModel[]> {
    const res = await providerFetch(`${BASE}/models?limit=100`, { headers: authHeaders(apiKey) });
    if (!res.ok) {
      throw new AIProviderError(
        classifyHttpStatus(res.status),
        `Impossible de récupérer les modèles Anthropic (${res.status}).`
      );
    }

    const body: any = await res.json();
    return (body?.data || [])
      .map(toModel)
      .filter((m: AIModel) => m.id.startsWith('claude-'))
      .sort((a: AIModel, b: AIModel) => {
        if (a.compatible !== b.compatible) return a.compatible ? -1 : 1;
        return a.id.localeCompare(b.id);
      });
  },

  async generate(apiKey, model, request: AIGenerateRequest): Promise<AIGenerateResponse> {
    const res = await providerFetch(
      `${BASE}/messages`,
      {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify({
          model,
          // Anthropic takes the system prompt as a top-level field, not a message role.
          system: request.systemInstruction,
          messages: [{ role: 'user', content: request.prompt }],
          temperature: request.temperature ?? 0.3,
          max_tokens: request.maxOutputTokens ?? 600,
        }),
      },
      30000
    );

    if (!res.ok) {
      const rawBody = await res.text().catch(() => '');
      const detail = redactSecrets(extractProviderErrorMessage(rawBody));
      throw new AIProviderError(
        classifyProviderError(res.status, rawBody),
        detail || `Anthropic ${res.status}.`
      );
    }

    const body: any = await res.json();
    const text = (body?.content || []).map((c: any) => c?.text).filter(Boolean).join('');
    if (!text) throw new AIProviderError('UNKNOWN', 'Réponse vide du modèle Anthropic.');

    return {
      text,
      usage: {
        inputTokens: body?.usage?.input_tokens,
        outputTokens: body?.usage?.output_tokens,
      },
    };
  },
};
