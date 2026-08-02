/**
 * Date & 24h Time Validation Utility for OCP SA Safi XFactory OS
 */

// Moroccan & OCP Official Public Holidays (YYYY-MM-DD)
export const OCP_SAFI_PUBLIC_HOLIDAYS_2026 = [
  '2026-01-01', // Jour de l'An
  '2026-01-11', // Manifeste de l'Indépendance
  '2026-03-20', // Aïd Al Fitr (estimé)
  '2026-03-21', // Aïd Al Fitr 2 (estimé)
  '2026-05-01', // Fête du Travail
  '2026-05-27', // Aïd Al Adha (estimé)
  '2026-05-28', // Aïd Al Adha 2 (estimé)
  '2026-07-14', // 1er Moharram (estimé)
  '2026-07-30', // Fête du Trône
  '2026-08-14', // Allégat Oued Eddahab
  '2026-08-20', // Révolution du Roi et du Peuple
  '2026-08-21', // Fête de la Jeunesse
  '2026-09-23', // Aid Al Mawlid (estimé)
  '2026-11-06', // Marche Verte
  '2026-11-18', // Fête de l'Indépendance
];

/**
 * 24h Time Slots array between 08:00 and 18:00 in 30-minute intervals
 */
export const WORKING_HOURS_24H_SLOTS = [
  '08:00', '08:30',
  '09:00', '09:30',
  '10:00', '10:30',
  '11:00', '11:30',
  '12:00', '12:30',
  '13:00', '13:30',
  '14:00', '14:30',
  '15:00', '15:30',
  '16:00', '16:30',
  '17:00', '17:30',
  '18:00'
];

/**
 * Check if a date string (YYYY-MM-DD) falls on a weekend (Saturday or Sunday)
 */
export function isWeekend(dateStr: string): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Check if a date string (YYYY-MM-DD) is an official public holiday
 */
export function isPublicHoliday(dateStr: string): boolean {
  return OCP_SAFI_PUBLIC_HOLIDAYS_2026.includes(dateStr);
}

/**
 * Check if a date string is non-working (weekend or holiday)
 */
export function isNonWorkingDay(dateStr: string): boolean {
  return isWeekend(dateStr) || isPublicHoliday(dateStr);
}

/**
 * Get holiday name if applicable
 */
export function getHolidayName(dateStr: string): string | null {
  switch (dateStr) {
    case '2026-01-01': return 'Jour de l\'An';
    case '2026-01-11': return 'Manifeste de l\'Indépendance';
    case '2026-05-01': return 'Fête du Travail';
    case '2026-07-30': return 'Fête du Trône';
    case '2026-08-14': return 'Oued Eddahab';
    case '2026-08-20': return 'Révolution du Roi et du Peuple';
    case '2026-08-21': return 'Fête de la Jeunesse';
    case '2026-11-06': return 'Marche Verte';
    case '2026-11-18': return 'Fête de l\'Indépendance';
    default:
      if (isPublicHoliday(dateStr)) return 'Jours Férié OCP Safi';
      return null;
  }
}

/**
 * Convert time string "HH:mm" to total minutes from midnight
 */
export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Calculate business days (Monday-Friday non-holiday) between startDate and endDate
 */
export function calculateBusinessDays(
  startDateStr: string,
  endDateStr: string,
  startTimeStr: string = '08:00',
  endTimeStr: string = '18:00'
): number {
  if (!startDateStr || !endDateStr) return 1;

  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(endDateStr + 'T00:00:00');

  if (end < start) return 0;

  let workingDays = 0;
  const current = new Date(start);

  while (current <= end) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const dateFormatted = `${year}-${month}-${day}`;

    if (!isNonWorkingDay(dateFormatted)) {
      workingDays++;
    }

    current.setDate(current.getDate() + 1);
  }

  // If same day, calculate fraction based on hours
  if (startDateStr === endDateStr && workingDays === 1) {
    const startMins = timeToMinutes(startTimeStr);
    const endMins = timeToMinutes(endTimeStr);
    const durationHours = (endMins - startMins) / 60;
    if (durationHours <= 0) return 0;
    return Math.min(1, Math.max(0.1, Number((durationHours / 10).toFixed(2))));
  }

  return workingDays;
}

export interface ReservationValidationResult {
  valid: boolean;
  requiresExtensionApproval: boolean;
  businessDays: number;
  durationMinutes: number;
  errorMessage?: string;
}

/**
 * Validate reservation constraints:
 * - Working hours 08:00 - 18:00
 * - Minimum duration: 30 minutes
 * - No weekends or holidays
 * - Flag if business days > 2
 */
export function validateReservationConstraints(
  startDateStr: string,
  endDateStr: string,
  startTimeStr: string,
  endTimeStr: string
): ReservationValidationResult {
  // 1. Weekend / Holiday check
  if (isNonWorkingDay(startDateStr)) {
    const isWk = isWeekend(startDateStr);
    const holName = getHolidayName(startDateStr);
    return {
      valid: false,
      requiresExtensionApproval: false,
      businessDays: 0,
      durationMinutes: 0,
      errorMessage: isWk
        ? 'Les réservations sont strictement interdites les week-ends (Samedi / Dimanche).'
        : `La date sélectionnée est un jour férié OCP Safi (${holName}). Réservation impossible.`
    };
  }

  if (endDateStr && isNonWorkingDay(endDateStr)) {
    const isWk = isWeekend(endDateStr);
    const holName = getHolidayName(endDateStr);
    return {
      valid: false,
      requiresExtensionApproval: false,
      businessDays: 0,
      durationMinutes: 0,
      errorMessage: isWk
        ? 'La date de fin tombe sur un week-end (Samedi / Dimanche).'
        : `La date de fin tombe sur un jour férié OCP Safi (${holName}).`
    };
  }

  // 2. Working hours bounds check (08:00 to 18:00)
  const startMins = timeToMinutes(startTimeStr);
  const endMins = timeToMinutes(endTimeStr);
  const minMins = timeToMinutes('08:00');
  const maxMins = timeToMinutes('18:00');

  if (startMins < minMins || startMins >= maxMins) {
    return {
      valid: false,
      requiresExtensionApproval: false,
      businessDays: 0,
      durationMinutes: 0,
      errorMessage: 'L\'heure de début doit être comprise entre 08:00 et 18:00.'
    };
  }

  if (endMins <= minMins || endMins > maxMins) {
    return {
      valid: false,
      requiresExtensionApproval: false,
      businessDays: 0,
      durationMinutes: 0,
      errorMessage: 'L\'heure de fin doit être comprise entre 08:00 et 18:00.'
    };
  }

  // 3. Same-day start & end check
  if (startDateStr === endDateStr && endMins <= startMins) {
    return {
      valid: false,
      requiresExtensionApproval: false,
      businessDays: 0,
      durationMinutes: 0,
      errorMessage: 'L\'heure de fin doit être supérieure à l\'heure de début.'
    };
  }

  // 4. Minimum 30 minutes duration check
  let durationMinutes = 0;
  if (startDateStr === endDateStr) {
    durationMinutes = endMins - startMins;
  } else {
    durationMinutes = (maxMins - startMins) + (endMins - minMins);
  }

  if (startDateStr === endDateStr && durationMinutes < 30) {
    return {
      valid: false,
      requiresExtensionApproval: false,
      businessDays: 0,
      durationMinutes,
      errorMessage: 'La durée minimale d\'une réservation est de 30 minutes.'
    };
  }

  // 5. Business days count
  const businessDays = calculateBusinessDays(startDateStr, endDateStr || startDateStr, startTimeStr, endTimeStr);
  const requiresExtensionApproval = businessDays > 2;

  return {
    valid: true,
    requiresExtensionApproval,
    businessDays,
    durationMinutes
  };
}
