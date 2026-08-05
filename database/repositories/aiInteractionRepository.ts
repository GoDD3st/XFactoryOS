import { supabase } from '../client';

export class AIInteractionRepository {
  static async logInteraction(
    userId: string,
    prompt: string,
    response: string,
    contextScope?: Record<string, unknown>
  ): Promise<void> {
    try {
      await supabase.from('ai_interactions').insert({
        user_id: userId,
        prompt,
        response,
        context_scope: contextScope || {},
        confidence: 0.85,
      });
    } catch (err) {
      console.warn('AI interaction DB notice:', err);
    }
  }
}
