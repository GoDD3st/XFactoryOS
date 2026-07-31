import React, { useState } from 'react';
import { Workstation, Cluster } from '@/frontend/src/types';
import { createReservation } from '@/services/reservations/reservationService';
import { X, Calendar, Clock, Monitor, Wifi, Power, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';

interface ReservationPanelProps {
  workstation: Workstation | null;
  cluster: Cluster | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ReservationPanel: React.FC<ReservationPanelProps> = ({
  workstation,
  cluster,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [reservationDate, setReservationDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('08:30');
  const [endTime, setEndTime] = useState('17:30');
  const [purpose, setPurpose] = useState('Session de travail collaborative Safi');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!isOpen || !workstation || !cluster) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      await createReservation({
        user_id: 'usr-current',
        user_name: 'Collaborateur Safi',
        user_department: 'Digital Factory',
        workstation_id: workstation.id,
        workstation_code: workstation.code,
        cluster_id: cluster.id,
        cluster_name: cluster.name,
        reservation_date: reservationDate,
        start_time: startTime,
        end_time: endTime,
        purpose,
        notes: workstation.metadata.notes || 'Réservation standard FIFO',
      });

      setMessage('Réservation enregistrée avec succès !');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 800);
    } catch (err) {
      console.error('Error creating reservation:', err);
      setMessage('Erreur lors de la réservation.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-md bg-white text-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        
        {/* Header */}
        <div className="p-4 bg-[#005A36] text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-400 text-slate-900 flex items-center justify-center font-bold text-sm">
              {workstation.seat_number}
            </div>
            <div>
              <h3 className="font-bold text-base">Réservation {workstation.code}</h3>
              <p className="text-xs text-emerald-100">{cluster.name} • {cluster.location_zone}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-emerald-700 text-emerald-100 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Equipment Badges Summary */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-2 text-xs">
          {workstation.metadata.has_double_screen && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
              <Monitor className="w-3.5 h-3.5" /> Double Écran 4K
            </span>
          )}
          {workstation.metadata.is_pmr && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
              PMR Accessible
            </span>
          )}
          {workstation.metadata.is_quiet_zone && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
              Zone Calme
            </span>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 p-5 space-y-4 overflow-y-auto">
          {message && (
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{message}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#008751]" /> Date de réservation
            </label>
            <input
              type="date"
              value={reservationDate}
              onChange={(e) => setReservationDate(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#008751] focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#008751]" /> Heure début
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#008751] focus:outline-none"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#008751]" /> Heure fin
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#008751] focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Objet de la présence / Projet</label>
            <textarea
              rows={3}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Préciser le projet ou l'activité..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#008751] focus:outline-none"
            />
          </div>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
            <div className="font-bold flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              Politique Clean Desk & No-Show Safi
            </div>
            <p className="text-[11px] text-amber-800 leading-normal">
              Vous disposerez de 30 minutes après le début de votre réservation pour effectuer votre check-in sur la plateforme. Passer ce délai, le poste sera automatiquement remis en disponibilité.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-[#008751] hover:bg-[#005A36] text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>{submitting ? 'Confirmation en cours...' : 'Confirmer la Réservation'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
