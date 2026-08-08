import { AIAssistantMessage } from '@/frontend/src/types';
import { supabase } from '@/database/client';
import { isDemoMode } from '@/frontend/src/modules/auth/utils/demoMode';

export async function apiAskXFactoryAI(query: string): Promise<AIAssistantMessage> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (!isDemoMode()) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Vous devez être connecté pour utiliser l\'assistant IA.');
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch('/api/ai/ask', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'Assistant temporairement indisponible.');
  }

  const result = await response.json();
  return result.data;
}
