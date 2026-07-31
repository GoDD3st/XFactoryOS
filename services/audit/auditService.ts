import { AuditLogEntry, UserRole } from '@/frontend/src/types';

const STORAGE_KEY = 'xfactory_audit_logs';

const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'log-001',
    timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
    action: 'RESERVATION_CREATED',
    actor_id: 'usr-1',
    actor_name: 'Youssef El Amrani',
    actor_role: 'collaborator',
    target_resource: 'CL-A-02',
    details: 'Réservation créée pour le sprint planning Digital Twin Safi',
    ip_address: '10.120.45.12',
  },
  {
    id: 'log-002',
    timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
    action: 'CHECK_IN_PERFORMED',
    actor_id: 'usr-2',
    actor_name: 'Fatima-Zahra Benali',
    actor_role: 'gci_manager',
    target_resource: 'CL-E-01',
    details: 'Check-in effectué avec succès à l\'arrivée sur poste',
    ip_address: '10.120.45.88',
  },
  {
    id: 'log-003',
    timestamp: new Date(Date.now() - 3600000 * 1).toISOString(),
    action: 'SEAT_MAINTENANCE_TOGGLED',
    actor_id: 'usr-10',
    actor_name: 'Super Admin Safi',
    actor_role: 'super_admin',
    target_resource: 'CL-B-04',
    details: 'Poste mis en maintenance suite au remplacement écran 4K',
    ip_address: '10.120.10.1',
  },
];

export function getAuditLogs(): AuditLogEntry[] {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_AUDIT_LOGS));
    }
  } catch (err) {
    console.error('Error loading audit logs:', err);
  }
  return INITIAL_AUDIT_LOGS;
}

export function logAuditEvent(
  action: string,
  actor_id: string,
  actor_name: string,
  actor_role: UserRole,
  target_resource: string,
  details: string,
  ip_address = '10.120.0.1'
): AuditLogEntry {
  const newLog: AuditLogEntry = {
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action,
    actor_id,
    actor_name,
    actor_role,
    target_resource,
    details,
    ip_address,
  };

  const logs = getAuditLogs();
  const updated = [newLog, ...logs];
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('xfactory_audit_logs_changed', { detail: updated }));
    }
  } catch (err) {
    console.error('Error saving audit log:', err);
  }
  return newLog;
}

export class AuditService {
  static getAuditLogs = getAuditLogs;
  static logAuditEvent = logAuditEvent;
}
