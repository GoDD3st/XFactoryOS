import React, { useState, useEffect } from 'react';
import { Reservation } from '@/frontend/src/types';
import { getLocalReservations, deleteReservation } from '@/services/reservations/reservationService';
import { CheckInOutService } from '@/services/checkinout/checkInOutService';
import { Calendar, Clock, MapPin, CheckCircle, LogOut, Trash2, AlertCircle } from 'lucide-react';

export const MyReservationsView: React.FC = () => {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const loadReservations = () => {
    setReservations(getLocalReservations());
  };

  useEffect(() => {
    loadReservations();
    window.addEventListener('xfactory_reservations_changed', loadReservations);
    return () => window.removeEventListener('xfactory_reservations_changed', loadReservations);
  }, []);

  const handleCheckIn = (resId: string) => {
    const ok = CheckInOutService.performCheckIn(resId, 'usr-current');
    if (ok) {
      setMsg('Check-in effectué avec succès !');
      loadReservations();
    }
  };

  const handleCheckOut = (resId: string) => {
    const ok = CheckInOutService.performCheckOut(resId, 'usr-current');
    if (ok) {
      setMsg('Check-out effectué avec succès. Poste libéré.');
      loadReservations();
    }
  };

  const handleCancel = async (resId: string) => {
    await deleteReservation(resId);
    setMsg('Réservation annulée.');
    loadReservations();
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

            <div className="space-y-1.5 text-xs text-slate-600 border-t border-b border-slate-100 py-2.5">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#008751]" />
                <span>Date: {res.reservation_date}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#008751]" />
                <span>Créneau: {res.start_time} - {res.end_time}</span>
              </div>
              {res.purpose && (
                <div className="text-[11px] text-slate-500 italic mt-1">
                  "{res.purpose}"
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              {res.status === 'confirmée' && (
                <button
                  onClick={() => handleCheckIn(res.id)}
                  className="px-3 py-1.5 bg-[#008751] hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Check-in
                </button>
              )}

              {res.status === 'check-in' && (
                <button
                  onClick={() => handleCheckOut(res.id)}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1"
                >
                  <LogOut className="w-3.5 h-3.5" /> Check-out
                </button>
              )}

              <button
                onClick={() => handleCancel(res.id)}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                title="Annuler"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {reservations.length === 0 && (
          <div className="col-span-full p-8 text-center bg-white rounded-2xl border border-slate-200 text-xs text-slate-500">
            Aucune réservation active. Réservez un poste depuis le Digital Twin !
          </div>
        )}
      </div>
    </div>
  );
};
