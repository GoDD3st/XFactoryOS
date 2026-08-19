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

const BASE = 'https://api.openai.com/v1';

/**
 * Model approval policy.
 *
 * The vendor's /models endpoint returns embeddings, audio, moderation and image models alongside
 * the chat ones. §5 requires filtering against an internal policy rather than exposing everything
 * the provider returns.
 *
 * Chat families are matched by shape (`gpt-*`, `o1`/`o3`/`o4`... reasoning models) rather than a
 * pinned version list, so a newly released generation appears without a code change - a pinned
 * list silently hides the models an account is entitled to as older ones get retired.
 */
function isChatFamily(id: string): boolean {
  return id.startsWith('gpt-') || /^o\d/.test(id);
}

const CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4.1': 1047576,
  'gpt-4.1-mini': 1047576,
  'gpt-4-turbo': 128000,
  o3: 200000,
  'o4-mini': 200000,
};

function contextWindowFor(id: string): number {
  const exact = CONTEXT_WINDOWS[id];
  if (exact) return exact;
  const prefix = Object.keys(CONTEXT_WINDOWS).find((k) => id.startsWith(k));
  return prefix ? CONTEXT_WINDOWS[prefix] : 8192;
}

function toModel(id: string): AIModel {
  const contextWindow = contextWindowFor(id);
  const capabilities = {
    supportsTextGeneration: true,
    supportsStructuredOutput: true,
    supportsToolCalling: true,
    // The assistant serialises the whole authorised context as JSON into the prompt, so a small
    // window would truncate it and silently degrade answers.
    supportsLongContext: contextWindow >= MIN_CONTEXT_WINDOW,
  };

  const verdict = assessModel({ id, capabilities });

  return {
    id,
    name: id,
    contextWindow,
    capabilities,
    compatible: verdict.xfactoryCompatible,
    availability: verdict.availability,
    incompatibilityReason: verdict.reason,
  };
}

export const openaiProvider: AIProvider = {
  id: 'openai',
  name: 'OpenAI',
  credentialHelpUrl: 'https://platform.openai.com/api-keys',

  async validateApiKey(apiKey: string): Promise<boolean> {
    const res = await providerFetch(`${BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401 || res.status === 403) return false;
    if (!res.ok) {
      throw new AIProviderError(classifyHttpStatus(res.status), `OpenAI a renvoyé ${res.status}.`);
    }
    return true;
  },

  async listModels(apiKey: string): Promise<AIModel[]> {
    const res = await providerFetch(`${BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      throw new AIProviderError(
        classifyHttpStatus(res.status),
        `Impossible de récupérer les modèles OpenAI (${res.status}).`
      );
    }

    const body: any = await res.json();
    const ids: string[] = (body?.data || []).map((m: any) => m.id).filter(Boolean);

    return ids
      .filter(isChatFamily)
      // Dated snapshots (gpt-4o-2024-05-13) add noise without adding choice; keep the aliases.
      .filter((id) => !/-\d{4}-\d{2}-\d{2}$/.test(id))
      .sort()
      .map(toModel)
      // Specialised families (audio, realtime, image, computer-use...) are judged by the shared
      // registry and kept in the list as disabled options with an explanation.
      .sort((a, b) => (a.compatible === b.compatible ? 0 : a.compatible ? -1 : 1));
  },

  async generate(apiKey, model, request: AIGenerateRequest): Promise<AIGenerateResponse> {
    const res = await providerFetch(
      `${BASE}/chat/completions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: request.systemInstruction },
            { role: 'user', content: request.prompt },
          ],
          temperature: request.temperature ?? 0.3,
          max_completion_tokens: request.maxOutputTokens ?? 600,
        }),
      },
      30000
    );

    if (!res.ok) {
      const rawBody = await res.text().catch(() => '');
      const detail = redactSecrets(extractProviderErrorMessage(rawBody));
      throw new AIProviderError(
        classifyProviderError(res.status, rawBody),
        detail || `OpenAI ${res.status}.`
      );
    }

    const body: any = await res.json();
    const text = body?.choices?.[0]?.message?.content;
    if (!text) throw new AIProviderError('UNKNOWN', 'Réponse vide du modèle OpenAI.');

    return {
      text,
      usage: {
        inputTokens: body?.usage?.prompt_tokens,
        outputTokens: body?.usage?.completion_tokens,
      },
    };
  },
};
