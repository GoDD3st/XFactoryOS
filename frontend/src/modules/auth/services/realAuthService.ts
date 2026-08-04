import { supabase } from '@/database/client';
import { UserProfile, UserRole } from '@/frontend/src/types';
import { normalizeRoleCode } from '../utils/normalizeRole';

/**
 * Real (non-demo) authentication against Supabase Auth.
 * Dynamically resolves Supabase Auth user accounts to their assigned role & profile from DB.
 */

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Resolve a Supabase Auth user into the app's UserProfile + UserRole shape.
 * Dynamically queries Supabase `user_roles` (user_id -> roles.code) and `users` tables.
 * Normalizes role codes (e.g. 'EXECUTIVE_ASSISTANT' -> 'executive_assistant', 'SECURITY' -> 'security_guard').
 */
export async function fetchRealUserProfile(authUser: {
  id: string;
  email?: string | null;
}): Promise<{ profile: UserProfile; role: UserRole }> {
  let role: UserRole = 'collaborator';
  let full_name = authUser.email || 'Utilisateur';
  let department = '';

  // 1. Query Supabase DB user_roles table joined with roles table by user_id
  try {
    const { data: userRoleData } = await supabase
      .from('user_roles')
      .select('role_id, roles(code)')
      .eq('user_id', authUser.id)
      .limit(1)
      .single();

    const rawCode = (userRoleData as any)?.roles?.code;
    if (rawCode) {
      role = normalizeRoleCode(rawCode);
    }
  } catch (err) {
    // If no user_roles row by ID, attempt lookup by email in users table
    if (authUser.email) {
      try {
        const { data: userByEmail } = await supabase
          .from('users')
          .select('role, full_name, department')
          .eq('email', authUser.email)
          .single();

        if (userByEmail?.role) {
          role = normalizeRoleCode(userByEmail.role);
        }
        if (userByEmail?.full_name) full_name = userByEmail.full_name;
        if (userByEmail?.department) department = userByEmail.department;
      } catch (e) {
        // Fallback to collaborator
      }
    }
  }

  // 2. Query Supabase DB users profile table for full_name and department
  try {
    const { data: profileData } = await supabase
      .from('users')
      .select('full_name, department, role')
      .eq('id', authUser.id)
      .single();

    if (profileData?.full_name) full_name = profileData.full_name;
    if (profileData?.department) department = profileData.department;
    if (profileData?.role && role === 'collaborator') {
      role = normalizeRoleCode(profileData.role);
    }
  } catch (err) {
    // Keep resolved profile
  }

  const profile: UserProfile = {
    id: authUser.id,
    email: authUser.email || '',
    full_name,
    department,
    role,
    status: 'active',
  };

  console.log(`[Real Auth Service] User ${authUser.email} resolved to role: ${role}`);

  return { profile, role };
}
