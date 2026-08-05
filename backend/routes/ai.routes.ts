import { Router } from 'express';
import { AIAssistantService } from '@/services/ai/aiAssistantService';
import { requireRole } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import { AIQuerySchema } from '../validators';

export const aiRouter = Router();

// Allowed roles for AI Assistant (Managers & Admins)
const AI_ALLOWED_ROLES = [
  'building_manager',
  'gci_manager',
  'executive_assistant',
  'director',
  'admin',
  'super_admin',
  'it_admin',
] as const;

// POST /api/ai/ask — Restricted to Manager & Admin roles only
aiRouter.post('/ask', requireRole(...AI_ALLOWED_ROLES), validateBody(AIQuerySchema), async (req, res) => {
  try {
    const { query } = req.body;
    // 🛡️ Role is derived from authenticated JWT user, not client body
    const userRole = req.user!.role;
    const userId = req.user!.id;
    const response = await AIAssistantService.askXFactoryAI(query, userRole, userId);
    res.json({ success: true, data: response });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec du traitement de la requête IA' });
  }
});
