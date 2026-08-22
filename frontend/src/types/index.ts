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

// 'partiel' is a derived overlay status, never stored: a seat with bookings that leave a bookable
// gap in the business day. 'réservé' now means taken for the WHOLE day, which is the only case
// where queuing for a no-show is the sole way in. See services/workspaces/seatAvailability.ts.
export type SeatStatus = 'disponible' | 'partiel' | 'réservé' | 'maintenance' | 'occupé' | 'extension' | 'management_reserved' | 'disabled';

/** Per-seat availability detail for the selected date/window, attached by the overlay. */
export interface SeatAvailabilityInfo {
  /** Occupied stretches on the selected date, as "HH:mm - HH:mm" pairs. */
  busy: { start: string; end: string }[];
  /** Bookable stretches left in the business day. */
  gaps: { start: string; end: string }[];
  /** Whether the currently selected window is bookable as-is. */
  windowFree: boolean;
  /**
   * The CALLER'S OWN booking on this seat for the selected date, when there is one.
   *
   * Deliberately only the caller's. The overlay could just as easily carry every occupant's name
   * and id - it has the rows in hand - but that would put "who is sitting here" in front of every
   * colleague who clicks a desk, which is a disclosure this application has never made and is not
   * ours to start. A seat taken by someone else stays anonymous: busy hours and nothing more.
   *
   * Populated only when `currentUserId` is passed to fetchClustersWithOverlays; the read-only
   * dashboards omit it and get undefined, which is the correct answer for "is this mine" when
   * nobody asked on behalf of a user.
   */
  ownReservation?: OwnSeatReservation;
}

/** The subset of a Reservation the seat dialog needs to describe a booking back to its owner. */
export interface OwnSeatReservation {
  id: string;
  /** First and last day - equal for a single-day booking. */
  date: string;
  endDate?: string;
  /** The hours booked on the SELECTED date, which on a middle day of a range is the whole day. */
  start: string;
  end: string;
  status: ReservationStatus;
  purpose?: string;
  notes?: string;
  checkInAt?: string | null;
}

export interface WorkstationMetadata {
  near_window?: boolean;
  is_pmr?: boolean;
  is_quiet_zone?: boolean;
  notes?: string;
  // Set when a seat is added as temporary via the "Ajouter un poste" form - temp_end_at drives
  // the backend expiry sweep (WorkspaceService.expireTemporarySeats) that auto-disables it.
  is_temporary?: boolean;
  temp_start_at?: string;
  temp_end_at?: string;
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
  /** Populated by fetchClustersWithOverlays for the requested date/window. */
  availability?: SeatAvailabilityInfo;
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
  /** User ids individually assigned to this VIP cluster (BR-07 allowlist), populated when management_reserved */
  vipMemberIds?: string[];
}

export type ReservationStatus = 'confirmée' | 'check-in' | 'en attente' | 'annulée' | 'rejetée' | 'terminée' | 'no-show' | 'check-out';

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
  end_date?: string; // YYYY-MM-DD - last day of a multi-day booking; absent/equal to reservation_date for single-day
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  status: ReservationStatus;
  check_in_at?: string | null;
  check_out_at?: string | null;
  created_at?: string;
  notes?: string;
  purpose?: string;
}

export interface RoleConfig {
  id: UserRole;
  label: string;
  route: string;
  badgeColor: string;
  description: string;
  permissions: string[];
}

/**
 * BPMN D5 "zone / equipement" preferences, checked against WorkstationMetadata before a freed
 * desk is offered. Only `true` constrains: undefined/false means "no opinion", so someone who
 * didn't ask for a quiet desk can still be offered one.
 *
 * Deliberately the same three flags as WorkstationSearchQuery - one preference vocabulary for
 * searching and for queuing.
 */
export interface WaitingListPreferences {
  nearWindow?: boolean;
  isPMR?: boolean;
  isQuietZone?: boolean;
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
  status: 'waiting' | 'offered' | 'expired' | 'fulfilled' | 'cancelled';
  /** Specific desk being queued for. Absent = any desk in cluster_preference. */
  requested_workstation_id?: string;
  requested_workstation_code?: string;
  offered_workstation_id?: string;
  offered_workstation_code?: string;
  offer_expires_at?: string;
  /** Attribute preferences the matching engine enforces. Absent = no attribute constraints. */
  preferences?: WaitingListPreferences;
  /**
   * The hours the offer is actually good for - the requested slot narrowed to the hours the
   * freed desk is available. Set with the offer; this, not `time_slot`, is what acceptOffer books.
   */
  offered_time_slot?: string;
}

export type AuditCategory =
  | 'auth'
  | 'reservation'
  | 'checkinout'
  | 'noshow'
  | 'approval'
  | 'role_change'
  | 'settings'
  | 'cluster_management'
  | 'export'
  | 'ai_query';

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
  category?: AuditCategory;
}

export interface UserNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'alert';
  read: boolean;
  created_at: string;
  /**
   * Reservation this notification is about, when there is one. notifications.reservation_id has
   * always been populated by sendNotification but was dropped on the way to the client, so the
   * UI had no way to turn a message into an action.
   */
  reservation_id?: string;
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

export interface HolidayEntry {
  date: string; // 'YYYY-MM-DD'
  label: string; // e.g. 'Aïd Al Fitr'
}

export interface ClosedDateEntry {
  date: string; // 'YYYY-MM-DD' - start of the closure
  endDate?: string; // optional - last day of the closure (inclusive), defaults to `date`
  reason?: string; // e.g. 'Maintenance électrique bâtiment'
}

export interface SystemSettings {
  id?: string;
  bookingWindowDays: number; // e.g. 2 days delay window
  minReservationMinutes: number; // e.g. 30 min
  maxReservationMinutes: number; // e.g. 480 min (8h) - max single slot duration
  maxReservationDaysWithoutApproval: number; // e.g. 2 business days
  maxReservationsPerUserPerDay: number; // e.g. 2
  maxReservationsPerUserPerWeek: number; // e.g. 5
  workingHoursStart: string; // e.g. '08:00'
  workingHoursEnd: string; // e.g. '18:00'
  workingDays: number[]; // e.g. [1,2,3,4,5]
  bypassRoles: UserRole[]; // e.g. ['admin', 'super_admin', 'director', 'executive_assistant']
  allowWeekendBooking: boolean;
  allowHolidayBooking: boolean;
  holidays: HolidayEntry[]; // Super Admin-managed public holidays (dates shift yearly, e.g. Islamic calendar)
  closedDates: ClosedDateEntry[]; // Super Admin "lockdown" days - blocks new reservations only, rest of the site keeps working
  noShowDelayMinutes: number;
  extensionSeatsVisibleByDefault: boolean;
  managementClustersEnabled: boolean;
  theme: 'dark' | 'light';
  siteName: string;
  /** Validated image data URI for the header mark. Null/absent falls back to the text initials. */
  siteLogoDataUrl?: string | null;
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
  /**
   * Occupancy hours the requester is asking for: the daily window multiplied by the number of
   * days, NOT the wall-clock span. A 5-day booking of 08:00-18:00 is 50 hours of desk time, not
   * 120 - the approver is deciding on occupancy, so that is the figure to show them.
   */
  total_hours?: number;
  workstation_code?: string;
  cluster_name?: string;
}

// BR-09 / SRS §14.4: request/approve/refuse access to a locked management cluster.
export interface ClusterAuthorization {
  id: string;
  cluster_id: string;
  cluster_code?: string;
  cluster_name?: string;
  requested_by: string;
  requester_name?: string;
  requester_department?: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'INFO_REQUESTED';
  starts_at?: string | null;
  ends_at?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  decision_note?: string | null;
  created_at: string;
}

// SRS §13 "Gérer rôles" - documented RBAC policy record (roles/permissions/role_permissions).
export interface RoleWithCount {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_critical: boolean;
  user_count: number;
  created_at: string;
}

export interface PermissionCell {
  permission_id: string;
  permission_code: string;
  domain: string;
  description: string | null;
  can_read: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_approve: boolean;
}

export interface RolePermissionRow {
  role_id: string;
  role_code: string;
  role_name: string;
  permissions: PermissionCell[];
}

