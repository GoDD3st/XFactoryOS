import { AuditLogEntry, UserRole } from '@/frontend/src/types';
import { AuditRepository } from '@/database/repositories/auditRepository';

export class AuditService {
  /**
   * Server-side (backend route): reads straight from Supabase (service-role client), the
   * authoritative source. Browser-side: returns the cached list immediately for a fast paint,
   * then refreshes the cache in the background — callers needing the live list from the browser
   * should await AuditRepository.getAuditLogs() (or the /api/audit route) directly.
   */
  static getAuditLogs(): AuditLogEntry[] | Promise<AuditLogEntry[]> {
    if (typeof window === 'undefined') {
      return AuditRepository.getAuditLogs();
    }

    AuditRepository.getAuditLogs().then((data) => {
      if (data.length > 0) {
        localStorage.setItem('xfactory_audit_logs_v2', JSON.stringify(data));
      }
    });

    const cached = localStorage.getItem('xfactory_audit_logs_v2');
    if (cached) return JSON.parse(cached);
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
      // Browser branch of getAuditLogs() always returns synchronously (never a Promise).
      const current = this.getAuditLogs() as AuditLogEntry[];
      localStorage.setItem('xfactory_audit_logs_v2', JSON.stringify([entry, ...current.slice(0, 99)]));
      window.dispatchEvent(new CustomEvent('xfactory_audit_logged', { detail: entry }));
    }

    return entry;
  }
}

export const getAuditLogs = AuditService.getAuditLogs.bind(AuditService);
export const logAuditEvent = AuditService.logAuditEvent.bind(AuditService);
