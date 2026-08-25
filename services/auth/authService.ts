import { UserRole, UserProfile, RoleConfig } from '@/frontend/src/types';
import { LOCAL_STORAGE_ROLE_KEY } from '@/services/supabase/supabaseClient';

/**
 * Role PRESENTATION, and the demo-mode identities. Not authorization.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE USING ANYTHING IN THIS FILE TO DECIDE WHAT A USER MAY DO.
 *
 * Nothing here grants or checks a permission. Real authorization is:
 *
 *   1. `requirePermission(...)` in backend/middleware/rbacMiddleware.ts, which reads the
 *      `role_permissions` table - this is the gate that actually decides;
 *   2. Row Level Security in database/rls/policies.sql, as the last line if a query ever
 *      reaches Postgres without passing through the API.
 *
 * See README §9. This file only answers "what colour is this role's badge, and what is it
 * called in French".
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * Display metadata per role: label, home route, badge colour, description.
 *
 * WARNING - the `permissions` array on each entry is DECORATIVE. It is human-readable prose for
 * the role description panel, it is not consulted by any guard, and it is not kept in step with
 * `role_permissions`. Adding a string here grants nothing; removing one revokes nothing. It has
 * been left in place because the Roles screen renders it, but treat it as documentation of intent
 * rather than as configuration - if the two ever disagree, the database is right.
 */
export const ROLE_CONFIGS: Record<UserRole, RoleConfig> = {
  collaborator: {
    id: 'collaborator',
    label: 'Collaborateur',
    route: '/me',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    description: 'Accès espace collaborateur, réservation bureaux, calendrier & badge.',
    permissions: ['book_desks', 'view_my_reservations', 'check_in_own']
  },
  receptionist: {
    id: 'receptionist',
    label: 'Réceptionniste',
    route: '/reception',
    badgeColor: 'bg-teal-100 text-teal-800 border-teal-300',
    description: 'Accueil visiteurs Safi, vérification check-in bureau, badges temporaires.',
    permissions: ['view_all_arrivals', 'manual_checkin', 'issue_guest_badges']
  },
  building_manager: {
    id: 'building_manager',
    label: 'Building Manager',
    route: '/building',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
    description: 'Supervision occupation site, maintenance clusters, taux occupation & énergie.',
    permissions: ['toggle_maintenance', 'view_heatmaps', 'manage_facilities']
  },
  gci_manager: {
    id: 'gci_manager',
    label: 'GCI Governance Manager',
    route: '/gci',
    badgeColor: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    description: 'Conformité Gouvernance Chimie, gestion clusters restreints & quotas.',
    permissions: ['manage_gci_clusters', 'audit_logs', 'export_compliance']
  },
  executive_assistant: {
    id: 'executive_assistant',
    label: 'Assistant Direction',
    route: '/approvals',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
    description: 'Validation réservations VIP, gestion clusters F & G, demandes prioritaires.',
    permissions: ['approve_vip_requests', 'book_vip_clusters', 'manage_schedules']
  },
  director: {
    id: 'director',
    label: 'Directeur de Site',
    route: '/direction',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-300',
    description: 'Tableau de bord exécutif, KPIs stratégiques, rapports occupation Safi.',
    permissions: ['view_executive_kpis', 'export_executive_reports']
  },
  admin: {
    id: 'admin',
    label: 'Administrateur',
    route: '/admin',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    description: 'Vue 8 postes extension, configuration clusters, gestion utilisateurs & RLS.',
    permissions: ['view_8_postes', 'toggle_extension_desks', 'manage_users', 'cancel_any_reservation']
  },
  super_admin: {
    id: 'super_admin',
    label: 'Super Admin',
    route: '/super-admin',
    badgeColor: 'bg-violet-100 text-violet-800 border-violet-300',
    description: 'Contrôle système total, synchronisation Supabase, journaux sécurité & API.',
    permissions: ['full_system_override', 'view_8_postes', 'db_sync_control', 'manage_all_roles']
  },
  it_admin: {
    id: 'it_admin',
    label: 'IT Admin',
    route: '/it',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
    description: 'Gestion parc matériel (écrans, docks, ports RJ45) & capteurs IoT.',
    permissions: ['manage_hardware_metadata', 'view_network_status', 'diagnostic_tools']
  },
  security_guard: {
    id: 'security_guard',
    label: 'Gardien Sécurité',
    route: '/security',
    badgeColor: 'bg-slate-200 text-slate-800 border-slate-400',
    description: 'Contrôle accès, badges en direct, liste d’évacuation urgence.',
    permissions: ['view_security_logs', 'evacuation_roster', 'badge_validation']
  }
};

/**
 * Fabricated identities, one per role, used ONLY when DEMO_MODE is on.
 *
 * In a real session the profile comes from Supabase Auth and is resolved server-side by
 * `fetchRealUserProfile` - the browser never chooses who it is. These rows exist so the ten role
 * views can be demonstrated and QA'd without ten real accounts.
 *
 * Their ids are human-readable strings ('usr-dir-1'), NOT uuids, which is deliberate and has a
 * consequence worth knowing: anything writing an actor id to Postgres has to tolerate them, since
 * `audit_logs.actor_id` is a uuid foreign key. See the id-coercion note in auditRepository.ts.
 * If you add a demo user, keep that pattern rather than inventing a uuid, so the demo path stays
 * visibly distinct from a real one in the data.
 */
export const DEFAULT_USERS_BY_ROLE: Record<UserRole, UserProfile> = {
  collaborator: {
    id: 'usr-collab-1',
    email: 'youssef.elamrani@ocpgroup.ma',
    full_name: 'Youssef El Amrani',
    department: 'Digital Factory',
    role: 'collaborator',
    badge_number: 'XF-SAF-8821',
    status: 'active'
  },
  receptionist: {
    id: 'usr-recep-1',
    email: 'reception.safi@ocpgroup.ma',
    full_name: 'Khadija Mansour',
    department: 'Accueil & Services Bâtiment',
    role: 'receptionist',
    badge_number: 'XF-SAF-0012',
    status: 'active'
  },
  building_manager: {
    id: 'usr-bm-1',
    email: 'facilities.safi@ocpgroup.ma',
    full_name: 'Mehdi Chraibi',
    department: 'Facility & Asset Management',
    role: 'building_manager',
    badge_number: 'XF-SAF-0544',
    status: 'active'
  },
  gci_manager: {
    id: 'usr-gci-1',
    email: 'gci.governance@ocpgroup.ma',
    full_name: 'Fatima-Zahra Benali',
    department: 'Gouvernance Chimie & Intégration',
    role: 'gci_manager',
    badge_number: 'XF-SAF-1090',
    status: 'active'
  },
  executive_assistant: {
    id: 'usr-ea-1',
    email: 'direction.assistant@ocpgroup.ma',
    full_name: 'Sanaa Berrada',
    department: 'Secrétariat Général & Direction',
    role: 'executive_assistant',
    badge_number: 'XF-SAF-0005',
    status: 'active'
  },
  director: {
    id: 'usr-dir-1',
    email: 'directeur.safi@ocpgroup.ma',
    full_name: 'Dr. Hassan Alami',
    department: 'Direction Générale',
    role: 'director',
    badge_number: 'XF-SAF-0001',
    status: 'active'
  },
  admin: {
    id: 'usr-admin-1',
    email: 'admin.xfactory@ocpgroup.ma',
    full_name: 'Omar Bennani',
    department: 'Systèmes d’Information & XFactory',
    role: 'admin',
    badge_number: 'XF-SAF-9901',
    status: 'active'
  },
  super_admin: {
    id: 'usr-sa-1',
    email: 'superadmin@ocpgroup.ma',
    full_name: 'Amine Benchekroun',
    department: 'Architecte Enterprise & Cloud',
    role: 'super_admin',
    badge_number: 'XF-SAF-0000',
    status: 'active'
  },
  it_admin: {
    id: 'usr-it-1',
    email: 'it.infrastructure@ocpgroup.ma',
    full_name: 'Reda Laraki',
    department: 'IT Infrastructure & Support',
    role: 'it_admin',
    badge_number: 'XF-SAF-4432',
    status: 'active'
  },
  security_guard: {
    id: 'usr-sec-1',
    email: 'securite.port@ocpgroup.ma',
    full_name: 'Tariq Kadiri',
    department: 'Sûreté Industrielle & Contrôle Accès',
    role: 'security_guard',
    badge_number: 'XF-SAF-0099',
    status: 'active'
  }
};

/**
 * Demo-mode role preference and the lookups around it.
 *
 * Every method here is a local-storage or in-memory read. None of it reaches the network, none of
 * it is trusted by the server, and none of it survives into a real session: with DEMO_MODE off,
 * AuthContext takes the role from the profile the API resolved from the JWT and ignores the
 * preference stored here.
 */
export class AuthService {
  /**
   * The role the demo UI should open on.
   *
   * Business context: the role switcher is a QA affordance - it lets one person walk through all
   * ten SRS role views in a review without ten accounts. Remembering the last choice means a
   * reload does not throw the reviewer back to the collaborator view mid-demo.
   *
   * Falls back to 'collaborator' when nothing is stored, when the stored value is not a role we
   * still ship (a rename must not strand the UI on a role that no longer exists), and when
   * localStorage throws - which it does in private-browsing modes and when storage is full.
   */
  static getInitialRole(): UserRole {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(LOCAL_STORAGE_ROLE_KEY) as UserRole;
        if (saved && ROLE_CONFIGS[saved]) {
          return saved;
        }
      }
    } catch (e) {
      console.error('AuthService role error:', e);
    }
    return 'collaborator';
  }

  /**
   * The fabricated profile for a role, for DEMO_MODE only.
   *
   * Defaults to the collaborator profile rather than throwing: an unknown role here means the
   * demo switcher and this map have drifted apart, and degrading to the least-privileged identity
   * is the safe direction to fail in.
   */
  static getUserForRole(role: UserRole): UserProfile {
    return DEFAULT_USERS_BY_ROLE[role] || DEFAULT_USERS_BY_ROLE.collaborator;
  }

  /**
   * Remembers the demo role across reloads. Swallows storage failures on purpose - losing a QA
   * convenience must never break the render path that called it.
   */
  static saveRolePreference(role: UserRole): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCAL_STORAGE_ROLE_KEY, role);
      }
    } catch (e) {
      console.error('AuthService save error:', e);
    }
  }

  static getAllRoles(): typeof ROLE_CONFIGS {
    return ROLE_CONFIGS;
  }
}
