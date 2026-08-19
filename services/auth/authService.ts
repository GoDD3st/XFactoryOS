import { UserRole, UserProfile, RoleConfig } from '@/frontend/src/types';
import { LOCAL_STORAGE_ROLE_KEY } from '@/services/supabase/supabaseClient';

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

export class AuthService {
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

  static getUserForRole(role: UserRole): UserProfile {
    return DEFAULT_USERS_BY_ROLE[role] || DEFAULT_USERS_BY_ROLE.collaborator;
  }

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
