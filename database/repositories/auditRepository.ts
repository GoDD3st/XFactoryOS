import { supabase } from '../client';
import { AuditLogEntry, UserRole } from '@/frontend/src/types';

export class AuditRepository {
  static async getAuditLogs(): Promise<AuditLogEntry[]> {
    try {
      const { data, error } = await supabase
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
      await supabase.from('audit_logs').insert({
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
