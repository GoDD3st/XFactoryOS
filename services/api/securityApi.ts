import { supabase } from '@/database/client';
import { isDemoMode } from '@/frontend/src/modules/auth/utils/demoMode';

async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extra };

  if (!isDemoMode()) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Vous devez être connecté pour effectuer cette action.');
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export interface OccupantRosterItem {
  reservation_id: string;
  user_name: string;
  department: string;
  workstation_code: string;
  cluster_name: string;
  check_in_at: string;
}

/**
 * Live evacuation roster (SRS §8.11) - who is physically checked in right now.
 *
 * Deliberately fetched from the server rather than the local reservation cache: the cache is
 * empty on a fresh session and stale otherwise, and this is the one list where being wrong has
 * physical consequences. Throws instead of returning [] so the UI can say "unavailable" rather
 * than silently presenting an empty building as fact.
 */
export async function apiFetchEvacuationRoster(): Promise<OccupantRosterItem[]> {
  const response = await fetch('/api/security/evacuation-roster', {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || result.message || "Échec de la récupération du registre d'évacuation.");
  }
  const body = await response.json();
  return body.data || [];
}
