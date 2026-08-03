import { supabase } from '@/database/client';
import { UserProfile, UserRole } from '@/frontend/src/types';

/**
 * Real (non-demo) authentication against Supabase Auth. Mirrors the same
 * user_roles -> roles / users lookup that `backend/middleware/authMiddleware.ts`
 * does server-side, so the frontend and backend resolve identity the same way.
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
 * Falls back to 'collaborator' + email-derived name if the users/user_roles
 * rows don't exist yet (e.g. first login before an admin has provisioned
 * the profile row) — never throws, so a slow/missing profile lookup can't
 * lock someone out of an app they're already authenticated into.
 */
export async function fetchRealUserProfile(authUser: {
  id: string;
  email?: string | null;
}): Promise<{ profile: UserProfile; role: UserRole }> {
  let role: UserRole = 'collaborator';
  let full_name = authUser.email || 'Utilisateur';
  let department = '';

  try {
    const { data: userRoleData } = await supabase
      .from('user_roles')
      .select('role_id, roles(code)')
      .eq('user_id', authUser.id)
      .limit(1)
      .single();

    role = ((userRoleData as any)?.roles?.code as UserRole) || 'collaborator';
  } catch (err) {
    console.warn('[realAuthService] No user_roles row found, defaulting to collaborator:', err);
  }

  try {
    const { data: profileData } = await supabase
      .from('users')
      .select('full_name, department')
      .eq('id', authUser.id)
      .single();

    if (profileData?.full_name) full_name = profileData.full_name;
    if (profileData?.department) department = profileData.department;
  } catch (err) {
    console.warn('[realAuthService] No users profile row found, using auth email as display name:', err);
  }

  const profile: UserProfile = {
    id: authUser.id,
    email: authUser.email || '',
    full_name,
    department,
    role,
    status: 'active',
  };

  return { profile, role };
}
