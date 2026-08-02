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

export type SeatStatus = 'disponible' | 'réservé' | 'maintenance' | 'occupé' | 'extension' | 'management_reserved';

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

export type ReservationStatus = 'confirmée' | 'check-in' | 'en attente' | 'annulée' | 'terminée' | 'no-show' | 'check-out';

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
  check_out_at?: string | null;
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

export interface WaitingListEntry {
  id: string;
  user_id: string;
  user_name: string;
  user_department: string;
  cluster_preference?: string;
  reservation_date: string;
  time_slot: string;
  notes?: string;
  created_at: string;
  status: 'waiting' | 'offered' | 'expired' | 'fulfilled';
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  actor_id: string;
  actor_name: string;
  actor_role: UserRole;
  target_resource: string;
  details: string;
  ip_address?: string;
}

export interface UserNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'alert';
  read: boolean;
  created_at: string;
}

export interface AIAssistantMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  suggestions?: string[];
}

export interface HardwareDiagnosticsInfo {
  workstation_code: string;
  cluster_code: string;
  rj45_port: string;
  link_speed: string;
  port_status: 'online' | 'degraded' | 'offline';
  dock_power_delivery: string;
  display_count: number;
  last_ping: string;
}

export interface EvacuationOccupant {
  id: string;
  name: string;
  role: string;
  department: string;
  workstation_code: string;
  cluster_name: string;
  check_in_time: string;
  type: 'employee' | 'contractor' | 'visitor';
  accounted: boolean;
}

export interface VisitorBadge {
  badge_id: string;
  visitor_name: string;
  visitor_company: string;
  host_name: string;
  host_department: string;
  visit_date: string;
  qr_code: string;
  access_zone: string;
}

export interface WorkstationSearchQuery {
  keyword?: string;
  clusterId?: string;
  status?: SeatStatus;
  hasDoubleScreen?: boolean;
  nearWindow?: boolean;
  isPMR?: boolean;
  isQuietZone?: boolean;
  date?: string;
}

export interface ReservationSearchQuery {
  keyword?: string;
  userId?: string;
  clusterId?: string;
  status?: ReservationStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface SystemSettings {
  id?: string;
  bookingWindowDays: number; // e.g. 2 days delay window
  minReservationMinutes: number; // e.g. 30 min
  maxReservationMinutes: number; // e.g. 480 min (8h) — max single slot duration
  maxReservationDaysWithoutApproval: number; // e.g. 2 business days
  maxReservationsPerUserPerDay: number; // e.g. 2
  maxReservationsPerUserPerWeek: number; // e.g. 5
  workingHoursStart: string; // e.g. '08:00'
  workingHoursEnd: string; // e.g. '18:00'
  workingDays: number[]; // e.g. [1,2,3,4,5]
  bypassRoles: UserRole[]; // e.g. ['admin', 'super_admin', 'director', 'executive_assistant']
  allowWeekendBooking: boolean;
  allowHolidayBooking: boolean;
  noShowDelayMinutes: number;
  extensionSeatsVisibleByDefault: boolean;
  managementClustersEnabled: boolean;
  theme: 'dark' | 'light';
  siteName: string;
  configVersion?: number;
  updated_at?: string;
  updated_by?: string;
}

export interface ApprovalRequest {
  id: string;
  reservation_id: string;
  requester_id: string;
  requester_name: string;
  user_department?: string;
  approver_role: 'building_manager' | 'executive_assistant' | 'director' | 'admin' | 'super_admin';
  status: 'pending' | 'approved' | 'rejected' | 'needs_info';
  reason: string;
  objective?: string;
  decision_note?: string;
  created_at: string;
  decided_at?: string;
  reservation_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  duration_days?: number;
  workstation_code?: string;
  cluster_name?: string;
}

