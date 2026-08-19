import { supabase } from '@/database/client';
import { isDemoMode } from '@/frontend/src/modules/auth/utils/demoMode';

/**
 * Client for the global AI configuration.
 *
 * The API key travels one way only: it is sent on validate/activate and never comes back. There
 * is deliberately no field for it on AIConfigMetadata, so it cannot be rendered or persisted
 * client-side even by accident.
 */

async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extra };
  if (!isDemoMode()) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export interface AIProviderOption {
  id: string;
  name: string;
  credentialHelpUrl: string;
}

export interface AIModelOption {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
  capabilities: Record<string, boolean>;
  compatible: boolean;
  availability?: 'COMPATIBLE' | 'UNSUPPORTED' | 'UNAVAILABLE';
  incompatibilityReason?: string;
}

/** Verdict from the test endpoint. Carries no credential and never activates anything. */
export interface AIValidationResult {
  ok: boolean;
  kind?: string;
  title?: string;
  message?: string;
  retryable?: boolean;
  technicalDetail?: string;
  suggestions?: string[];
}

/** Structured activation failure, so the UI can separate the message from the raw detail. */
export class AIActivationError extends Error {
  kind: string;
  technicalDetail?: string;
  suggestions: string[];
  unchangedNotice?: string;

  constructor(params: {
    message: string;
    kind?: string;
    technicalDetail?: string;
    suggestions?: string[];
    unchangedNotice?: string;
  }) {
    super(params.message);
    this.name = 'AIActivationError';
    this.kind = params.kind || 'UNKNOWN';
    this.technicalDetail = params.technicalDetail;
    this.suggestions = params.suggestions || [];
    this.unchangedNotice = params.unchangedNotice;
  }
}

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
  credentialStorageAvailable: boolean;
}

export async function apiFetchAIProviders(): Promise<AIProviderOption[]> {
  const res = await fetch('/api/ai-config/providers', { headers: await authHeaders() });
  if (!res.ok) return [];
  return (await res.json()).data || [];
}

/**
 * Throws on a failed fetch rather than returning null.
 *
 * Returning null made "the API is unreachable" indistinguishable from "nothing is configured
 * yet", and the panel rendered the far more alarming (and wrong) "AI_CREDENTIAL_SECRET is not
 * set" for a plain 404 from a server that had not been restarted.
 */
export async function apiFetchAIConfig(): Promise<AIConfigMetadata> {
  const res = await fetch('/api/ai-config', { headers: await authHeaders() });
  if (res.status === 404) {
    throw new Error(
      "L'API de configuration IA est introuvable (404). Redémarrez le serveur de développement pour charger les nouvelles routes."
    );
  }
  if (res.status === 403) {
    throw new Error("Votre rôle n'est pas autorisé à consulter la configuration IA.");
  }
  if (!res.ok) {
    throw new Error(`La configuration IA n'a pas pu être chargée (HTTP ${res.status}).`);
  }
  return (await res.json()).data;
}

export async function apiFetchAIModels(provider: string, apiKey?: string): Promise<AIModelOption[]> {
  const res = await fetch('/api/ai-config/models', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ provider, ...(apiKey ? { api_key: apiKey } : {}) }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Impossible de récupérer les modèles.');
  return body.data || [];
}

/** Validates a candidate configuration without changing the active one. */
export async function apiTestAIConfig(payload: {
  provider: string;
  model: string;
  apiKey?: string;
}): Promise<AIValidationResult> {
  const res = await fetch('/api/ai-config/test', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      provider: payload.provider,
      model: payload.model,
      ...(payload.apiKey ? { api_key: payload.apiKey } : {}),
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, kind: 'UNKNOWN', title: 'Test impossible', message: body.error || 'Le test a échoué.' };
  }
  return body.data;
}

export async function apiActivateAIConfig(payload: {
  provider: string;
  model: string;
  apiKey?: string;
}): Promise<AIConfigMetadata> {
  const res = await fetch('/api/ai-config', {
    method: 'PUT',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      provider: payload.provider,
      model: payload.model,
      ...(payload.apiKey ? { api_key: payload.apiKey } : {}),
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Structured rather than a concatenated string, so the panel can render the actionable
    // sentence prominently and keep the vendor's raw text collapsed.
    throw new AIActivationError({
      message: body.error || "Échec de l'activation.",
      kind: body.status,
      technicalDetail: body.technicalDetail,
      suggestions: body.suggestions,
      unchangedNotice: body.message,
    });
  }
  return body.data;
}

export interface AIConfigHistoryEntry {
  provider: string;
  model: string;
  status: string;
  configuredBy: string | null;
  createdAt: string;
}

export async function apiFetchAIConfigHistory(): Promise<AIConfigHistoryEntry[]> {
  const res = await fetch('/api/ai-config/history', { headers: await authHeaders() });
  if (!res.ok) return [];
  return (await res.json()).data || [];
}
