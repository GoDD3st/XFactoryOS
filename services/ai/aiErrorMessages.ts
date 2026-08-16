import { AIFailureKind } from './providers/types';

/**
 * Provider-independent presentation of AI failures.
 *
 * The raw vendor error is useful to an administrator debugging a configuration, but it is not an
 * interface: dumping "Quota exceeded for metric: generativelanguage.googleapis.com/..." as the
 * primary message tells the reader nothing about what to do next. Each kind maps to a title, an
 * actionable sentence, and whether retrying could plausibly help.
 *
 * The vendor's own text is still returned alongside, as a secondary technical detail the UI keeps
 * collapsed - the failure is explained, not hidden (§19).
 */

export interface AIErrorPresentation {
  title: string;
  message: string;
  /** False when retrying the identical configuration cannot succeed without an admin change. */
  retryable: boolean;
}

const PRESENTATIONS: Record<AIFailureKind, AIErrorPresentation> = {
  INVALID_CREDENTIALS: {
    title: 'Identifiant API invalide',
    message:
      "Le fournisseur a rejeté la clé configurée. Vérifiez la clé API et réessayez.",
    retryable: false,
  },
  QUOTA_EXCEEDED: {
    title: 'Quota IA dépassé',
    message:
      "Le modèle sélectionné ne peut pas être utilisé avec le quota actuel du fournisseur. " +
      "Choisissez un autre modèle compatible, ou vérifiez l'utilisation et la facturation de votre compte fournisseur.",
    retryable: false,
  },
  RATE_LIMITED: {
    title: 'Limite de débit atteinte',
    message: "Le fournisseur a temporairement limité les requêtes. Réessayez dans quelques instants.",
    retryable: true,
  },
  MODEL_UNAVAILABLE: {
    title: 'Modèle indisponible',
    message:
      "Le modèle sélectionné n'est pas disponible pour cette configuration d'API. Sélectionnez un autre modèle compatible.",
    retryable: false,
  },
  MODEL_NOT_SUPPORTED: {
    title: 'Modèle non supporté',
    message: "Ce modèle n'est pas compatible avec l'assistant XFactory AI.",
    retryable: false,
  },
  PROVIDER_UNAVAILABLE: {
    title: 'Fournisseur IA indisponible',
    message:
      "Le fournisseur n'a pas pu être contacté. La configuration IA actuelle de XFactory reste active.",
    retryable: true,
  },
  NETWORK_ERROR: {
    title: 'Erreur réseau',
    message:
      "Le serveur XFactory n'a pas pu joindre le fournisseur. Vérifiez la connectivité sortante, puis réessayez.",
    retryable: true,
  },
  TIMEOUT: {
    title: 'Délai dépassé',
    message: "Le fournisseur n'a pas répondu dans le délai imparti. Réessayez dans quelques instants.",
    retryable: true,
  },
  UNKNOWN: {
    title: 'Échec de la validation',
    message:
      "La configuration n'a pas pu être validée. Consultez le détail technique ci-dessous.",
    retryable: true,
  },
};

export function presentAIError(kind: AIFailureKind): AIErrorPresentation {
  return PRESENTATIONS[kind] || PRESENTATIONS.UNKNOWN;
}

/** Constant appended to every activation failure - the safety guarantee users need to read. */
export const CONFIG_UNCHANGED_NOTICE =
  "La configuration IA actuellement active reste inchangée.";
