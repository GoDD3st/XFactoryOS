import { AIModelCapabilities } from './providers/types';

/**
 * XFactory model compatibility policy.
 *
 * A provider's catalogue is not a menu of things this assistant can use. It also contains
 * embeddings, image/video/audio generators, speech models, realtime/live variants and
 * agentic "computer use" models - all of which are listed as generative but cannot serve the
 * assistant's capabilities (natural-language Q&A, reasoning, recommendations, occupancy and
 * anomaly analysis, report generation, structured output, long context).
 *
 * This layer replaced a prefix filter in the adapters. Broadening that filter to "anything
 * starting with gemini-" is what let a computer-use preview model become selectable, and it only
 * failed at activation with an opaque quota error - the model carries its own zero-quota tier.
 *
 * The verdict is deliberately advisory-with-teeth: unsupported models are still returned so the
 * UI can explain WHY they are unavailable, but `xfactoryCompatible` is false and the config
 * service refuses to activate them.
 */

export type ModelAvailability =
  /** Usable by the assistant. */
  | 'COMPATIBLE'
  /** In the catalogue, but the wrong kind of model for this product. */
  | 'UNSUPPORTED'
  /** Right kind of model, but this account/plan/region cannot call it. */
  | 'UNAVAILABLE';

export interface ModelCompatibilityVerdict {
  availability: ModelAvailability;
  xfactoryCompatible: boolean;
  /** Shown in the UI next to a disabled option. Absent when compatible. */
  reason?: string;
}

/**
 * Model families that exist to do something other than answer questions.
 *
 * Matched on the normalised id. Each entry carries the explanation shown to the admin, because
 * "not supported" without a reason just looks like a bug.
 */
const SPECIALIZED_FAMILIES: { match: RegExp; reason: string }[] = [
  {
    match: /computer[-_]?use/,
    reason:
      "Modèle d'usage agentique (contrôle d'interface). Il ne fournit pas les capacités de questions-réponses et d'analyse requises par l'assistant XFactory.",
  },
  {
    match: /embedding|embed-/,
    reason: "Modèle d'embeddings (vectorisation) - il ne génère pas de texte.",
  },
  {
    match: /imagen|dall-?e|image-generation|-image$/,
    reason: "Modèle de génération d'images.",
  },
  { match: /\bveo\b|video/, reason: 'Modèle de génération vidéo.' },
  {
    match: /whisper|transcribe|\btts\b|text-to-speech|speech|audio/,
    reason: 'Modèle audio (transcription ou synthèse vocale).',
  },
  {
    match: /realtime|\blive\b/,
    reason:
      'Modèle temps réel (streaming bidirectionnel). Il utilise un protocole que la couche IA XFactory n’implémente pas.',
  },
  { match: /moderation/, reason: 'Modèle de modération de contenu.' },
  { match: /\baqa\b/, reason: 'Modèle de scoring de pertinence (attributed QA).' },
  {
    match: /-instruct$|^(babbage|davinci|curie|ada)/,
    reason: 'Modèle de complétion hérité, sans interface conversationnelle.',
  },
  { match: /codex/, reason: 'Modèle spécialisé code, hors périmètre de l’assistant XFactory.' },
  {
    match: /guard|safety/,
    reason: 'Modèle de classification de sécurité, pas de génération conversationnelle.',
  },
];

/** Context window below which the serialised authorised context would be truncated. */
export const MIN_CONTEXT_WINDOW = 32000;

/**
 * Capabilities the assistant genuinely requires.
 *
 * Tool calling is deliberately NOT required: the current AI architecture builds its context
 * server-side through the retrieval layer and never lets the model call back into the platform,
 * so demanding it would exclude perfectly usable models for a feature nothing uses. Revisit if
 * the assistant ever gains tool use.
 */
export const REQUIRED_CAPABILITIES: (keyof AIModelCapabilities)[] = [
  'supportsTextGeneration',
  'supportsLongContext',
];

const CAPABILITY_LABELS: Record<string, string> = {
  supportsTextGeneration: 'génération de texte',
  supportsLongContext: `contexte long (≥ ${MIN_CONTEXT_WINDOW.toLocaleString('fr-FR')} tokens)`,
  supportsStructuredOutput: 'sortie structurée',
  supportsToolCalling: "appel d'outils",
};

function normalizeId(id: string): string {
  return (id || '').toLowerCase().replace(/^models\//, '');
}

/** True when the id belongs to a family built for something other than conversational analysis. */
export function findSpecializedFamily(id: string): { reason: string } | null {
  const normalized = normalizeId(id);
  const hit = SPECIALIZED_FAMILIES.find((f) => f.match.test(normalized));
  return hit ? { reason: hit.reason } : null;
}

/**
 * The single place that decides whether a model may drive XFactory AI.
 *
 * `deprecated` lets an adapter pass through a vendor signal (e.g. a description saying the model
 * is closed to new accounts) so the verdict can be UNAVAILABLE rather than UNSUPPORTED - a
 * meaningful difference: unsupported is permanent, unavailable may change with the account.
 */
export function assessModel(params: {
  id: string;
  capabilities: AIModelCapabilities;
  deprecated?: boolean;
}): ModelCompatibilityVerdict {
  const specialized = findSpecializedFamily(params.id);
  if (specialized) {
    return { availability: 'UNSUPPORTED', xfactoryCompatible: false, reason: specialized.reason };
  }

  const missing = REQUIRED_CAPABILITIES.filter((c) => !params.capabilities[c]);
  if (missing.length > 0) {
    return {
      availability: 'UNSUPPORTED',
      xfactoryCompatible: false,
      reason: `Capacités manquantes : ${missing.map((m) => CAPABILITY_LABELS[m] || m).join(', ')}.`,
    };
  }

  if (params.deprecated) {
    return {
      availability: 'UNAVAILABLE',
      xfactoryCompatible: false,
      reason:
        "Le fournisseur signale ce modèle comme retiré ou réservé aux comptes existants. Il peut redevenir disponible selon votre compte.",
    };
  }

  return { availability: 'COMPATIBLE', xfactoryCompatible: true };
}
