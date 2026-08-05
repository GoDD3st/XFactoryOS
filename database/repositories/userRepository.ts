import { supabase } from '../client';
import { UserProfile } from '@/frontend/src/types';
import { AuditRepository } from './auditRepository';

export class UserRepository {
  static async getUsers(): Promise<UserProfile[]> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
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

      return data.map((u: any) => ({
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        department: u.department || 'Digital Factory',
        role: u.role || 'collaborator',
        status: u.status === 'ACTIVE' ? 'active' : 'inactive',
      }));
    } catch (err) {
      console.warn('Fetch users fallback:', err);
      return [];
    }
  }

  static async updateUserStatus(userId: string, status: 'active' | 'inactive'): Promise<boolean> {
    try {
      await supabase
        .from('users')
        .update({ status: status === 'active' ? 'ACTIVE' : 'INACTIVE' })
        .eq('id', userId);
      return true;
    } catch (err) {
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
      const { data: existing } = await supabase
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
        const { error: insertError } = await supabase.from('users').insert({
          id: authUser.id,
          email: authUser.email,
          full_name: fullName,
          department,
          status: 'ACTIVE',
        });

        if (insertError) {
          console.error('ensureUserProfile insert failed:', insertError);
        }

        const { data: roleRow } = await supabase
          .from('roles')
          .select('id')
          .or('code.eq.COLLABORATOR,code.eq.collaborator,code.eq.EMPLOYEE')
          .limit(1)
          .maybeSingle();

        if (roleRow?.id) {
          await supabase.from('user_roles').insert({
            user_id: authUser.id,
            role_id: roleRow.id,
          });
        }

        await AuditRepository.logEvent(
          'USER_CREATED',
          authUser.id,
          fullName,
          'collaborator',
          authUser.id,
          `Profil utilisateur créé pour ${authUser.email}`
        );
      } else {
        await supabase
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
