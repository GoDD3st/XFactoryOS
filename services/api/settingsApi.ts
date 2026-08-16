import { supabase } from '@/database/client';
import { isDemoMode } from '@/frontend/src/modules/auth/utils/demoMode';

/**
 * Settings endpoints that are not part of the password-confirmed settings form.
 *
 * The logo is saved on its own endpoint: it is validated server-side and applied immediately,
 * whereas the booking rules go through a re-authentication step because changing them alters how
 * reservations behave for everyone.
 */

async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extra };
  if (!isDemoMode()) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export interface SiteLogoResult {
  logo: string | null;
  meta?: { format: string; bytes: number; width: number; height: number };
}

/**
 * Uploads a logo. Returns the normalised data URI the server actually stored - rebuilt from the
 * sniffed content type, so it is not necessarily byte-identical to what was submitted.
 */
export async function apiUploadSiteLogo(dataUrl: string): Promise<SiteLogoResult> {
  const response = await fetch('/api/settings/logo', {
    method: 'PUT',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ logo: dataUrl }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || "Échec de l'envoi du logo.");
  }
  return result.data;
}

/** Clears the logo, restoring the XF text mark. */
export async function apiClearSiteLogo(): Promise<void> {
  const response = await fetch('/api/settings/logo', {
    method: 'PUT',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ logo: null }),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || 'Échec de la suppression du logo.');
  }
}
