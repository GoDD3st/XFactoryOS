import { Reservation, ReservationStatus } from '@/frontend/src/types';
import { supabase, LOCAL_STORAGE_RESERVATIONS_KEY } from '@/services/supabase/supabaseClient';

const INITIAL_RESERVATIONS: Reservation[] = [
  {
    id: 'res-101',
    user_id: 'usr-1',
    user_name: 'Youssef El Amrani',
    user_department: 'Digital Factory',
    workstation_id: 'ws-A-02',
    workstation_code: 'CL-A-02',
    cluster_id: 'cl-A',
    cluster_name: 'Innovation & Design',
    reservation_date: new Date().toISOString().split('T')[0],
    start_time: '08:30',
    end_time: '17:30',
    status: 'confirmée',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    notes: 'Projet Digital Twin Safi - Sprint Planning',
    purpose: 'Session de co-conception UX & architecture DB'
  },
  {
    id: 'res-102',
    user_id: 'usr-2',
    user_name: 'Fatima-Zahra Benali',
    user_department: 'GCI Governance',
    workstation_id: 'ws-E-01',
    workstation_code: 'CL-E-01',
    cluster_id: 'cl-E',
    cluster_name: 'GCI Governance',
    reservation_date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '18:00',
    status: 'check-in',
    check_in_at: new Date(Date.now() - 1800000).toISOString(),
    created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    notes: 'Comité de Gouvernance Chimie Safi',
    purpose: 'Audit Sécurité & Conformité Environnementale'
  },
  {
    id: 'res-103',
    user_id: 'usr-3',
    user_name: 'Karim Mansouri',
    user_department: 'Facility Management',
    workstation_id: 'ws-C-03',
    workstation_code: 'CL-C-03',
    cluster_id: 'cl-C',
    cluster_name: 'Facility Management',
    reservation_date: new Date().toISOString().split('T')[0],
    start_time: '10:00',
    end_time: '14:00',
    status: 'en attente',
    created_at: new Date(Date.now() - 3600000 * 1).toISOString(),
    notes: 'Vérification Capteurs IoT & Climatisation',
    purpose: 'Supervision Maintenance Bâtiment XFactory'
  },
  {
    id: 'res-104',
    user_id: 'usr-4',
    user_name: 'Amina Tazi',
    user_department: 'Security & Access',
    workstation_id: 'ws-D-01',
    workstation_code: 'CL-D-01',
    cluster_id: 'cl-D',
    cluster_name: 'Security & Access',
    reservation_date: new Date().toISOString().split('T')[0],
    start_time: '07:30',
    end_time: '16:00',
    status: 'check-in',
    check_in_at: new Date(Date.now() - 3600000 * 3).toISOString(),
    created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
    notes: 'Supervision Badges & Contrôle Accès Port',
    purpose: 'Poste Gardiennage & Sécurité Opérationnelle'
  }
];

export function getLocalReservations(): Reservation[] {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_STORAGE_RESERVATIONS_KEY);
      if (!raw) {
        localStorage.setItem(LOCAL_STORAGE_RESERVATIONS_KEY, JSON.stringify(INITIAL_RESERVATIONS));
        return INITIAL_RESERVATIONS;
      }
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading localStorage reservations:', err);
  }
  return INITIAL_RESERVATIONS;
}

export function saveLocalReservations(reservations: Reservation[]): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_RESERVATIONS_KEY, JSON.stringify(reservations));
      window.dispatchEvent(new CustomEvent('xfactory_reservations_changed', { detail: reservations }));
    }
  } catch (err) {
    console.error('Error saving localStorage reservations:', err);
  }
}

export async function fetchReservations(): Promise<Reservation[]> {
  try {
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      const dbReservations: Reservation[] = data.map((item) => ({
        id: String(item.id),
        user_id: String(item.user_id || 'usr-anon'),
        user_name: item.user_name || item.full_name || 'Utilisateur OCP',
        user_department: item.user_department || item.department || 'OCP Safi',
        workstation_id: String(item.workstation_id),
        workstation_code: item.workstation_code || 'CL-A-01',
        cluster_id: String(item.cluster_id || 'cl-A'),
        cluster_name: item.cluster_name || 'Innovation & Design',
        reservation_date: item.reservation_date || new Date().toISOString().split('T')[0],
        start_time: item.start_time || '08:00',
        end_time: item.end_time || '18:00',
        status: (item.status as ReservationStatus) || 'confirmée',
        check_in_at: item.check_in_at,
        created_at: item.created_at,
        notes: item.notes || '',
        purpose: item.purpose || ''
      }));

      const local = getLocalReservations();
      const combined = [...dbReservations];
      local.forEach((locItem) => {
        if (!combined.some((dbItem) => dbItem.id === locItem.id)) {
          combined.push(locItem);
        }
      });
      saveLocalReservations(combined);
      return combined;
    }
  } catch (err) {
    console.warn('Supabase fetch failed or table empty, using hybrid fallback:', err);
  }

  return getLocalReservations();
}

export async function createReservation(
  payload: Omit<Reservation, 'id' | 'created_at' | 'status'> & { status?: ReservationStatus }
): Promise<Reservation> {
  const newReservation: Reservation = {
    ...payload,
    id: `res-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    status: payload.status || 'confirmée',
    created_at: new Date().toISOString(),
  };

  const current = getLocalReservations();
  const updated = [newReservation, ...current];
  saveLocalReservations(updated);

  try {
    await supabase.from('reservations').insert([
      {
        id: newReservation.id,
        user_id: newReservation.user_id,
        workstation_id: newReservation.workstation_id,
        workstation_code: newReservation.workstation_code,
        cluster_id: newReservation.cluster_id,
        cluster_name: newReservation.cluster_name,
        reservation_date: newReservation.reservation_date,
        start_time: newReservation.start_time,
        end_time: newReservation.end_time,
        status: newReservation.status,
        notes: newReservation.notes,
      }
    ]);
  } catch (err) {
    console.warn('Supabase insert fallback:', err);
  }

  return newReservation;
}

export async function updateReservationStatus(
  id: string,
  newStatus: ReservationStatus
): Promise<boolean> {
  const current = getLocalReservations();
  const index = current.findIndex((r) => r.id === id);
  if (index !== -1) {
    current[index].status = newStatus;
    if (newStatus === 'check-in') {
      current[index].check_in_at = new Date().toISOString();
    }
    saveLocalReservations(current);
  }

  try {
    const updateObj: Record<string, any> = { status: newStatus };
    if (newStatus === 'check-in') {
      updateObj.check_in_at = new Date().toISOString();
    }
    await supabase.from('reservations').update(updateObj).eq('id', id);
  } catch (err) {
    console.warn('Supabase status update fallback:', err);
  }

  return true;
}

export async function deleteReservation(id: string): Promise<boolean> {
  const current = getLocalReservations();
  const updated = current.filter((r) => r.id !== id);
  saveLocalReservations(updated);

  try {
    await supabase.from('reservations').delete().eq('id', id);
  } catch (err) {
    console.warn('Supabase delete fallback:', err);
  }

  return true;
}

export class ReservationService {
  static getLocalReservations = getLocalReservations;
  static saveLocalReservations = saveLocalReservations;
  static fetchReservations = fetchReservations;
  static createReservation = createReservation;
  static updateReservationStatus = updateReservationStatus;
  static deleteReservation = deleteReservation;
}
