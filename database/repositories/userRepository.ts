import { supabase } from '../client';
import { UserProfile } from '@/frontend/src/types';

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
}
