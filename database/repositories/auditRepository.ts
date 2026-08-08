import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../client';
import { AuditLogEntry, UserRole } from '@/frontend/src/types';

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
    ipAddress: string = '10.120.4.18'
  ): Promise<AuditLogEntry> {
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
    };
  }
}
