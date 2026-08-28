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

// ── Late check-in request workflow ───────────────────────────────────────────────────────────
export type LateCheckInStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface LateCheckInRequest {
  id: string;
  reservation_id: string;
  user_id: string;
  justification: string;
  status: LateCheckInStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  reviewer_comment?: string | null;
  created_at: string;
  updated_at: string;
  requester_name?: string;
  requester_email?: string;
  requester_department?: string;
  reviewer_name?: string;
  workstation_code?: string;
  cluster_name?: string;
  reservation_start?: string;
  reservation_end?: string;
  reservation_status?: string;
}

/** Open a late check-in request for one of your own reservations. */
export async function apiRequestLateCheckIn(
  reservationId: string,
  justification: string
): Promise<LateCheckInRequest> {
  const response = await fetch('/api/checkinout/late-check-in', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ reservationId, justification }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Échec de la demande de check-in tardif.');
  return result.data;
}

/** The caller's own requests, so they can follow the status. */
export async function apiFetchMyLateCheckIns(): Promise<LateCheckInRequest[]> {
  const response = await fetch('/api/checkinout/late-check-in/mine', { headers: await authHeaders() });
  if (!response.ok) return [];
  return (await response.json()).data || [];
}

/** Full queue + history. Reviewer roles only - the server returns 403 otherwise. */
export async function apiFetchLateCheckInRequests(): Promise<LateCheckInRequest[]> {
  const response = await fetch('/api/checkinout/late-check-in', { headers: await authHeaders() });
  if (!response.ok) return [];
  return (await response.json()).data || [];
}

export async function apiDecideLateCheckIn(
  id: string,
  decision: 'APPROVED' | 'REJECTED',
  reviewerComment?: string
): Promise<LateCheckInRequest> {
  const response = await fetch(`/api/checkinout/late-check-in/${id}/decision`, {
    method: 'PATCH',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ decision, reviewerComment }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Échec de la décision.');
  return result.data;
}

/**
 * Self-service check-in / check-out. The server forces the user id from the session, so these
 * can only ever act on the caller's own reservation - which is exactly the collaborator flow.
 * Using them instead of the client-side CheckInOutService keeps the write behind the API's
 * ownership guard rather than relying on RLS alone, and makes failures explicit.
 */
export async function apiCheckIn(reservationId: string): Promise<{ checkInAt?: string }> {
  const response = await fetch('/api/checkinout/check-in', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ reservationId }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || 'Échec du check-in.');
  }
  // The timestamp the server actually stored. Displayed as-is: the browser clock is not evidence
  // of when the check-in was recorded, and on a wrongly-set device it would simply be a lie.
  return { checkInAt: result.data?.checkInAt };
}

export async function apiCheckOut(reservationId: string): Promise<void> {
  const response = await fetch('/api/checkinout/check-out', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ reservationId }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || 'Échec du check-out.');
  }
}

/**
 * Reception-desk check-in for a collaborator's reservation. Goes through the server (which
 * resolves the reservation holder and enforces the role gate) rather than the client-side
 * CheckInOutService, whose ownership check makes it unusable on someone else's behalf.
 */
export async function apiCheckInForReservation(
  reservationId: string
): Promise<{ userName?: string; workstationCode?: string }> {
  const response = await fetch('/api/checkinout/check-in-for', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ reservationId }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || 'Échec du check-in.');
  }
  return result.data || {};
}

/**
 * Fetch the static, printable badge token for a seat (admin/building/GCI manager only - 
 * enforced server-side). The token itself never changes for a given seat.
 */
export async function apiFetchSeatQrToken(workstationId: string): Promise<string> {
  const response = await fetch(`/api/checkinout/seat-qr/${workstationId}`, { headers: await authHeaders() });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || 'Échec de la génération du QR code du poste.');
  }
  const body = await response.json();
  return body.token;
}

/**
 * Read-only decode of a scanned seat token - receptionist/manager roles only. Used to figure
 * out which seat was scanned before committing to a check-in/out on someone's behalf.
 */
export async function apiDecodeSeatToken(seatToken: string): Promise<{ workstationId: string; workstationCode: string }> {
  const response = await fetch('/api/checkinout/scan-seat/decode', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ seatToken }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || 'Échec du décodage du badge.');
  }
  return { workstationId: body.workstationId, workstationCode: body.workstationCode };
}

/** A free desk the scanner may take right now, with how long it is free for. */
export interface WalkInWindow {
  workstationId: string;
  workstationCode: string;
  clusterName: string;
  date: string;
  start: string;
  end: string;
  endReason: 'next_reservation' | 'business_close';
  availableMinutes: number;
  minMinutes: number;
}

/** What a scanned desk badge resolves to - always about the caller, never about anyone else. */
export interface SeatScanResolution {
  reservation?: {
    id: string;
    workstationCode: string;
    clusterName: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
  };
  userName?: string;
  availableAction?: 'check-in' | 'check-out';
  /** Set instead of `reservation` when the caller holds nothing here but the desk is free now. */
  walkIn?: WalkInWindow;
}

/**
 * Resolve a scanned desk badge into the caller's own reservation on that desk.
 *
 * READ-ONLY. It never checks anybody in or out - that is the explicit button's job, and the
 * server re-validates everything when it is pressed. If the caller has no reservation on the
 * scanned desk the server answers with a flat refusal that names nobody.
 */
export async function apiResolveSeatScan(seatToken: string): Promise<SeatScanResolution> {
  const response = await fetch('/api/checkinout/scan-seat', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ seatToken }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || "Vous n'avez pas accès à ce poste.");
  }
  return body.data;
}

/**
 * Reception-desk check-out for a collaborator's reservation - the counterpart of
 * apiCheckInForReservation. Role-gated server-side; the audit trail names the staff member.
 */
export async function apiCheckOutForReservation(
  reservationId: string
): Promise<{ workstationCode?: string }> {
  const response = await fetch('/api/checkinout/check-out-for', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ reservationId }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || 'Échec du check-out.');
  }
  return result.data || {};
}

/**
 * Take a free desk on the spot, for the window the server computed from the scanned badge.
 *
 * `endTime` may only shorten that window; the server recomputes it and refuses anything longer,
 * so this is a request rather than an instruction.
 */
export async function apiBookWalkIn(seatToken: string, endTime?: string): Promise<void> {
  const response = await fetch('/api/reservations/walk-in', {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(endTime ? { seatToken, endTime } : { seatToken }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || 'Échec de la réservation sur place.');
  }
}
