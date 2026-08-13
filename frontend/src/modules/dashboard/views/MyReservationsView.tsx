import React, { useState, useEffect } from 'react';
import { Reservation } from '@/frontend/src/types';
import { deleteReservation, syncReservationsFromDb } from '@/services/reservations/reservationService';
import { apiCheckIn, apiCheckOut } from '@/services/api/checkinoutApi';
import { useAuth } from '@/frontend/src/modules/auth/context/AuthContext';
import { Calendar, Clock, MapPin, CheckCircle, LogOut, Trash2, AlertCircle } from 'lucide-react';

export const MyReservationsView: React.FC = () => {
  const { currentUser } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReservations = async () => {
    setLoading(true);
    try {
      const all = await syncReservationsFromDb();
      const mine = all.filter((r) => r.user_id === currentUser.id);
      setReservations(mine);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReservations();
    window.addEventListener('xfactory_reservations_changed', loadReservations);
    return () => window.removeEventListener('xfactory_reservations_changed', loadReservations);
  }, [currentUser.id]);

  // Both go through the API rather than CheckInOutService: the server forces the user id from
  // the session (so this can only touch your own reservation) and the write stays behind the
  // ownership guard instead of relying on RLS alone.
  const handleCheckIn = async (resId: string) => {
    try {
      await apiCheckIn(resId);
      setMsg('Check-in effectué avec succès !');
      await loadReservations();
    } catch (err: any) {
      setMsg(err?.message || 'Échec du check-in. Vérifiez que la réservation est confirmée.');
    }
  };

  const handleCheckOut = async (resId: string) => {
    try {
      await apiCheckOut(resId);
      setMsg('Check-out effectué avec succès. Poste libéré.');
      await loadReservations();
    } catch (err: any) {
      // Previously had no failure branch at all — a failed check-out was completely silent.
      setMsg(err?.message || 'Échec du check-out.');
    }
  };

  const handleCancel = async (resId: string) => {
    await deleteReservation(resId);
    setMsg('Réservation annulée.');
    await loadReservations();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Mes Réservations Open Space</h2>
          <p className="text-xs text-slate-500 mt-0.5">Suivi de vos réservations, check-in et libération anticipée</p>
        </div>
        <span className="px-3 py-1 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-full border border-emerald-200">
          Clean Desk Active
        </span>
      </div>

      {msg && (
        <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-xs text-slate-400">Chargement depuis Supabase…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reservations.map((res) => (
            <div key={res.id} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    {res.workstation_code}
                  </span>
                  <h4 className="font-bold text-sm text-slate-800 mt-1">{res.cluster_name}</h4>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                    res.status === 'check-in'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : res.status === 'confirmée'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : res.status === 'no-show'
                      ? 'bg-red-100 text-red-800 border border-red-300'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {res.status}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>{res.reservation_date}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{res.start_time} — {res.end_time}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>{res.purpose || 'Session travail'}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                {res.status === 'confirmée' && (
                  <button
                    onClick={() => handleCheckIn(res.id)}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition-colors"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Check-in
                  </button>
                )}
                {res.status === 'check-in' && (
                  <button
                    onClick={() => handleCheckOut(res.id)}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold rounded-lg transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Check-out
                  </button>
                )}
                {(res.status === 'confirmée' || res.status === 'en attente') && (
                  <button
                    onClick={() => handleCancel(res.id)}
                    className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-[10px] font-bold rounded-lg border border-red-200 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {reservations.length === 0 && (
            <div className="col-span-full p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
              <AlertCircle className="w-6 h-6 text-slate-300" />
              Aucune réservation active. Réservez un poste depuis le Digital Twin.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
