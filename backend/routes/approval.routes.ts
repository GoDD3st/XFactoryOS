import { Router } from 'express';
import { ApprovalService } from '../../services';
import { requireRole } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import { ApprovalDecisionSchema, CreateApprovalRequestSchema } from '../validators';

export const approvalRouter = Router();

// Approver roles list. SRS section 13 RBAC matrix, row "Approuver longue durée": Building
// Manager is explicitly X (no rights) — only EA/Director/Admin/Super Admin approve, matching
// BR-06 ("Approbateurs longue durée : Executive Assistant ou Director"). Building Manager was
// previously included here in error.
const APPROVER_ROLES = [
  'executive_assistant',
  'director',
  'admin',
  'super_admin',
] as const;

// GET /api/approvals/pending — Approver roles only
approvalRouter.get('/pending', requireRole(...APPROVER_ROLES), async (req, res) => {
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
  requireRole(...APPROVER_ROLES),
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
approvalRouter.get('/history', requireRole(...APPROVER_ROLES), async (req, res) => {
  try {
    const history = await ApprovalService.getApprovalHistory();
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});
