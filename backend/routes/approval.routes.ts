import { Router } from 'express';
import { ApprovalService } from '../../services';
import { requirePermission } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import { ApprovalDecisionSchema, CreateApprovalRequestSchema } from '../validators';

export const approvalRouter = Router();

// Approver roles list. SRS section 13 RBAC matrix, row "Approuver longue durée": Building
// Manager is explicitly X (no rights) — only EA/Director/Admin/Super Admin approve, matching
// BR-06 ("Approbateurs longue durée : Executive Assistant ou Director"). Building Manager was
// previously included here in error.
// Administrator removed deliberately: BR-06 and the use-case diagram both name Executive
// Assistant and Director as the only long-duration approvers. The §13 matrix's "A" for
// Administrator contradicts them, and the business rule wins. Super Admin is kept as the
// break-glass approver so approvals cannot deadlock if no EA/Director is available.
const APPROVER_ROLES = [
  'executive_assistant',
  'director',
  'super_admin',
] as const;

// GET /api/approvals/pending — Approver roles only
approvalRouter.get('/pending', requirePermission('approve_long_duration', 'approve', APPROVER_ROLES), async (req, res) => {
  try {
    const pending = await ApprovalService.getPendingApprovals();
    res.json(pending);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/approvals — Request extension (Authenticated user, requester_id from req.user)
approvalRouter.post('/', validateBody(CreateApprovalRequestSchema), async (req, res) => {
  try {
    const payload = {
      ...req.body,
      requester_id: req.user!.id,
      requester_name: req.user!.full_name,
      user_department: req.user!.department,
    };
    const request = await ApprovalService.createApprovalRequest(payload);
    res.status(201).json(request);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// PUT /api/approvals/:id/decide — Approvers only (deciderId forced from req.user.id)
approvalRouter.put(
  '/:id/decide',
  requirePermission('approve_long_duration', 'approve', APPROVER_ROLES),
  validateBody(ApprovalDecisionSchema),
  async (req, res) => {
    try {
      const { decision, decisionNote } = req.body;
      // 🛡️ Decider ID is taken from req.user (JWT), removing impersonation
      const deciderId = req.user!.id;
      const success = await ApprovalService.decideApproval(req.params.id, decision, decisionNote, deciderId, req.user!.role);
      res.json({ success });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// GET /api/approvals/history — Approvers only
approvalRouter.get('/history', requirePermission('approve_long_duration', 'approve', APPROVER_ROLES), async (req, res) => {
  try {
    const history = await ApprovalService.getApprovalHistory();
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});
