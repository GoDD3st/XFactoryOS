import { AIAssistantMessage } from '@/frontend/src/types';
import { getSavedWorkstations } from '@/services/workspaces/workspaceService';
import { getLocalReservations } from '@/services/reservations/reservationService';

export async function askXFactoryAI(
  userQuery: string,
  userRole = 'collaborateur'
): Promise<AIAssistantMessage> {
  const wsMap = getSavedWorkstations();
  const reservations = getLocalReservations();

  let totalDesks = 0;
  let occupiedCount = 0;
  let maintenanceCount = 0;

  Object.values(wsMap).forEach((list) => {
    totalDesks += list.length;
    list.forEach((ws) => {
      if (ws.status === 'occupé' || ws.status === 'réservé') occupiedCount++;
      if (ws.status === 'maintenance') maintenanceCount++;
    });
  });

  const availableCount = Math.max(0, totalDesks - occupiedCount - maintenanceCount);
  const occupancyRate = Math.round((occupiedCount / totalDesks) * 100);

  const queryLower = userQuery.toLowerCase();
  let aiResponseText = '';
  const suggestions: string[] = [];

  if (queryLower.includes('disponib') || queryLower.includes('libre')) {
    aiResponseText = `Actuellement sur le site OCP Safi (XFactory Open Space), il y a **${availableCount} postes disponibles** sur 56 au total (taux d'occupation actuel : ${occupancyRate}%). Les clusters CL-A (Innovation) et CL-B (Digital Factory) offrent la meilleure disponibilité cet après-midi.`;
    suggestions.push('Réserver sur Cluster CL-A', 'Voir le heatmap d\'occupation', 'Filtrer par double écran');
  } else if (queryLower.includes('no-show') || queryLower.includes('clean desk')) {
    aiResponseText = `Conformément à la politique Clean Desk d'OCP SA - Safi Site, le délai de libération automatique pour **No-Show est de 30 minutes** après le début de la réservation. Aujourd'hui, 2 postes ont été automatiquement remis en disponibilité.`;
    suggestions.push('Voir le taux de No-Show', 'Afficher l\'historique des check-in');
  } else if (queryLower.includes('cluster') || queryLower.includes('management')) {
    aiResponseText = `Les clusters CL-F (Management VIP 1) et CL-G (Management VIP 2) sont actuellement réservés au Comité de Direction. Pour débloquer ces clusters, une autorisation par un GCI Manager ou Building Manager est requise.`;
    suggestions.push('Demander déblocage Cluster VIP', 'Voir les autorisations');
  } else if (queryLower.includes('matériel') || queryLower.includes('ecran') || queryLower.includes('iot')) {
    aiResponseText = `La supervision IoT Safi indique un taux d'opérabilité du matériel de **96.4%**. 54 ports RJ45 Gigabit Ethernet et stations d'accueil USB-C Dual 4K sont pleinement fonctionnels.`;
    suggestions.push('Lancer diagnostic matériel', 'Signaler un problème technique');
  } else {
    aiResponseText = `Bonjour ! Je suis l'assistant IA **XFactory OS**. Je peux vous assister pour :
- **Optimiser vos réservations** selon vos préférences (double écran, zone calme, PMR).
- **Consulter l'occupation en temps réel** des 7 clusters d'OCP Safi Site.
- **Vérifier l'état de la supervision matérielle** (IoT, RJ45, docks 4K).
Comment puis-je vous aider aujourd'hui ?`;
    suggestions.push(
      'Quels sont les postes libres ?',
      'Explication politique No-Show',
      'Diagnostic matériel IoT'
    );
  }

  return {
    id: `msg-${Date.now()}`,
    sender: 'ai',
    text: aiResponseText,
    timestamp: new Date().toISOString(),
    suggestions,
  };
}

export class AIAssistantService {
  static askXFactoryAI = askXFactoryAI;
}
