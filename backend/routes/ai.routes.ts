import { Router } from 'express';
import { AIAssistantService } from '@/services/ai/aiAssistantService';

export const aiRouter = Router();

aiRouter.post('/ask', async (req, res) => {
  try {
    const { query, role } = req.body;
    const response = await AIAssistantService.askXFactoryAI(query || '', role || 'collaborateur');
    res.json({ success: true, data: response });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to process AI assistant request' });
  }
});
