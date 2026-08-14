import { z } from 'zod';
import { sanitizedString, sanitizedOptionalString } from '../utils/sanitize';

/**
 * Zod Input Validation Schemas for XFactory OS API
 * All schemas use `.strict()` to reject unknown/injected fields (mass assignment prevention).
 * Every free-text field (names, reasons, notes, questions...) uses sanitizedString/
 * sanitizedOptionalString — see backend/utils/sanitize.ts — which strips HTML/script markup
 * before the value is ever persisted, so nothing a user submits can later render as markup
 * regardless of where it's displayed (dashboard, export, notification, AI chat...).
 */

// 1. Reservation Creation Schema
export const CreateReservationSchema = z
  .object({
    workstation_id: z.string().min(1, 'ID du poste requis'),
    workstation_code: sanitizedString({ min: 1, max: 50, minMessage: 'Code du poste requis' }),
    cluster_id: z.string().min(1, 'ID cluster requis'),
    cluster_name: sanitizedString({ min: 1, max: 100, minMessage: 'Nom cluster requis' }),
    reservation_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (format YYYY-MM-DD requis)'),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de fin invalide (format YYYY-MM-DD requis)')
      .optional(),
    start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Heure de début invalide (HH:mm)'),
    end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Heure de fin invalide (HH:mm)'),
    purpose: sanitizedOptionalString(500, 'Motif trop long (max 500 caractères)'),
    notes: sanitizedOptionalString(1000, 'Notes trop longues (max 1000 caractères)'),
  })
  .strict()
  .refine((data) => !data.end_date || data.end_date >= data.reservation_date, {
    message: 'La date de fin doit être postérieure ou égale à la date de début',
    path: ['end_date'],
  });

// 2. Reservation Status Update Schema
export const UpdateReservationStatusSchema = z
  .object({
    status: z.enum(
      ['confirmée', 'check-in', 'en attente', 'annulée', 'terminée', 'no-show', 'check-out'],
      { message: 'Statut de réservation invalide' }
    ),
    cancel_reason: sanitizedOptionalString(500),
  })
  .strict();

// 3. Approval Decision Schema
export const ApprovalDecisionSchema = z
  .object({
    decision: z.enum(['approved', 'rejected', 'needs_info'], {
      message: 'Décision invalide (approved, rejected, or needs_info)',
    }),
    decisionNote: sanitizedString({
      min: 3,
      max: 2000,
      minMessage: 'La note de décision doit contenir au moins 3 caractères',
      maxMessage: 'Note trop longue (max 2000 caractères)',
    }),
  })
  .strict();

// 4. Approval Request Creation Schema
export const CreateApprovalRequestSchema = z
  .object({
    reservation_id: z.string().min(1),
    reason: sanitizedString({ min: 5, max: 1000 }),
    objective: sanitizedOptionalString(2000),
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

// 5b. Seat Badge Scan Schema
export const ScanSeatSchema = z
  .object({
    seatToken: z.string().min(1, 'Jeton QR de poste requis'),
    targetUserId: z.string().optional(),
  })
  .strict();

// 5c. Seat Badge Decode Schema (receptionist scan-assist — read-only, no state change)
export const DecodeSeatSchema = z
  .object({
    seatToken: z.string().min(1, 'Jeton QR de poste requis'),
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
    email: z.string().email('Adresse email invalide').regex(/@ocpgroup\.ma$/, 'Doit être une adresse @ocpgroup.ma'),
    full_name: sanitizedString({ min: 2, max: 200, minMessage: 'Nom complet requis' }),
    department: sanitizedString({ min: 2, max: 200, minMessage: 'Département requis' }),
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
    full_name: sanitizedString({ min: 2, max: 200 }).optional(),
    department: sanitizedString({ min: 2, max: 200 }).optional(),
    role: z.enum([
      'collaborator', 'receptionist', 'building_manager', 'gci_manager',
      'executive_assistant', 'director', 'admin', 'super_admin', 'it_admin', 'security_guard',
    ]).optional(),
  })
  .strict();

// 7. User Registration Schema
export const RegisterSchema = z
  .object({
    email: z.string().email('Adresse email invalide'),
    password: z
      .string()
      .min(8, 'Mot de passe de 8 caractères minimum')
      .regex(/[A-Z]/, 'Doit contenir au moins une lettre majuscule')
      .regex(/[0-9]/, 'Doit contenir au moins un chiffre'),
    full_name: sanitizedString({ min: 2, max: 200, minMessage: 'Nom complet requis' }),
    department: sanitizedString({ min: 2, max: 200, minMessage: 'Département requis' }),
    badge_number: sanitizedOptionalString(50),
  })
  .strict();

// 8. Workstation Maintenance Toggle Schema
export const MaintenanceToggleSchema = z
  .object({
    isMaintenance: z.boolean(),
    notes: sanitizedOptionalString(500),
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
    cluster_preference: sanitizedOptionalString(100),
    reservation_date: z.string().min(1, 'Date requise'),
    time_slot: sanitizedOptionalString(50),
    notes: sanitizedOptionalString(500),
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
        label: sanitizedString({ min: 1, max: 120 }),
      })
    ).optional(),
    closedDates: z.array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ)'),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        reason: sanitizedOptionalString(500),
      })
    ).optional(),
    noShowDelayMinutes: z.number().min(5).max(120).optional(),
    extensionSeatsVisibleByDefault: z.boolean().optional(),
    managementClustersEnabled: z.boolean().optional(),
    theme: z.enum(['dark', 'light']).optional(),
    siteName: sanitizedOptionalString(120),
  })
  .strict();

// 11b. Step-up re-authentication for settings changes — replaces the old same-session OTP
// (delivered as an in-app notification, i.e. to the very session making the request, which
// provided no real second factor) with a password re-entry, proving the admin still knows the
// credential right now rather than just holding an open tab.
export const ConfirmSettingsWithPasswordSchema = z
  .object({
    password: z.string().min(1, 'Mot de passe requis'),
    settings: SystemSettingsUpdateSchema,
  })
  .strict();

// 12. AI Query Schema
export const AIQuerySchema = z
  .object({
    query: sanitizedString({ min: 2, max: 1000, minMessage: 'Question trop courte', maxMessage: 'Question trop longue' }),
  })
  .strict();

// 13. Notification Creation Schema
export const CreateNotificationSchema = z
  .object({
    title: sanitizedString({ min: 1, max: 200 }),
    message: sanitizedString({ min: 1, max: 1000 }),
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
        notes: sanitizedOptionalString(500),
      })
      .strict()
      .optional(),
  })
  .strict();

// 18. Extension Seat Creation Schema — motif + visibility + permanent/temporary window
export const ExtensionSeatSchema = z
  .object({
    reason: sanitizedString({ min: 3, max: 500, minMessage: 'Motif requis (3 caractères minimum)', maxMessage: 'Motif trop long (max 500 caractères)' }),
    isPublic: z.boolean(),
    isTemporary: z.boolean(),
    startAt: z.string().datetime({ message: 'Date de début invalide' }).optional(),
    endAt: z.string().datetime({ message: 'Date de fin invalide' }).optional(),
  })
  .strict()
  .refine((data) => !data.isTemporary || !!data.endAt, {
    message: 'Une date/heure de fin est requise pour un poste temporaire',
    path: ['endAt'],
  })
  .refine((data) => !data.isTemporary || !data.startAt || !data.endAt || data.endAt > data.startAt, {
    message: 'La date de fin doit être postérieure à la date de début',
    path: ['endAt'],
  });

// 18z. Reception-desk check-in on a collaborator's behalf (SRS §8.5 / UML "Effectuer Check-in").
export const CheckInOnBehalfSchema = z
  .object({ reservationId: z.string().uuid({ message: 'Identifiant de réservation invalide' }) })
  .strict();

// 18y. Late check-in request / decision.
// The justification is free text by design -- no predefined reason list -- but must be
// substantive enough to be worth auditing, hence the minimum length.
export const LateCheckInRequestSchema = z
  .object({
    reservationId: z.string().uuid({ message: 'Identifiant de réservation invalide' }),
    justification: sanitizedString({
      min: 10,
      max: 1000,
      minMessage: 'Merci de détailler votre justification (10 caractères minimum)',
      maxMessage: 'Justification trop longue (max 1000 caractères)',
    }),
  })
  .strict();

export const LateCheckInDecisionSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED'], { message: 'Décision invalide' }),
    reviewerComment: sanitizedOptionalString(500, 'Commentaire trop long (max 500 caractères)'),
  })
  .strict()
  .refine((d) => d.decision !== 'REJECTED' || !!d.reviewerComment?.trim(), {
    message: 'Un motif est obligatoire en cas de refus — il est transmis au demandeur.',
    path: ['reviewerComment'],
  });

// 18a. Bulk user import (SRS §28.10 / FR-11 — "import massif d'utilisateurs", Admin/Super Admin).
// `dryRun` runs validation only and persists nothing, backing the preview step.
const IMPORT_ROLES = [
  'collaborator',
  'receptionist',
  'building_manager',
  'gci_manager',
  'executive_assistant',
  'director',
  'admin',
  'super_admin',
  'it_admin',
  'security_guard',
] as const;

export const BulkUserImportSchema = z
  .object({
    dryRun: z.boolean().optional(),
    rows: z
      .array(
        z
          .object({
            email: z.string().email({ message: 'Adresse e-mail invalide' }).max(160),
            full_name: sanitizedString({
              min: 2,
              max: 120,
              minMessage: 'Nom requis (2 caractères minimum)',
              maxMessage: 'Nom trop long (max 120 caractères)',
            }),
            department: sanitizedString({
              min: 2,
              max: 120,
              minMessage: 'Département requis (2 caractères minimum)',
              maxMessage: 'Département trop long (max 120 caractères)',
            }),
            role: z.enum(IMPORT_ROLES, { message: 'Rôle inconnu' }),
          })
          .strict()
      )
      .min(1, { message: 'Aucune ligne à importer' })
      // Each row is a Supabase Auth admin call; a very large batch would hold the request open
      // long enough to time out. Chunk bigger imports client-side.
      .max(200, { message: 'Maximum 200 lignes par import' }),
  })
  .strict();

// 18b. Workstation creation (SRS §13 "Gérer postes" = CRUD for Admin/Super Admin).
export const WorkstationCreateSchema = z
  .object({
    code: sanitizedOptionalString(40, 'Code de poste trop long (max 40 caractères)'),
    seatNumber: z.number().int().min(1).max(8).optional(),
    reservable: z.boolean().optional(),
  })
  .strict();

// 18c. Cluster creation (SRS §13 "Gérer clusters" = CRUD for Admin/Super Admin).
export const ClusterCreateSchema = z
  .object({
    code: sanitizedString({ min: 2, max: 20, minMessage: 'Code requis (2 caractères minimum)', maxMessage: 'Code trop long (max 20 caractères)' }),
    name: sanitizedString({ min: 2, max: 80, minMessage: 'Nom requis (2 caractères minimum)', maxMessage: 'Nom trop long (max 80 caractères)' }),
    deskCount: z.number().int().min(1).max(8).optional(),
    isManagement: z.boolean().optional(),
  })
  .strict();

// 18d. Soft delete / restore toggle for postes and clusters.
export const EnabledToggleSchema = z.object({ enabled: z.boolean() }).strict();

// 19. Cluster Access Request Schema (BR-09 / SRS §14.4)
export const ClusterAccessRequestSchema = z
  .object({
    reason: sanitizedString({ min: 3, max: 500, minMessage: 'Motif requis (3 caractères minimum)', maxMessage: 'Motif trop long (max 500 caractères)' }),
    startsAt: z.string().datetime({ message: 'Date de début invalide' }).optional(),
    endsAt: z.string().datetime({ message: 'Date de fin invalide' }).optional(),
  })
  .strict()
  .refine((data) => !data.startsAt || !data.endsAt || data.endsAt > data.startsAt, {
    message: 'La date de fin doit être postérieure à la date de début',
    path: ['endsAt'],
  });

// 19. Cluster Access Request Decision Schema
// BR-09 / SRS §2158 requires management-cluster access to be *temporary*. The decider owns the
// window, not the requester: `endsAt` is mandatory on APPROVED so the relock ticker
// (ClusterAuthorizationService.relockExpiredAuthorizations) always has an expiry to act on.
// Without it the cluster stayed unlocked forever.
export const ClusterAccessDecisionSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED'], { message: 'Décision invalide' }),
    note: sanitizedOptionalString(500, 'Note trop longue (max 500 caractères)'),
    startsAt: z.string().datetime({ message: 'Date de début invalide' }).optional(),
    endsAt: z.string().datetime({ message: 'Date de fin invalide' }).optional(),
  })
  .strict()
  .refine((data) => data.decision !== 'APPROVED' || !!data.endsAt, {
    message: "Une autorisation doit être temporaire : précisez une date/heure de fin",
    path: ['endsAt'],
  })
  .refine((data) => !data.startsAt || !data.endsAt || data.endsAt > data.startsAt, {
    message: 'La date de fin doit être postérieure à la date de début',
    path: ['endsAt'],
  });

// 20. Role Creation Schema (SRS §13 "Gérer rôles" — Super Admin only)
export const CreateRoleSchema = z
  .object({
    code: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{1,49}$/, 'Code invalide (majuscules, chiffres, underscore — ex: FACILITY_LEAD)'),
    name: sanitizedString({ min: 2, max: 100, minMessage: 'Nom du rôle requis' }),
    description: sanitizedOptionalString(500),
  })
  .strict();

// 21. Role Permission Cell Update Schema
export const UpdateRolePermissionSchema = z
  .object({
    can_read: z.boolean().optional(),
    can_create: z.boolean().optional(),
    can_update: z.boolean().optional(),
    can_delete: z.boolean().optional(),
    can_approve: z.boolean().optional(),
  })
  .strict();

// 22. Role Deletion Schema — requires the server-side master key, not just the caller's own
// session/password, since deleting a role is far more destructive than a settings change.
export const DeleteRoleSchema = z
  .object({
    masterKey: z.string().min(1, 'Clé de suppression requise'),
  })
  .strict();
