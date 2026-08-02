import { AuditLogEntry, UserRole } from '@/frontend/src/types';
import { AuditRepository } from '@/database/repositories/auditRepository';

export class AuditService {
  static getAuditLogs(): AuditLogEntry[] {
    AuditRepository.getAuditLogs().then((data) => {
      if (typeof window !== 'undefined' && data.length > 0) {
        localStorage.setItem('xfactory_audit_logs_v2', JSON.stringify(data));
      }
    });

    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('xfactory_audit_logs_v2');
      if (cached) return JSON.parse(cached);
    }
    return [];
  }

  static logAuditEvent(
    action: string,
    actorId: string,
    actorName: string,
    actorRole: string,
    targetResource: string,
    details: string,
    ipAddress: string = '10.120.4.18'
  ): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      action,
      actor_id: actorId,
      actor_name: actorName,
      actor_role: actorRole as UserRole,
      target_resource: targetResource,
      details,
      ip_address: ipAddress,
    };

    AuditRepository.logEvent(action, actorId, actorName, actorRole, targetResource, details, ipAddress);

    if (typeof window !== 'undefined') {
      const current = this.getAuditLogs();
      localStorage.setItem('xfactory_audit_logs_v2', JSON.stringify([entry, ...current.slice(0, 99)]));
      window.dispatchEvent(new CustomEvent('xfactory_audit_logged', { detail: entry }));
    }

    return entry;
  }
}

export const getAuditLogs = AuditService.getAuditLogs.bind(AuditService);
export const logAuditEvent = AuditService.logAuditEvent.bind(AuditService);
