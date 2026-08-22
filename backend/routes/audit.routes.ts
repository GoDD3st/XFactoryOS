import { Router } from 'express';
import { AuditService } from '@/services/audit/auditService';
import { requirePermission } from '../middleware/rbacMiddleware';
import { AuditCategory, UserRole } from '@/frontend/src/types';

export const auditRouter = Router();

// Who sees which category of log by default. Per-user request: routine operational logs
// (connexion, réservations, check-in/out, no-show, approbations) go to the roles who actually
// own that domain day-to-day, not to Super Admin/Admin by default - those two only get the
// governance-critical categories (role changes, settings, AI usage) automatically, plus the
// "voir tout" override below since they're the top of the system.
const AUDIT_CATEGORY_VISIBILITY: Record<AuditCategory, UserRole[]> = {
  auth: ['it_admin'],
  reservation: ['receptionist', 'building_manager', 'it_admin', 'gci_manager'],
  checkinout: ['receptionist', 'it_admin', 'security_guard'],
  // "No-show automatique... Director mais seulement si l'utilisateur exagère" - abuse-pattern
  // detection (repeat no-shows) isn't implemented, so Director sees all no-shows for now rather
  // than a filtered subset; flagged as a simplification, not the literal spec.
  noshow: ['receptionist', 'building_manager', 'it_admin', 'director'],
  // "Approbation/refus... end user s'il est concerné" - the requester's own decisions are
  // already pushed to them via NotificationService, not through this audit list (they don't have
  // an Audit tab at all), so that half of the rule is covered by a different surface.
  approval: ['receptionist', 'gci_manager'],
  role_change: ['super_admin', 'admin', 'it_admin'],
  settings: ['super_admin', 'admin', 'building_manager'],
  cluster_management: ['gci_manager', 'receptionist', 'building_manager'],
  export: ['admin', 'building_manager'],
  ai_query: ['super_admin', 'admin', 'building_manager', 'gci_manager'],
};

// Roles that may request the unfiltered log via ?all=true - "il ne devra voir que ce qui est
// essentiel mais a accès a voir tous car il est le haut niveau du système".
const CAN_SEE_ALL = ['super_admin'] as const;

// GET /api/audit - SRS §13 matrix "Audit logs": R = Super Admin, Admin, Building Manager,
// GCI Manager, Director, IT Admin, Security. Receptionist added on top of that base matrix: the
// per-category visibility breakdown above explicitly routes 5 of the 10 categories to them
// (reservations, check-in/out, no-show, approvals, cluster ops) - without route access none of
// that would ever be reachable.
// This list must match the policy table, or the fallback would silently re-grant access the
// policy denies whenever the policy can't be read. Receptionist is X in the §13 matrix.
// Director is excluded on a deliberate override: the matrix row grants it R, but the SRS section
// naming the audit-log actors lists only Super Administrator, Security and IT Administrator - 
// the two contradict each other and the narrative section was chosen.
// Fallback for when role_permissions cannot be read. Admin and Super Admin only, matching the
// policy table after 20260822: the audit log is an administration surface, and the roles that were
// reading it by default now need an explicit grant from the Roles & Permissions screen. Widening
// this list would silently re-grant on the one path where the policy table has no say.
const AUDIT_FALLBACK_ROLES = ['super_admin', 'admin'] as const;

auditRouter.get('/', requirePermission('audit_logs', 'read', AUDIT_FALLBACK_ROLES), async (req, res) => {
  try {
    const data = await AuditService.getAuditLogs();
    const role = req.user!.role;
    const wantsAll = req.query.all === 'true' && (CAN_SEE_ALL as readonly string[]).includes(role);

    const scoped = wantsAll
      ? data
      : data.filter((log) => {
          const category = log.category || 'reservation';
          return AUDIT_CATEGORY_VISIBILITY[category]?.includes(role);
        });

    res.json({ success: true, data: scoped, canSeeAll: (CAN_SEE_ALL as readonly string[]).includes(role) });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de la récupération des journaux d\'audit' });
  }
});

// POST /api/audit - System audit log entry (Actor info extracted directly from authenticated JWT session)
auditRouter.post('/', async (req, res) => {
  try {
    const { action, target_resource, details } = req.body;
    const actor_id = req.user!.id;
    const actor_name = req.user!.full_name;
    const actor_role = req.user!.role;
    const ip_address = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';

    const log = AuditService.logAuditEvent(action, actor_id, actor_name, actor_role, target_resource, details, ip_address);
    res.json({ success: true, data: log });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de l\'enregistrement de l\'événement d\'audit' });
  }
});
