import { UserRole } from '@/frontend/src/types';

/**
 * Normalizes any database role code (uppercase SQL, legacy name, or custom string)
 * into the application's strict `UserRole` type.
 *
 * Examples:
 * - 'EXECUTIVE_ASSISTANT' | 'EA' -> 'executive_assistant'
 * - 'SECURITY' | 'SECURITY_GUARD' -> 'security_guard'
 * - 'EMPLOYEE' | 'EMPLOYEE / COLLABORATOR' -> 'collaborator'
 * - 'BUILDING_MANAGER' -> 'building_manager'
 * - 'SUPER_ADMIN' -> 'super_admin'
 * - 'GCI_MANAGER' -> 'gci_manager'
 * - 'IT_ADMIN' -> 'it_admin'
 * - 'RECEPTIONIST' -> 'receptionist'
 * - 'DIRECTOR' -> 'director'
 * - 'ADMIN' -> 'admin'
 */
export function normalizeRoleCode(rawCode?: string | null): UserRole {
  if (!rawCode) return 'collaborator';
  const clean = rawCode.trim().toLowerCase();

  switch (clean) {
    case 'super_admin':
    case 'superadmin':
    case 'super administrator':
      return 'super_admin';

    case 'admin':
    case 'administrator':
      return 'admin';

    case 'building_manager':
    case 'buildingmanager':
    case 'building manager':
      return 'building_manager';

    case 'gci_manager':
    case 'gcimanager':
    case 'gci manager':
    case 'gci':
      return 'gci_manager';

    case 'receptionist':
    case 'reception':
      return 'receptionist';

    case 'executive_assistant':
    case 'ea':
    case 'executive assistant':
      return 'executive_assistant';

    case 'director':
    case 'directeur':
      return 'director';

    case 'employee':
    case 'employee / collaborator':
    case 'collaborator':
    case 'collaborateur':
      return 'collaborator';

    case 'it_admin':
    case 'itadmin':
    case 'it administrator':
    case 'it':
      return 'it_admin';

    case 'security':
    case 'security_guard':
    case 'gardien':
    case 'security guard':
      return 'security_guard';

    default:
      // Default to collaborator if unrecognized
      return (clean as UserRole) || 'collaborator';
  }
}
