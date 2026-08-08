import { Router } from 'express';
import { AIAssistantService } from '@/services/ai/aiAssistantService';
import { requireRole } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import { AIQuerySchema } from '../validators';

export const aiRouter = Router();

// SRS §22.2: Employee is an explicit actor ("Recommandation de poste", "Apprentissage habitudes"),
// not just managers — the assistant itself isn't role-gated, only the DATA it can see is
// (buildAIContext() withholds nominative reservation detail from non-privileged roles).
const AI_ALLOWED_ROLES = [
  'collaborator',
  'receptionist',
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
