import { z } from 'zod';

/**
 * Zod Input Validation Schemas for XFactory OS API
 * All schemas use `.strict()` to reject unknown/injected fields (mass assignment prevention).
 */

// 1. Reservation Creation Schema
export const CreateReservationSchema = z
  .object({
    workstation_id: z.string().min(1, 'ID du poste requis'),
    workstation_code: z.string().min(1, 'Code du poste requis'),
    cluster_id: z.string().min(1, 'ID cluster requis'),
    cluster_name: z.string().min(1, 'Nom cluster requis'),
    reservation_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (format YYYY-MM-DD requis)'),
    start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Heure de début invalide (HH:mm)'),
    end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Heure de fin invalide (HH:mm)'),
    purpose: z.string().max(500, 'Motif trop long (max 500 caractères)').optional(),
    notes: z.string().max(1000, 'Notes trop longues (max 1000 caractères)').optional(),
  })
  .strict();

// 2. Reservation Status Update Schema
export const UpdateReservationStatusSchema = z
  .object({
    status: z.enum(
      ['confirmée', 'check-in', 'en attente', 'annulée', 'terminée', 'no-show', 'check-out'],
      { message: 'Statut de réservation invalide' }
    ),
    cancel_reason: z.string().max(500).optional(),
  })
  .strict();

// 3. Approval Decision Schema
export const ApprovalDecisionSchema = z
  .object({
    decision: z.enum(['approved', 'rejected', 'needs_info'], {
      message: 'Décision invalide (approved, rejected, or needs_info)',
    }),
    decisionNote: z
      .string()
      .min(3, 'La note de décision doit contenir au moins 3 caractères')
      .max(2000, 'Note trop longue (max 2000 caractères)'),
  })
  .strict();

// 4. Approval Request Creation Schema
export const CreateApprovalRequestSchema = z
  .object({
    reservation_id: z.string().min(1),
    reason: z.string().min(5).max(1000),
    objective: z.string().max(2000).optional(),
    duration_days: z.number().min(1).max(30).optional(),
  })
  .strict();

// 5. Check-In / Check-Out Schema
export const CheckInOutSchema = z
  .object({
    reservationId: z.string().min(1, 'ID de réservation requis'),
    qrToken: z.string().optional(),
  })
  .strict();

// 6. User Auth Login Schema
export const LoginSchema = z
  .object({
    email: z.string().email('Adresse email invalide'),
    password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
  })
  .strict();

// 6b. Admin-created user (FR-11: Super Admin/Admin create/manage users)
export const CreateUserByAdminSchema = z
  .object({
    email: z.string().email('Adresse email OCP invalide').regex(/@ocpgroup\.ma$/, 'Doit être une adresse @ocpgroup.ma'),
    full_name: z.string().min(2, 'Nom complet requis'),
    department: z.string().min(2, 'Département requis'),
    role: z.enum([
      'collaborator', 'receptionist', 'building_manager', 'gci_manager',
      'executive_assistant', 'director', 'admin', 'super_admin', 'it_admin', 'security_guard',
    ]),
  })
  .strict();

export const UpdateUserStatusSchema = z
  .object({
    status: z.enum(['active', 'inactive']),
  })
  .strict();

export const UpdateUserSchema = z
  .object({
    full_name: z.string().min(2).optional(),
    department: z.string().min(2).optional(),
    role: z.enum([
      'collaborator', 'receptionist', 'building_manager', 'gci_manager',
      'executive_assistant', 'director', 'admin', 'super_admin', 'it_admin', 'security_guard',
    ]).optional(),
  })
  .strict();

// 7. User Registration Schema
export const RegisterSchema = z
  .object({
    email: z.string().email('Adresse email OCP invalide'),
    password: z
      .string()
      .min(8, 'Mot de passe de 8 caractères minimum')
      .regex(/[A-Z]/, 'Doit contenir au moins une lettre majuscule')
      .regex(/[0-9]/, 'Doit contenir au moins un chiffre'),
    full_name: z.string().min(2, 'Nom complet requis'),
    department: z.string().min(2, 'Département requis'),
    badge_number: z.string().optional(),
  })
  .strict();

// 8. Workstation Maintenance Toggle Schema
export const MaintenanceToggleSchema = z
  .object({
    isMaintenance: z.boolean(),
    notes: z.string().max(500).optional(),
  })
  .strict();

// 9. Workstation Visibility Toggle Schema
export const VisibilityToggleSchema = z
  .object({
    visibleToUsers: z.boolean(),
  })
  .strict();

// 9b. Cluster Management Lock Toggle Schema (BR-09 — CL-F/CL-G unlock)
export const ManagementLockSchema = z
  .object({
    unlocked: z.boolean(),
  })
  .strict();

// 10. Waiting List Entry Schema
export const CreateWaitingListEntrySchema = z
  .object({
    cluster_preference: z.string().optional(),
    reservation_date: z.string().min(1, 'Date requise'),
    time_slot: z.string().optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();

// 11. System Settings Update Schema (OTP Challenge Request)
export const SystemSettingsUpdateSchema = z
  .object({
    bookingWindowDays: z.number().min(0).max(30).optional(),
    minReservationMinutes: z.number().min(5).max(480).optional(),
    maxReservationMinutes: z.number().min(30).max(1440).optional(),
    maxReservationDaysWithoutApproval: z.number().min(1).max(30).optional(),
    maxReservationsPerUserPerDay: z.number().min(1).max(20).optional(),
    maxReservationsPerUserPerWeek: z.number().min(1).max(50).optional(),
    workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    workingDays: z.array(z.number().min(1).max(7)).optional(),
    bypassRoles: z.array(z.string()).optional(),
    allowWeekendBooking: z.boolean().optional(),
    allowHolidayBooking: z.boolean().optional(),
    holidays: z.array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ)'),
        label: z.string().min(1).max(120),
      })
    ).optional(),
    closedDates: z.array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ)'),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        reason: z.string().max(500).optional(),
      })
    ).optional(),
    noShowDelayMinutes: z.number().min(5).max(120).optional(),
    extensionSeatsVisibleByDefault: z.boolean().optional(),
    managementClustersEnabled: z.boolean().optional(),
    theme: z.enum(['dark', 'light']).optional(),
    siteName: z.string().optional(),
  })
  .strict();

// 11b. OTP Confirmation Schema (1-minute security window)
export const ConfirmSettingsUpdateSchema = z
  .object({
    challengeId: z.string().min(1, 'ID du challenge OTP requis'),
    otpCode: z.string().length(6, 'Le code OTP doit contenir exactement 6 chiffres'),
  })
  .strict();

// 12. AI Query Schema
export const AIQuerySchema = z
  .object({
    query: z.string().min(2, 'Question trop courte').max(1000, 'Question trop longue'),
  })
  .strict();

// 13. Notification Creation Schema
export const CreateNotificationSchema = z
  .object({
    title: z.string().min(1).max(200),
    message: z.string().min(1).max(1000),
    type: z.enum(['info', 'warning', 'success', 'urgent']).optional(),
  })
  .strict();

// 14. Hardware Reset Schema
export const HardwareResetSchema = z
  .object({
    workstation_code: z.string().min(1),
  })
  .strict();

// 15. Cluster VIP Status Toggle Schema
export const ClusterVipToggleSchema = z
  .object({
    isVip: z.boolean(),
  })
  .strict();

// 16. Cluster VIP Member Assignment Schema
export const ClusterVipMemberSchema = z
  .object({
    userId: z.string().min(1, 'ID utilisateur requis'),
  })
  .strict();

// 17. Full Workstation Update Schema (admin edit modal)
export const WorkstationUpdateSchema = z
  .object({
    status: z.enum(['disponible', 'maintenance', 'management_reserved', 'occupé', 'réservé']).optional(),
    reservable: z.boolean().optional(),
    metadataPatch: z
      .object({
        visibleToUsers: z.boolean().optional(),
        near_window: z.boolean().optional(),
        is_pmr: z.boolean().optional(),
        is_quiet_zone: z.boolean().optional(),
        notes: z.string().max(500).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
