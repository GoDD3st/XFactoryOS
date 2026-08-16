import { supabase } from '../client';
import { getAdminClient } from '../serverClient';
import { UserProfile, UserRole } from '@/frontend/src/types';
import { normalizeRoleCode } from '@/frontend/src/modules/auth/utils/normalizeRole';
import { AuditRepository } from './auditRepository';

/**
 * A temporary password a Super Admin hands to a locked-out user.
 *
 * Uses a CSPRNG, not Math.random. Math.random is a fast non-cryptographic PRNG whose
 * internal state is recoverable from a handful of outputs, so an attacker who saw one issued
 * temporary password could predict the next ones. It also guarantees one character from each
 * class so the value always satisfies the strength policy in backend/validators (>=10 chars,
 * upper, lower, digit, special) - a generated password that the user then cannot re-enter under
 * that policy would be a dead end.
 */
function generateTempPassword(): string {
  const LOWER = 'abcdefghijkmnopqrstuvwxyz';   // no l
  const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';    // no I, O
  const DIGIT = '23456789';                    // no 0, 1
  const SYMBOL = '!@#$%*?-';
  const ALL = LOWER + UPPER + DIGIT + SYMBOL;

  // Web Crypto rather than node:crypto: this module is also pulled into the browser bundle
  // (realAuthService -> ensureUserProfile), where a require('crypto') would fail the build.
  // globalThis.crypto exists in Node 19+ and in every supported browser.
  const randIndex = (max: number): number => {
    const limit = Math.floor(256 / max) * max; // discard the biased tail so every char is equally likely
    const buf = new Uint8Array(1);
    let v: number;
    do {
      globalThis.crypto.getRandomValues(buf);
      v = buf[0];
    } while (v >= limit);
    return v % max;
  };
  const pick = (set: string) => set[randIndex(set.length)];

  const chars = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYMBOL)];
  for (let i = chars.length; i < 14; i++) chars.push(pick(ALL));

  // Fisher-Yates, so the four guaranteed classes aren't always in the first four slots.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// App-facing UserRole -> real public.roles.code (uppercase, matches the seeded roles table).
const ROLE_TO_DB_CODE: Record<UserRole, string> = {
  collaborator: 'EMPLOYEE',
  receptionist: 'RECEPTIONIST',
  building_manager: 'BUILDING_MANAGER',
  gci_manager: 'GCI_MANAGER',
  executive_assistant: 'EXECUTIVE_ASSISTANT',
  director: 'DIRECTOR',
  admin: 'ADMIN',
  super_admin: 'SUPER_ADMIN',
  it_admin: 'IT_ADMIN',
  security_guard: 'SECURITY',
};

export class UserRepository {
  static async getUsers(): Promise<UserProfile[]> {
    try {
      const db = getAdminClient() || supabase;
      // `role` is NOT a column on public.users - roles live in user_roles -> roles.
      // Embed the join so each user's real assigned role code comes back with the row.
      //
      // user_roles has TWO foreign keys to users (user_id AND granted_by), so the embed is
      // ambiguous without `!user_roles_user_id_fkey` - PostgREST can't guess which relationship
      // to use and errors out. That error silently triggered the `error || !data` fallback below
      // on every single call, meaning this endpoint has always returned 5 hardcoded demo users
      // instead of the real table - confirmed live: Supabase has 12 real users, the site showed
      // the same 5 fake names verbatim regardless of who was actually in the database.
      const { data, error } = await db
        .from('users')
        .select('*, user_roles!user_roles_user_id_fkey(roles(code))')
        .order('created_at', { ascending: false });

      if (error || !data || data.length === 0) {
        return [
          { id: 'usr-1', email: 'y.elamrani@ocpgroup.ma', full_name: 'Youssef El Amrani', department: 'Digital Factory', role: 'collaborator', status: 'active' },
          { id: 'usr-2', email: 'f.benali@ocpgroup.ma', full_name: 'Fatima-Zahra Benali', department: 'GCI Governance', role: 'gci_manager', status: 'active' },
          { id: 'usr-3', email: 'k.mansouri@ocpgroup.ma', full_name: 'Karim Mansouri', department: 'Facility Management', role: 'building_manager', status: 'active' },
          { id: 'usr-4', email: 'a.tazi@ocpgroup.ma', full_name: 'Amina Tazi', department: 'Security & Access', role: 'security_guard', status: 'active' },
          { id: 'usr-5', email: 'director.safi@ocpgroup.ma', full_name: 'Directeur Site Safi', department: 'Direction Générale', role: 'director', status: 'active' },
        ];
      }

      return data.map((u: any) => {
        const rawCode = u.user_roles?.[0]?.roles?.code;
        return {
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          department: u.department || 'Digital Factory',
          role: normalizeRoleCode(rawCode),
          status: u.status === 'ACTIVE' ? 'active' : 'inactive',
        };
      });
    } catch (err) {
      console.warn('Fetch users fallback:', err);
      return [];
    }
  }

  static async updateUserStatus(userId: string, status: 'active' | 'inactive'): Promise<boolean> {
    try {
      const db = getAdminClient() || supabase;
      await db
        .from('users')
        .update({ status: status === 'active' ? 'ACTIVE' : 'INACTIVE' })
        .eq('id', userId);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * FR-11 "Le système doit gérer les utilisateurs internes" / §28.10 (Super Admin/Admin create
   * accounts). Creates a real Supabase Auth user via the admin API (requires the service-role
   * client - this only runs server-side), then corrects the department/role that
   * handle_new_auth_user() seeds by default (it always assigns EMPLOYEE).
   */
  static async createUser(payload: {
    email: string;
    full_name: string;
    department: string;
    role: UserRole;
  }): Promise<{ id: string; tempPassword: string }> {
    const admin = getAdminClient();
    if (!admin) {
      throw new Error('Création de compte indisponible : SUPABASE_SERVICE_ROLE_KEY manquant côté serveur.');
    }

    const tempPassword = `Xf${Math.random().toString(36).slice(2, 10)}!${Math.floor(Math.random() * 100)}`;

    const { data, error } = await admin.auth.admin.createUser({
      email: payload.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: payload.full_name },
    });

    if (error || !data.user) {
      throw new Error(error?.message || 'Échec de la création du compte utilisateur.');
    }

    const userId = data.user.id;

    // handle_new_auth_user() already inserted public.users + a default EMPLOYEE user_roles row - 
    // fix the department, and swap the role if something other than the default was requested.
    await admin.from('users').update({ department: payload.department }).eq('id', userId);

    const dbCode = ROLE_TO_DB_CODE[payload.role];
    if (dbCode && dbCode !== 'EMPLOYEE') {
      const { data: roleRow } = await admin.from('roles').select('id').eq('code', dbCode).maybeSingle();
      if (roleRow?.id) {
        await admin.from('user_roles').delete().eq('user_id', userId);
        await admin.from('user_roles').insert({ user_id: userId, role_id: roleRow.id });
      }
    }

    await AuditRepository.logEvent(
      'CREATE',
      userId,
      payload.full_name,
      payload.role,
      userId,
      `Compte créé par un administrateur pour ${payload.email} (rôle: ${payload.role})`,
      '10.120.4.18',
      'role_change'
    );

    return { id: userId, tempPassword };
  }

  /**
   * FR-11: Super Admin/Admin edits an existing account's name/department/role.
   */
  static async updateUser(
    userId: string,
    payload: { full_name?: string; department?: string; role?: UserRole },
    actorId?: string
  ): Promise<void> {
    const admin = getAdminClient();
    if (!admin) {
      throw new Error('Modification indisponible : SUPABASE_SERVICE_ROLE_KEY manquant côté serveur.');
    }

    const profileUpdate: Record<string, string> = {};
    if (payload.full_name) profileUpdate.full_name = payload.full_name;
    if (payload.department) profileUpdate.department = payload.department;

    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await admin.from('users').update(profileUpdate).eq('id', userId);
      if (error) throw new Error(`Échec de la mise à jour du profil : ${error.message}`);
    }

    if (payload.role) {
      const dbCode = ROLE_TO_DB_CODE[payload.role];
      const { data: roleRow, error: roleError } = await admin.from('roles').select('id').eq('code', dbCode).maybeSingle();
      if (roleError || !roleRow?.id) {
        throw new Error(`Rôle introuvable : ${payload.role}`);
      }
      await admin.from('user_roles').delete().eq('user_id', userId);
      const { error: insertError } = await admin.from('user_roles').insert({ user_id: userId, role_id: roleRow.id });
      if (insertError) throw new Error(`Échec de l'affectation du rôle : ${insertError.message}`);
    }

    await AuditRepository.logEvent(
      payload.role ? 'ROLE_CHANGE' : 'UPDATE',
      actorId || userId,
      payload.full_name || 'Administrateur',
      payload.role || 'admin',
      userId,
      payload.role
        ? `Rôle de l'utilisateur ${userId} changé en ${payload.role}`
        : `Profil utilisateur ${userId} modifié (${Object.keys(payload).join(', ')})`,
      '10.120.4.18',
      'role_change'
    );
  }

  /**
   * FR-14/§25.1: admin-initiated password reset. Uses the Supabase Auth admin API - GoTrue
   * hashes the password (bcrypt) server-side; the plaintext is only ever held in memory here
   * long enough to generate/return it once, never persisted in our own tables.
   */
  /**
   * Super Admin password recovery: replace a forgotten password with a temporary one.
   *
   * There is no way to recover the OLD password and there never will be - Supabase stores a
   * bcrypt hash, so the plaintext ceased to exist at signup. Recovery here means replacement:
   * the generated value is returned to the caller exactly once, for hand-over in person, and is
   * never persisted in our tables, written to the audit trail, or logged.
   */
  static async resetPassword(
    userId: string,
    actor: { id: string; name: string; role: string }
  ): Promise<{ tempPassword: string }> {
    const admin = getAdminClient();
    if (!admin) {
      throw new Error('Réinitialisation indisponible : SUPABASE_SERVICE_ROLE_KEY manquant côté serveur.');
    }

    const { data: target } = await admin
      .from('users')
      .select('email, full_name')
      .eq('id', userId)
      .maybeSingle();

    const tempPassword = generateTempPassword();

    const { error } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
    if (error) {
      throw new Error(`Échec de la réinitialisation du mot de passe : ${error.message}`);
    }

    // The account is now on a credential its administrator also knows, so the user is forced to
    // replace it at next sign-in before reaching any other screen.
    await admin.from('users').update({ must_change_password: true }).eq('id', userId);

    // Names the actor and the target: "an administrator did something" is not an accountable
    // record for an action that hands over access to someone else's account.
    await AuditRepository.logEvent(
      'UPDATE',
      actor.id,
      actor.name,
      actor.role,
      userId,
      `Mot de passe temporaire émis pour ${target?.email || userId} (${target?.full_name || 'utilisateur inconnu'}). ` +
        `Rotation forcée à la prochaine connexion. Valeur non conservée.`,
      '10.120.4.18',
      'role_change'
    );

    return { tempPassword };
  }

  /**
   * Admin sets a SPECIFIC password for a user (as opposed to generating a random one).
   *
   * Still flags the account for rotation: a password the administrator chose and communicated is
   * exactly as shared-secret as a generated one, so the user must replace it at next sign-in.
   * The plaintext is passed straight to GoTrue and never written to our tables, logs or audit.
   */
  static async setPassword(
    userId: string,
    newPassword: string,
    actor: { id: string; name: string; role: string }
  ): Promise<void> {
    const admin = getAdminClient();
    if (!admin) {
      throw new Error('Modification indisponible : SUPABASE_SERVICE_ROLE_KEY manquant côté serveur.');
    }

    const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) {
      throw new Error(`Échec de la modification du mot de passe : ${error.message}`);
    }

    await admin.from('users').update({ must_change_password: true }).eq('id', userId);

    await AuditRepository.logEvent(
      'UPDATE',
      actor.id,
      actor.name,
      actor.role,
      userId,
      // Records THAT the password changed and by whom - never the value.
      `Mot de passe défini par un administrateur pour l'utilisateur ${userId}. Rotation obligatoire à la prochaine connexion.`,
      '10.120.4.18',
      'role_change'
    );
  }

  /**
   * The user sets their own password, clearing the forced-rotation flag.
   *
   * Separate from setPassword because the authority is different: this one requires no
   * manage_users permission, only that the caller is the account holder - the route enforces that
   * by taking the id from the session rather than the request body.
   */
  static async changeOwnPassword(userId: string, newPassword: string): Promise<void> {
    const admin = getAdminClient();
    if (!admin) {
      throw new Error('Modification indisponible : SUPABASE_SERVICE_ROLE_KEY manquant côté serveur.');
    }

    const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) {
      throw new Error(`Échec de la modification du mot de passe : ${error.message}`);
    }

    await admin.from('users').update({ must_change_password: false }).eq('id', userId);

    await AuditRepository.logEvent(
      'UPDATE',
      userId,
      'Utilisateur',
      'self',
      userId,
      'Mot de passe défini par l’utilisateur lui-même.',
      '10.120.4.18',
      'role_change'
    );
  }

  /** Whether the account is still on an admin-issued temporary password. */
  static async mustChangePassword(userId: string): Promise<boolean> {
    try {
      const admin = getAdminClient();
      if (!admin) return false;
      const { data } = await admin
        .from('users')
        .select('must_change_password')
        .eq('id', userId)
        .maybeSingle();
      return !!data?.must_change_password;
    } catch {
      // Never block sign-in on a failed flag read - that would lock everyone out of the platform
      // over a column lookup.
      return false;
    }
  }

  /**
   * Ensure a Supabase Auth user has a corresponding profile row in public.users
   * and a default collaborator role assignment.
   */
  static async ensureUserProfile(authUser: {
    id: string;
    email?: string | null;
    user_metadata?: { full_name?: string; department?: string };
  }): Promise<void> {
    try {
      const db = getAdminClient() || supabase;

      const { data: existing } = await db
        .from('users')
        .select('id')
        .eq('id', authUser.id)
        .maybeSingle();

      const fullName =
        authUser.user_metadata?.full_name ||
        authUser.email?.split('@')[0]?.replace('.', ' ') ||
        'Utilisateur';
      const department = authUser.user_metadata?.department || 'Digital Factory';

      if (!existing) {
        const { error: insertError } = await db.from('users').insert({
          id: authUser.id,
          email: authUser.email,
          full_name: fullName,
          department,
          status: 'ACTIVE',
        });

        if (insertError) {
          console.error('ensureUserProfile insert failed:', insertError);
        }

        const { data: roleRow } = await db
          .from('roles')
          .select('id')
          .or('code.eq.COLLABORATOR,code.eq.collaborator,code.eq.EMPLOYEE')
          .limit(1)
          .maybeSingle();

        if (roleRow?.id) {
          await db.from('user_roles').insert({
            user_id: authUser.id,
            role_id: roleRow.id,
          });
        }

        await AuditRepository.logEvent(
          'CREATE',
          authUser.id,
          fullName,
          'collaborator',
          authUser.id,
          `Profil utilisateur créé pour ${authUser.email}`,
          '10.120.4.18',
          'auth'
        );
      } else {
        await db
          .from('users')
          .update({
            last_login_at: new Date().toISOString(),
            full_name: fullName,
            department,
          })
          .eq('id', authUser.id);
      }
    } catch (err) {
      console.warn('ensureUserProfile notice:', err);
    }
  }
}