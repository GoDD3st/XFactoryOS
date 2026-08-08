import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../client';

async function resolveClient(): Promise<SupabaseClient> {
  if (typeof window === 'undefined') {
    const { getAdminClient } = await import('../serverClient');
    const admin = getAdminClient();
    if (admin) return admin;
  }
  return supabase;
}

export class AIInteractionRepository {
  static async logInteraction(
    userId: string,
    prompt: string,
    response: string,
    contextScope?: Record<string, unknown>,
    confidence?: number
  ): Promise<void> {
    try {
      const db = await resolveClient();
      await db.from('ai_interactions').insert({
        user_id: userId,
        prompt,
        response,
        context_scope: contextScope || {},
        confidence: confidence ?? null,
      });
    } catch (err) {
      console.warn('AI interaction DB notice:', err);
    }
  }
}
