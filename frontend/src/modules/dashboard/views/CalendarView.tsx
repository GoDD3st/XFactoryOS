import React, { useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, MapPin, Users } from 'lucide-react';
import { getLocalReservations } from '@/services/reservations/reservationService';

export const CalendarView: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const reservations = getLocalReservations();

  const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Calendrier des Réservations Open Space</h2>
          <p className="text-xs text-slate-500 mt-0.5">Planning hebdomadaire des 56 postes et 7 clusters Safi</p>
        </div>

        <div className="flex items-center space-x-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200 text-xs">
          <input
            type="date"
            value={currentDate}
            onChange={(e) => setCurrentDate(e.target.value)}
            className="bg-white px-3 py-1 rounded-lg border border-slate-300 font-bold text-slate-700"
          />
        </div>
      </div>

      {/* Weekly Grid */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
        <div className="min-w-[700px] space-y-4">
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-600 border-b border-slate-200 pb-3">
            {days.map((day, idx) => (
              <div key={idx} className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2 min-h-[300px]">
            {days.map((_, idx) => (
              <div key={idx} className="p-2 rounded-xl bg-slate-50/50 border border-slate-100 space-y-2">
                {reservations
                  .filter((r) => r.reservation_date === currentDate)
                  .slice(0, 3)
                  .map((res) => (
                    <div
                      key={res.id}
                      className="p-2 rounded-lg bg-[#008751]/10 text-[#008751] border border-emerald-500/20 text-[10px] space-y-1"
                    >
                      <div className="font-bold">{res.workstation_code}</div>
                      <div className="text-[9px] text-slate-600 truncate">{res.user_name}</div>
                      <div className="text-[8px] text-slate-400">{res.start_time}-{res.end_time}</div>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
