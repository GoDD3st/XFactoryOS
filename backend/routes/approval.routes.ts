import { Router } from 'express';
import { ApprovalService } from '../../services';
import { requireRole } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import { ApprovalDecisionSchema, CreateApprovalRequestSchema } from '../validators';

export const approvalRouter = Router();

// Approver roles list
const APPROVER_ROLES = [
  'building_manager',
  'executive_assistant',
  'director',
  'admin',
  'super_admin',
] as const;

// GET /api/approvals/pending — Approver roles only
approvalRouter.get('/pending', requireRole(...APPROVER_ROLES), (req, res) => {
  const pending = ApprovalService.getPendingApprovals();
  res.json(pending);
});

// POST /api/approvals — Request extension (Authenticated user, requester_id from req.user)
approvalRouter.post('/', validateBody(CreateApprovalRequestSchema), (req, res) => {
  const payload = {
    ...req.body,
    requester_id: req.user!.id,
    requester_name: req.user!.full_name,
    user_department: req.user!.department,
  };
  const request = ApprovalService.createApprovalRequest(payload);
  res.status(201).json(request);
});

// PUT /api/approvals/:id/decide — Approvers only (deciderId forced from req.user.id)
approvalRouter.put(
  '/:id/decide',
  requireRole(...APPROVER_ROLES),
  validateBody(ApprovalDecisionSchema),
  (req, res) => {
    const { decision, decisionNote } = req.body;
    // 🛡️ Decider ID is taken from req.user (JWT), removing impersonation
    const deciderId = req.user!.id;
    const success = ApprovalService.decideApproval(req.params.id, decision, decisionNote, deciderId);
    res.json({ success });
  }
);

// GET /api/approvals/history — Approvers only
approvalRouter.get('/history', requireRole(...APPROVER_ROLES), (req, res) => {
  const history = ApprovalService.getApprovalHistory();
  res.json(history);
});
