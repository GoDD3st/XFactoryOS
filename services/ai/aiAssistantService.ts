import { AIAssistantMessage, UserRole } from '@/frontend/src/types';
import { WorkstationRepository } from '@/database/repositories/workstationRepository';
import { ReservationRepository } from '@/database/repositories/reservationRepository';
import { AIInteractionRepository } from '@/database/repositories/aiInteractionRepository';
import { SettingsRepository } from '@/database/repositories/settingsRepository';
import { AIService, AIUnavailableError } from './aiService';
import {
  authorizeAIRequest,
  getRolePolicy,
  buildRolePromptPolicy,
  AIRolePolicy,
  AICapability,
} from './aiRolePolicy';

/**
 * Builds the ONLY factual context the model is allowed to draw on (SRS §22.5: "L'assistant ne
 * doit répondre qu'à partir des données autorisées par le rôle" / "ne doit pas exposer des
 * données nominatives sensibles").
 *
 * Scoping happens HERE, at retrieval, not in the prompt. Data a role may not see is never
 * assembled, so it cannot leak through a jailbreak - the model is never given it to begin with.
 * This replaces an earlier binary `isPrivileged` flag that split ten roles into two buckets.
 */
async function buildAIContext(policy: AIRolePolicy, userId?: string) {
  const [wsMap, clusters, reservations, settings] = await Promise.all([
    WorkstationRepository.getWorkstations(),
    WorkstationRepository.getClusters(),
    ReservationRepository.getAllReservations(),
    SettingsRepository.getSettings(),
  ]);

  const seenIds = new Set<string>();
  const allWorkstations = Object.values(wsMap)
    .flat()
    .filter((w) => (seenIds.has(w.id) ? false : (seenIds.add(w.id), true)));

  const totalDesks = allWorkstations.length;
  const occupied = allWorkstations.filter((w) => w.status === 'occupé').length;
  const reserved = allWorkstations.filter((w) => w.status === 'réservé').length;
  const maintenance = allWorkstations.filter((w) => w.status === 'maintenance').length;
  const managementLocked = allWorkstations.filter((w) => w.status === 'management_reserved').length;
  const available = Math.max(0, totalDesks - occupied - reserved - maintenance - managementLocked);
  const occupancyRate = totalDesks > 0 ? Math.round(((occupied + reserved) / totalDesks) * 100) : 0;

  const perCluster = clusters.map((c) => {
    const seats = allWorkstations.filter((w) => w.cluster_id === c.id || w.cluster_id === c.code?.toLowerCase());
    return {
      code: c.code,
      name: c.name,
      managementOnly: c.is_management_only,
      totalDesks: seats.length,
      available: seats.filter((w) => w.status === 'disponible').length,
      occupied: seats.filter((w) => w.status === 'occupé' || w.status === 'réservé').length,
    };
  });

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];

  const noShowsToday = reservations.filter((r) => r.status === 'no-show' && r.reservation_date === todayStr).length;
  const noShowsThisWeek = reservations.filter((r) => r.status === 'no-show' && r.reservation_date >= weekAgo).length;

  const hourBuckets: Record<number, number> = {};
  reservations
    .filter((r) => r.reservation_date >= weekAgo && ['confirmée', 'check-in', 'terminée'].includes(r.status))
    .forEach((r) => {
      const hour = parseInt((r.start_time || '08:00').split(':')[0], 10);
      hourBuckets[hour] = (hourBuckets[hour] || 0) + 1;
    });
  const peakHour = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1])[0]?.[0];

  // Aggregate floor state is operational, not nominative - every role that may use the assistant
  // gets it. What varies below is the person-level detail.
  const base = {
    site: 'Site de Safi - XFactory Open Space',
    date_du_jour: todayStr,
    total_postes: totalDesks,
    postes_disponibles: available,
    postes_occupes: occupied,
    postes_reserves: reserved,
    postes_en_maintenance: maintenance,
    postes_cluster_management_verrouilles: managementLocked,
    taux_occupation_pourcent: occupancyRate,
    clusters: perCluster,
  };

  // 'self' roles get their OWN reservations and nothing about anyone else. This is what makes
  // "which employee has the most no-shows?" unanswerable for a collaborator: the data required to
  // answer it is never retrieved.
  if (policy.dataScope === 'self') {
    const mine = userId ? reservations.filter((r) => r.user_id === userId) : [];
    return {
      ...base,
      mes_reservations: mine.slice(0, 20).map((r) => ({
        poste: r.workstation_code,
        cluster: r.cluster_name,
        date: r.reservation_date,
        debut: r.start_time,
        fin: r.end_time,
        statut: r.status,
      })),
      mes_habitudes: {
        total_reservations: mine.length,
        cluster_prefere:
          Object.entries(
            mine.reduce<Record<string, number>>((acc, r) => {
              if (r.cluster_name) acc[r.cluster_name] = (acc[r.cluster_name] || 0) + 1;
              return acc;
            }, {})
          ).sort((a, b) => b[1] - a[1])[0]?.[0] || 'donnée insuffisante',
      },
    };
  }

  // 'scoped' roles get operational aggregates - including no-show *rates* - but no names.
  const scoped = {
    ...base,
    heure_pointe_approximative: peakHour ? `${peakHour}h-${Number(peakHour) + 1}h` : 'donnée insuffisante',
    no_shows_aujourdhui: noShowsToday,
    no_shows_7_derniers_jours: noShowsThisWeek,
    delai_no_show_minutes: settings.noShowDelayMinutes,
    duree_max_sans_approbation_jours: settings.maxReservationDaysWithoutApproval,
  };

  if (!policy.canSeeOtherUsersData) return scoped;

  // 'full' roles additionally get nominative reservation detail.
  return {
    ...scoped,
    reservations_recentes: reservations.slice(0, 15).map((r) => ({
      poste: r.workstation_code,
      cluster: r.cluster_name,
      utilisateur: r.user_name,
      date: r.reservation_date,
      statut: r.status,
    })),
  };
}

const BASE_SYSTEM_INSTRUCTION = `Tu es XFactory AI Assistant, l'assistant intelligent intégré à XFactory OS (Site de Safi), pour le module Smart Open Space Management.

RÈGLES STRICTES (non négociables) :
1. Réponds UNIQUEMENT à partir des données JSON fournies dans le message. N'invente JAMAIS de chiffre, de nom de personne, ou de statistique absente des données.
2. Si l'information demandée n'est pas dans les données fournies, dis-le clairement plutôt que de deviner.
3. Sois concis, professionnel, en français, adapté à un cadre d'entreprise industrielle.
4. Explique tes recommandations : indique sur quelles données tu t'appuies, et signale explicitement quand les données sont insuffisantes pour conclure.
5. Termine TOUJOURS ta réponse par une ligne séparée commençant exactement par "SUGGESTIONS:" suivie de 2 à 3 questions de suivi pertinentes séparées par "|".`;

function parseSuggestions(rawText: string): { text: string; suggestions: string[] } {
  const marker = 'SUGGESTIONS:';
  const idx = rawText.lastIndexOf(marker);
  if (idx === -1) return { text: rawText.trim(), suggestions: [] };

  const text = rawText.slice(0, idx).trim();
  const suggestions = rawText
    .slice(idx + marker.length)
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  return { text, suggestions };
}

/**
 * Message served when the assistant cannot reach a model.
 *
 * Failure isolation (§12): the assistant degrades to this instead of throwing, so an AI outage
 * never propagates into the request path of reservations, check-in or any other module.
 *
 * Deliberately role-aware. An end user cannot configure an AI provider, so telling them one is
 * missing - or which Settings screen fixes it - is noise about a system they have no access to,
 * and it leaks internal configuration state to everyone who opens the assistant. They get a plain
 * unavailability notice. Only roles that hold `ai_configuration` (Admin, Super Admin) see the
 * cause and where to fix it, because for them it is actionable.
 *
 * The previous version also appended a live occupancy summary to every failure. It was not what
 * anyone had asked for, and reading seat statistics in reply to "recommend me a quiet desk" reads
 * like a malfunction rather than a graceful degradation.
 */
function unavailableMessage(policy: AIRolePolicy, reason: string): string {
  const canConfigure = policy.allowedCapabilities.includes('ai_configuration');

  if (!canConfigure) {
    return "L'assistant IA n'est pas disponible pour le moment. Réessayez plus tard.";
  }

  // "Never configured" is not an outage - saying "temporairement indisponible" to an admin would
  // send them waiting for a recovery that cannot happen without a provider key being entered.
  return reason === 'NOT_CONFIGURED'
    ? "L'assistant IA n'est pas encore configuré. Renseignez un fournisseur et un modèle dans " +
        'Paramètres → Configuration IA Globale.'
    : `L'assistant IA est momentanément indisponible (${reason}). La configuration est visible dans ` +
        'Paramètres → Configuration IA Globale.';
}

export async function askXFactoryAI(
  userQuery: string,
  userRole: UserRole = 'collaborator',
  userId?: string
): Promise<AIAssistantMessage> {
  const policy = getRolePolicy(userRole);

  // AUTHORISE FIRST. A denied request never reaches retrieval and never reaches the model, so no
  // unauthorised data is assembled even transiently.
  const decision = authorizeAIRequest(userRole, userQuery);

  if (!decision.allowed) {
    const denied: AIAssistantMessage = {
      id: `msg-${Date.now()}`,
      sender: 'ai',
      text: decision.refusal!,
      timestamp: new Date().toISOString(),
    };

    // Denied attempts are audited so administrators can see attempted unauthorised AI usage.
    if (userId) {
      await AIInteractionRepository.logInteraction(
        userId,
        userQuery,
        decision.refusal!,
        {
          role: userRole,
          capability: decision.capability,
          decision: 'DENIED',
          reason: 'Insufficient role permission',
        },
        undefined
      );
    }
    return denied;
  }

  const context = await buildAIContext(policy, userId);

  let aiResponseText: string;
  let suggestions: string[] = [];
  let confidence: number | undefined;
  let usedProvider: string | undefined;
  let usedModel: string | undefined;

  try {
    const result = await AIService.generate({
      systemInstruction: `${BASE_SYSTEM_INSTRUCTION}\n\n${buildRolePromptPolicy(policy)}`,
      prompt:
        `DONNÉES AUTORISÉES POUR CE RÔLE (JSON) :\n${JSON.stringify(context)}\n\n` +
        `CAPACITÉ DEMANDÉE : ${decision.capability}\n\n` +
        `QUESTION : ${userQuery}`,
      temperature: 0.3,
      maxOutputTokens: 600,
    });

    const parsed = parseSuggestions(result.text);
    aiResponseText = parsed.text;
    suggestions = parsed.suggestions;
    confidence = 0.9;
    usedProvider = result.provider;
    usedModel = result.model;
  } catch (err) {
    const kind = err instanceof AIUnavailableError ? err.kind : 'ERR_AI_UNAVAILABLE';
    // The cause is logged server-side for administrators regardless of who asked, so diagnosing
    // an outage never depends on what the end user happened to be shown.
    console.error('[AI Assistant] génération impossible:', kind, err instanceof Error ? err.message : err);
    aiResponseText = unavailableMessage(policy, kind);
    confidence = undefined;
  }

  const result: AIAssistantMessage = {
    id: `msg-${Date.now()}`,
    sender: 'ai',
    text: aiResponseText,
    timestamp: new Date().toISOString(),
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };

  if (userId) {
    await AIInteractionRepository.logInteraction(
      userId,
      userQuery,
      aiResponseText,
      {
        role: userRole,
        capability: decision.capability,
        decision: 'ALLOWED',
        data_scope: policy.dataScope,
        occupancy_rate: (context as any).taux_occupation_pourcent,
        // Provider/model are recorded for traceability. The credential is not part of this object
        // and never reaches the audit table.
        provider: usedProvider,
        model: usedModel,
      },
      confidence
    );
  }

  return result;
}

export class AIAssistantService {
  static askXFactoryAI = askXFactoryAI;
}

export type { AICapability };
