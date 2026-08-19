import { Router } from 'express';
import { ApprovalService } from '../../services';
import { ApprovalRepository } from '@/database/repositories/approvalRepository';
import { requirePermission, requireOwnerOrAdmin } from '../middleware/rbacMiddleware';
import { validateBody } from '../middleware/validateBody';
import {
  ApprovalDecisionSchema,
  CreateApprovalRequestSchema,
  CompleteApprovalRequestSchema,
} from '../validators';

export const approvalRouter = Router();

// Approver roles list. SRS section 13 RBAC matrix, row "Approuver longue durée": Building
// Manager is explicitly X (no rights), matching BR-06 ("Approbateurs longue durée : Executive
// Assistant ou Director"). Building Manager was previously included here in error.
// Administrator removed deliberately: BR-06 and the use-case diagram both name Executive
// Assistant and Director as the only long-duration approvers. The §13 matrix's "A" for
// Administrator contradicts them, and the business rule wins.
// Super Admin was previously kept here as a break-glass approver; that exception was dropped so
// the pool matches BR-06 exactly and Super Admin stays purely administrative. This list is the
// DB-outage fallback for the same permission, so it must mirror the granted cells in
// role_permissions - see 20260814134906_align_approver_pools_with_business_rules.sql.
const APPROVER_ROLES = [
  'executive_assistant',
  'director',
] as const;

// GET /api/approvals/pending - Approver roles only
approvalRouter.get('/pending', requirePermission('approve_long_duration', 'approve', APPROVER_ROLES), async (req, res) => {
  try {
    const pending = await ApprovalService.getPendingApprovals();
    res.json(pending);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/approvals - Request extension (Authenticated user, requester_id from req.user)
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

// PUT /api/approvals/:id/decide - Approvers only (deciderId forced from req.user.id)
approvalRouter.put(
  '/:id/decide',
  requirePermission('approve_long_duration', 'approve', APPROVER_ROLES),
  validateBody(ApprovalDecisionSchema),
  async (req, res) => {
    try {
      const { decision, decisionNote } = req.body;
      // Decider ID is taken from req.user (JWT), removing impersonation
      const deciderId = req.user!.id;
      const success = await ApprovalService.decideApproval(req.params.id, decision, decisionNote, deciderId, req.user!.role);
      res.json({ success });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// PUT /api/approvals/:id/complete - BPMN D2 "UPDATE --> REVIEW".
//
// The requester completes the motif after a DEMANDER INFO decision, and the request returns to
// the approver's queue. Owner-only: this had no route at all, so the frontend called the service
// directly and the write never reached the database.
approvalRouter.put(
  '/:id/complete',
  requireOwnerOrAdmin(async (req) => {
    const list = await ApprovalRepository.getApprovals();
    const entry = list.find((a) => a.id === req.params.id);
    return entry ? entry.requester_id : null;
  }),
  validateBody(CompleteApprovalRequestSchema),
  async (req, res) => {
    try {
      const ok = await ApprovalService.updateExtensionRequest(
        req.params.id,
        req.body.objective,
        req.body.reason
      );
      if (!ok) {
        return res.status(409).json({
          status: 'error',
          message:
            "Cette demande n'attend pas de complément d'information (elle a peut-être déjà été décidée).",
        });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// GET /api/approvals/mine - the caller's OWN requests, any status.
//
// Not gated on the approver permission: this is a requester reading their own file. It is what
// drives the "the validator wants more detail" prompt, which previously had no data source it
// could actually use - the dashboard searched the pending-only list for a needs_info row.
approvalRouter.get('/mine', async (req, res) => {
  try {
    const mine = await ApprovalService.getRequestsForUser(req.user!.id);
    res.json(mine);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET /api/approvals/history - Approvers only
approvalRouter.get('/history', requirePermission('approve_long_duration', 'approve', APPROVER_ROLES), async (req, res) => {
  try {
    const history = await ApprovalService.getApprovalHistory();
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});
