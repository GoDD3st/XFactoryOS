import { AIProvider, AIProviderId } from './types';
import { openaiProvider } from './openaiProvider';
import { geminiProvider } from './geminiProvider';
import { anthropicProvider } from './anthropicProvider';

/**
 * Closed registry of approved providers (§2).
 *
 * Adding a vendor means adding an adapter and one entry here - nothing else in XFactory changes,
 * because every caller goes through aiService. An id absent from this map can never be
 * configured: the config service rejects it before any credential is stored, so an arbitrary
 * provider cannot be injected through the API.
 */
const REGISTRY: Record<AIProviderId, AIProvider> = {
  openai: openaiProvider,
  gemini: geminiProvider,
  anthropic: anthropicProvider,
};

export function getProvider(id: string): AIProvider | null {
  return (REGISTRY as Record<string, AIProvider>)[id] ?? null;
}

export function isSupportedProvider(id: string): id is AIProviderId {
  return id in REGISTRY;
}

/** Safe metadata for the Settings dropdown - no credentials, no vendor internals. */
export function listSupportedProviders(): { id: AIProviderId; name: string; credentialHelpUrl: string }[] {
  return Object.values(REGISTRY).map((p) => ({
    id: p.id,
    name: p.name,
    credentialHelpUrl: p.credentialHelpUrl,
  }));
}

export * from './types';
