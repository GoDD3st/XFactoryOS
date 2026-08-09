import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../client';
import { AuditLogEntry, AuditCategory, UserRole } from '@/frontend/src/types';

// Default category per action, for the actions where the action alone is unambiguous. CREATE/
// UPDATE are used across many different domains (reservations, workstations, user accounts...),
// so those call sites must pass an explicit category — this table only covers the actions that
// mean exactly one thing everywhere they're used.
const ACTION_DEFAULT_CATEGORY: Partial<Record<string, AuditCategory>> = {
  LOGIN: 'auth',
  LOGOUT: 'auth',
  CHECK_IN: 'checkinout',
  CHECK_OUT: 'checkinout',
  NO_SHOW: 'noshow',
  APPROVE: 'approval',
  REJECT: 'approval',
  ROLE_CHANGE: 'role_change',
  SETTINGS_CHANGE: 'settings',
  CLUSTER_ACTIVATE: 'cluster_management',
  CLUSTER_DEACTIVATE: 'cluster_management',
  EXPORT: 'export',
  AI_QUERY: 'ai_query',
};

// audit_logs read is restricted to SUPER_ADMIN/SECURITY/IT_ADMIN by RLS (p_audit_read), which
// requires a real Supabase Auth session. Server-side callers (the /api/audit route, which
// enforces its own broader RBAC) should bypass RLS via the service-role client instead of
// silently getting an empty result back.
async function resolveClient(): Promise<SupabaseClient> {
  if (typeof window === 'undefined') {
    const { getAdminClient } = await import('../serverClient');
    const admin = getAdminClient();
    if (admin) return admin;
  }
  return supabase;
}

export class AuditRepository {
  static async getAuditLogs(): Promise<AuditLogEntry[]> {
    try {
      const db = await resolveClient();
      const { data, error } = await db
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error || !data) return [];

      return data.map((l: any) => ({
        id: l.id,
        timestamp: l.created_at,
        action: l.action,
        actor_id: l.actor_id || 'system',
        actor_name: l.before?.actor_name || 'Système XFactory',
        actor_role: (l.before?.actor_role as UserRole) || 'admin',
        target_resource: l.entity_id || l.entity_type || 'SYSTEM',
        details: l.after?.details || `${l.action} sur ${l.entity_type}`,
        ip_address: l.ip_address || '10.120.4.18',
        // Rows written before the category column existed (or by a call site that predates a
        // given category) fall back to the action-based default, or 'reservation' as the last
        // resort for legacy CREATE/UPDATE rows — better than leaving them uncategorized and
        // invisible to everyone.
        category: (l.category as AuditCategory) || ACTION_DEFAULT_CATEGORY[l.action] || 'reservation',
      }));
    } catch (err) {
      console.warn('Fetch audit logs fallback:', err);
      return [];
    }
  }

  static async logEvent(
    action: string,
    actorId: string,
    actorName: string,
    actorRole: UserRole | string,
    targetResource: string,
    details: string,
    ipAddress: string = '10.120.4.18',
    category?: AuditCategory
  ): Promise<AuditLogEntry> {
    // CREATE/UPDATE/DELETE are used across many domains (reservations, workstations, user
    // accounts...) so those call sites must pass `category` explicitly — everything else has an
    // unambiguous default (see ACTION_DEFAULT_CATEGORY).
    const resolvedCategory = category || ACTION_DEFAULT_CATEGORY[action] || 'reservation';

    try {
      const db = await resolveClient();
      const { isValidUuid } = await import('../utils/uuid');
      await db.from('audit_logs').insert({
        // actor_id is a uuid FK to users.id — callers sometimes pass placeholder strings like
        // 'system' or 'admin-current' (not real user ids), which fail the FK/type constraint
        // outright if inserted as-is. Fall back to null for those instead of failing the write.
        actor_id: isValidUuid(actorId) ? actorId : null,
        action: action,
        entity_type: targetResource,
        before: { actor_name: actorName, actor_role: actorRole },
        after: { details: details },
        ip_address: ipAddress,
        category: resolvedCategory,
      });
    } catch (err) {
      console.warn('Log audit event DB notice:', err);
    }

    return {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      action,
      actor_id: actorId,
      actor_name: actorName,
      actor_role: (actorRole as UserRole) || 'admin',
      target_resource: targetResource,
      details,
      ip_address: ipAddress,
      category: resolvedCategory,
    };
  }
}
