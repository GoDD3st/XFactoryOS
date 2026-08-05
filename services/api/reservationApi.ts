import { Reservation, UserRole } from '@/frontend/src/types';
import { supabase } from '@/database/client';

/** Fields allowed by POST /api/reservations (CreateReservationSchema.strict). */
function buildReservationRequestBody(payload: Partial<Reservation>) {
  return {
    workstation_id: payload.workstation_id,
    workstation_code: payload.workstation_code,
    cluster_id: payload.cluster_id,
    cluster_name: payload.cluster_name,
    reservation_date: payload.reservation_date,
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
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    throw new Error('Vous devez être connecté pour réserver un poste.');
  }

  const response = await fetch('/api/reservations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(buildReservationRequestBody(payload)),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const validationDetail =
      Array.isArray(result.errors) && result.errors.length > 0
        ? result.errors.map((e: { field: string; message: string }) => `${e.field}: ${e.message}`).join(' · ')
        : null;
    throw new Error(validationDetail || result.message || result.error || 'Échec de la création de la réservation.');
  }

  return result.data as Reservation;
}

export async function apiFetchReservations(): Promise<Reservation[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) return [];

  const response = await fetch('/api/reservations', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) return [];

  const body = await response.json();
  return body.data || [];
}
