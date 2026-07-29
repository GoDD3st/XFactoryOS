export type UserRole =
  | 'collaborator'
  | 'receptionist'
  | 'building_manager'
  | 'gci_manager'
  | 'executive_assistant'
  | 'director'
  | 'admin'
  | 'super_admin'
  | 'it_admin'
  | 'security_guard';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  department: string;
  role: UserRole;
  avatar_url?: string;
  badge_number?: string;
  status: 'active' | 'inactive' | 'suspended';
}

export type SeatStatus = 'disponible' | 'réservé' | 'maintenance' | 'occupé' | 'extension';

export interface WorkstationMetadata {
  has_double_screen?: boolean;
  near_window?: boolean;
  is_pmr?: boolean;
  is_quiet_zone?: boolean;
  power_outlet?: boolean;
  docking_station?: string;
  monitor_size?: string;
  network_port?: string;
  notes?: string;
}

export interface Workstation {
  id: string;
  cluster_id: string;
  code: string; // e.g. CL-A-01
  seat_number: number; // 1 to 8
  status: SeatStatus;
  reservable: boolean;
  is_extension: boolean; // Seats 5-8
  visibleToUsers?: boolean; // Toggled by admin
  metadata: WorkstationMetadata;
}

export interface Cluster {
  id: string;
  code: string; // CL-A through CL-G
  name: string;
  description: string;
  is_management_only: boolean;
  enabled: boolean;
  desk_count: number;
  location_zone?: string;
  icon_name?: string;
  workstations: Workstation[];
}

export type ReservationStatus = 'confirmée' | 'check-in' | 'en attente' | 'annulée' | 'terminée';

export interface Reservation {
  id: string;
  user_id: string;
  user_name?: string;
  user_department?: string;
  workstation_id: string;
  workstation_code: string;
  cluster_id: string;
  cluster_name: string;
  reservation_date: string; // YYYY-MM-DD
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  status: ReservationStatus;
  check_in_at?: string | null;
  created_at?: string;
  notes?: string;
  purpose?: string;
}

export interface QuickFilters {
  doubleScreen: boolean;
  nearWindow: boolean;
  pmr: boolean;
  quietZone: boolean;
  statusFreeOnly: boolean;
}

export interface RoleConfig {
  id: UserRole;
  label: string;
  route: string;
  badgeColor: string;
  description: string;
  permissions: string[];
}
