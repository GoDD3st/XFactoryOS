import { UserRepository } from '@/database/repositories/userRepository';
import { AuditRepository } from '@/database/repositories/auditRepository';
import { UserRole } from '@/frontend/src/types';

/**
 * SRS §28.10 / FR-11 - "import massif d'utilisateurs" for Administrator and Super Administrator.
 *
 * Runs in two phases so an admin never discovers a problem halfway through a batch:
 *  1. `dryRun` validates every row against the file itself and against the live users table and
 *     reports what would happen, persisting nothing.
 *  2. the real run creates only the rows that pass, and reports the outcome of each one
 *     individually - one bad row does not abort the rest.
 */

export interface ImportRow {
  email: string;
  full_name: string;
  department: string;
  role: UserRole;
}

export type ImportRowStatus =
  | 'ready'        // passes validation, would be created
  | 'created'      // actually created (real run only)
  | 'duplicate'    // same email appears earlier in the same file
  | 'exists'       // an account with this email already exists
  | 'failed';      // creation attempted and rejected

export interface ImportRowResult {
  /** 1-based index of the row as the admin sees it in their file. */
  line: number;
  email: string;
  full_name: string;
  role: UserRole;
  status: ImportRowStatus;
  message?: string;
  /** Only present for rows this run actually created. */
  tempPassword?: string;
}

export interface ImportReport {
  dryRun: boolean;
  total: number;
  ready: number;
  created: number;
  skipped: number;
  failed: number;
  rows: ImportRowResult[];
}

export class UserImportService {
  static async run(
    rows: ImportRow[],
    options: { dryRun: boolean; actorId: string; actorName: string; actorRole: string }
  ): Promise<ImportReport> {
    const existing = await UserRepository.getUsers();
    const existingEmails = new Set(existing.map((u) => (u.email || '').trim().toLowerCase()));

    const seenInFile = new Set<string>();
    const results: ImportRowResult[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const line = i + 1;
      const email = row.email.trim().toLowerCase();

      if (seenInFile.has(email)) {
        results.push({
          line,
          email,
          full_name: row.full_name,
          role: row.role,
          status: 'duplicate',
          message: 'Adresse déjà présente plus haut dans le fichier.',
        });
        continue;
      }
      seenInFile.add(email);

      if (existingEmails.has(email)) {
        results.push({
          line,
          email,
          full_name: row.full_name,
          role: row.role,
          status: 'exists',
          message: 'Un compte existe déjà avec cette adresse.',
        });
        continue;
      }

      if (options.dryRun) {
        results.push({ line, email, full_name: row.full_name, role: row.role, status: 'ready' });
        continue;
      }

      try {
        const { tempPassword } = await UserRepository.createUser({
          email,
          full_name: row.full_name,
          department: row.department,
          role: row.role,
        });
        // Track it so a later duplicate inside the same batch is caught even though the snapshot
        // of existing emails was taken before the run started.
        existingEmails.add(email);
        results.push({
          line,
          email,
          full_name: row.full_name,
          role: row.role,
          status: 'created',
          tempPassword,
        });
      } catch (err: any) {
        results.push({
          line,
          email,
          full_name: row.full_name,
          role: row.role,
          status: 'failed',
          message: err?.message || 'Échec de la création du compte.',
        });
      }
    }

    const report: ImportReport = {
      dryRun: options.dryRun,
      total: results.length,
      ready: results.filter((r) => r.status === 'ready').length,
      created: results.filter((r) => r.status === 'created').length,
      skipped: results.filter((r) => r.status === 'duplicate' || r.status === 'exists').length,
      failed: results.filter((r) => r.status === 'failed').length,
      rows: results,
    };

    // Only a real run is an auditable event - a dry run changes nothing.
    if (!options.dryRun) {
      await AuditRepository.logEvent(
        'CREATE',
        options.actorId,
        options.actorName,
        options.actorRole,
        'import_utilisateurs',
        `Import massif d'utilisateurs : ${report.created} créé(s), ${report.skipped} ignoré(s), ${report.failed} en échec sur ${report.total} ligne(s).`,
        '10.120.4.18',
        'role_change'
      );
    }

    return report;
  }
}
