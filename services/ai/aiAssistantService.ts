import { GoogleGenAI } from '@google/genai';
import { AIAssistantMessage, UserRole } from '@/frontend/src/types';
import { WorkstationRepository } from '@/database/repositories/workstationRepository';
import { ReservationRepository } from '@/database/repositories/reservationRepository';
import { AIInteractionRepository } from '@/database/repositories/aiInteractionRepository';
import { SettingsRepository } from '@/database/repositories/settingsRepository';

/**
 * Builds the ONLY factual context the model is allowed to draw on (SRS §22.5: "L'assistant ne
 * doit répondre qu'à partir des données autorisées par le rôle" / "ne doit pas exposer des
 * données nominatives sensibles"). Pulls live Supabase data — not the browser-cache/synthetic
 * fallback that getSavedWorkstations() returns when called server-side.
 */
async function buildAIContext(userRole: UserRole) {
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

  // Peak hour: bucket confirmed/checked-in reservations by start hour over the last 7 days.
  const hourBuckets: Record<number, number> = {};
  reservations
    .filter((r) => r.reservation_date >= weekAgo && ['confirmée', 'check-in', 'terminée'].includes(r.status))
    .forEach((r) => {
      const hour = parseInt((r.start_time || '08:00').split(':')[0], 10);
      hourBuckets[hour] = (hourBuckets[hour] || 0) + 1;
    });
  const peakHour = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1])[0]?.[0];

  const isPrivileged = ['admin', 'super_admin', 'building_manager', 'gci_manager', 'director', 'executive_assistant', 'it_admin'].includes(userRole);

  return {
    site: 'OCP SA — Site de Safi — XFactory Open Space',
    date_du_jour: todayStr,
    total_postes: totalDesks,
    postes_disponibles: available,
    postes_occupes: occupied,
    postes_reserves: reserved,
    postes_en_maintenance: maintenance,
    postes_cluster_management_verrouilles: managementLocked,
    taux_occupation_pourcent: occupancyRate,
    heure_pointe_approximative: peakHour ? `${peakHour}h-${Number(peakHour) + 1}h` : 'donnée insuffisante',
    no_shows_aujourdhui: noShowsToday,
    no_shows_7_derniers_jours: noShowsThisWeek,
    delai_no_show_minutes: settings.noShowDelayMinutes,
    duree_max_sans_approbation_jours: settings.maxReservationDaysWithoutApproval,
    clusters: perCluster,
    // Nominative reservation-level detail is only exposed to management/admin roles.
    reservations_recentes: isPrivileged
      ? reservations.slice(0, 15).map((r) => ({
          poste: r.workstation_code,
          cluster: r.cluster_name,
          date: r.reservation_date,
          statut: r.status,
        }))
      : undefined,
  };
}

const SYSTEM_INSTRUCTION = `Tu es XFactory AI Assistant, l'assistant intelligent intégré à XFactory OS (OCP SA, Site de Safi), pour le module Smart Open Space Management.

RÈGLES STRICTES (non négociables) :
1. Réponds UNIQUEMENT à partir des données JSON fournies dans le message. N'invente JAMAIS de chiffre, de nom de personne, ou de statistique absente des données.
2. Si l'information demandée n'est pas dans les données fournies, dis-le clairement plutôt que de deviner.
3. Sois concis, professionnel, en français, adapté à un cadre d'entreprise industrielle (OCP).
4. Ne révèle jamais de données nominatives à un profil non autorisé (les données déjà filtrées par rôle te sont fournies telles quelles — respecte ce filtrage, ne demande pas plus).
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

function deterministicFallback(context: Awaited<ReturnType<typeof buildAIContext>>): string {
  return (
    `Assistant IA temporairement indisponible (ERR_AI_UNAVAILABLE) — voici un résumé factuel des données actuelles : ` +
    `${context.postes_disponibles}/${context.total_postes} postes disponibles ` +
    `(taux d'occupation ${context.taux_occupation_pourcent}%), ${context.no_shows_aujourdhui} no-show(s) aujourd'hui.`
  );
}

export async function askXFactoryAI(
  userQuery: string,
  userRole: UserRole = 'collaborator',
  userId?: string
): Promise<AIAssistantMessage> {
  const context = await buildAIContext(userRole);
  const apiKey = process.env.GEMINI_API_KEY;

  let aiResponseText: string;
  let suggestions: string[] = [];
  let confidence: number | undefined;

  if (!apiKey) {
    aiResponseText = deterministicFallback(context);
  } else {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `DONNÉES ACTUELLES (JSON) :\n${JSON.stringify(context)}\n\nRÔLE DE L'UTILISATEUR : ${userRole}\n\nQUESTION : ${userQuery}`,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.3,
          maxOutputTokens: 600,
        },
      });

      const raw = response.text;
      if (!raw) throw new Error('Réponse vide du modèle');

      const parsed = parseSuggestions(raw);
      aiResponseText = parsed.text;
      suggestions = parsed.suggestions;
      confidence = 0.9;
    } catch (err) {
      console.error('[AI Assistant] Gemini call failed, falling back to deterministic summary:', err);
      aiResponseText = deterministicFallback(context);
      confidence = 0.4;
    }
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
      { role: userRole, occupancy_rate: context.taux_occupation_pourcent },
      confidence
    );
  }

  return result;
}

export class AIAssistantService {
  static askXFactoryAI = askXFactoryAI;
}
