import { Router } from 'express';
import { ApprovalService } from '../../services';

export const approvalRouter = Router();

approvalRouter.get('/pending', (req, res) => {
  const pending = ApprovalService.getPendingApprovals();
  res.json(pending);
});

approvalRouter.post('/', (req, res) => {
  const request = ApprovalService.createApprovalRequest(req.body);
  res.json(request);
});

approvalRouter.put('/:id/decide', (req, res) => {
  const { decision, decisionNote, deciderId } = req.body;
  const success = ApprovalService.decideApproval(req.params.id, decision, decisionNote, deciderId);
  res.json({ success });
});

approvalRouter.get('/history', (req, res) => {
  const history = ApprovalService.getApprovalHistory();
  res.json(history);
});
