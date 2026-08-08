import { UserNotification } from '@/frontend/src/types';
import { supabase } from '@/database/client';
import { isDemoMode } from '@/frontend/src/modules/auth/utils/demoMode';

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};

  if (!isDemoMode()) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return headers;
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function apiFetchNotifications(): Promise<UserNotification[]> {
  const response = await fetch('/api/notifications', { headers: await authHeaders() });
  if (!response.ok) return [];
  const body = await response.json();
  return body.data || [];
}

export async function apiMarkNotificationRead(id: string): Promise<void> {
  await fetch(`/api/notifications/${id}/read`, {
    method: 'PUT',
    headers: await authHeaders(),
  });
}
