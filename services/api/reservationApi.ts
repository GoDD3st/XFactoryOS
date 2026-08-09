import { Reservation, UserRole } from '@/frontend/src/types';
import { supabase } from '@/database/client';
import { isDemoMode } from '@/frontend/src/modules/auth/utils/demoMode';

/** BPMN D1 ALT path — thrown on a 409 conflict, carries alternative desks the caller can offer. */
export class ReservationConflictError extends Error {
  alternatives: { code: string; cluster_name: string }[];
  constructor(message: string, alternatives: { code: string; cluster_name: string }[]) {
    super(message);
    this.name = 'ReservationConflictError';
    this.alternatives = alternatives;
  }
}

/** Fields allowed by POST /api/reservations (CreateReservationSchema.strict). */
function buildReservationRequestBody(payload: Partial<Reservation>) {
  return {
    workstation_id: payload.workstation_id,
    workstation_code: payload.workstation_code,
    cluster_id: payload.cluster_id,
    cluster_name: payload.cluster_name,
    reservation_date: payload.reservation_date,
    end_date: payload.end_date,
    start_time: payload.start_time,
    end_time: payload.end_time,
    purpose: payload.purpose,
    notes: payload.notes,
  };
}

export async function apiCreateReservation(
  payload: Partial<Reservation>,
  _userRole?: UserRole
): Promise<Reservation> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (!isDemoMode()) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      throw new Error('Vous devez être connecté pour réserver un poste.');
    }

    headers.Authorization = `Bearer ${token}`;
  }
  // Demo mode: no Authorization header — AuthContext's global fetch interceptor
  // injects X-Demo-Role, which authMiddleware.ts's DEMO_MODE branch honors.

  const response = await fetch('/api/reservations', {
    method: 'POST',
    headers,
    body: JSON.stringify(buildReservationRequestBody(payload)),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const validationDetail =
      Array.isArray(result.errors) && result.errors.length > 0
        ? result.errors.map((e: { field: string; message: string }) => `${e.field}: ${e.message}`).join(' · ')
        : null;
    const message = validationDetail || result.message || result.error || 'Échec de la création de la réservation.';

    if (response.status === 409 && Array.isArray(result.alternatives)) {
      throw new ReservationConflictError(message, result.alternatives);
    }
    throw new Error(message);
  }

  return result.data as Reservation;
}

export async function apiFetchReservations(): Promise<Reservation[]> {
  const headers: Record<string, string> = {};

  if (!isDemoMode()) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) return [];

    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch('/api/reservations', { headers });

  if (!response.ok) return [];

  const body = await response.json();
  return body.data || [];
}
