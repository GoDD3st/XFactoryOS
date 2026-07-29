import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  QrCode,
  Layers,
  History,
  Check,
  RefreshCw,
  Zap,
  BookmarkCheck,
  AlertCircle
} from 'lucide-react';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { ReservationsTable } from '../../../shared/components/ReservationsTable';
import { Workstation, Cluster, Reservation } from '../../../types';
import { createReservation, getLocalReservations } from '@/services/reservations/reservationService';
import { useAuth } from '../../../modules/auth/context/AuthContext';

export const EndUserDashboard: React.FC = () => {
  const { currentUser } = useAuth();

  // Booking Form State
  const [resDate, setResDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState<string>('08:30');
  const [endTime, setEndTime] = useState<string>('17:30');
  const [purpose, setPurpose] = useState<string>('Safi Digital Factory - Co-working');
  const [notes, setNotes] = useState<string>('Besoin d’un double écran pour développement');

  // Selected Seat state from DigitalTwin
  const [selectedSeat, setSelectedSeat] = useState<{
    workstation: Workstation;
    cluster: Cluster;
  } | null>(null);

  const [bookingSuccessMsg, setBookingSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Active / Upcoming reservation for Hero Banner
  const [myReservations, setMyReservations] = useState<Reservation[]>([]);

  const loadMyData = () => {
    const all = getLocalReservations();
    const mine = all.filter(
      (r) => r.user_id === currentUser.id || r.user_name === currentUser.full_name
    );
    setMyReservations(mine);
  };

  useEffect(() => {
    loadMyData();

    const handleResChange = () => {
      loadMyData();
    };
    window.addEventListener('xfactory_reservations_changed', handleResChange);
    return () => window.removeEventListener('xfactory_reservations_changed', handleResChange);
  }, [currentUser]);

  const activeHeroRes = myReservations.find(
    (r) => r.status === 'check-in' || r.status === 'confirmée'
  );

  const handleSeatClickFromTwin = (ws: Workstation, cl: Cluster) => {
    setSelectedSeat({ workstation: ws, cluster: cl });
    setBookingSuccessMsg(null);
  };

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeat) return;

    setIsSubmitting(true);

    await createReservation({
      user_id: currentUser.id,
      user_name: currentUser.full_name,
      user_department: currentUser.department,
      workstation_id: selectedSeat.workstation.id,
      workstation_code: selectedSeat.workstation.code,
      cluster_id: selectedSeat.cluster.id,
      cluster_name: selectedSeat.cluster.name,
      reservation_date: resDate,
      start_time: startTime,
      end_time: endTime,
      purpose,
      notes,
      status: 'confirmée'
    });

    setIsSubmitting(false);
    setBookingSuccessMsg(
      `Réservation confirmée avec succès pour le poste ${selectedSeat.workstation.code} (${selectedSeat.cluster.name}) !`
    );
    setSelectedSeat(null);
    loadMyData();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Hero Reservation Banner - Professional Polish Theme */}
      <div className="bg-white text-slate-900 rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                Espace Collaborateur OCP Safi
              </span>
              <span className="text-xs text-slate-500 font-semibold">Badge #{currentUser.badge_number}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Bienvenue, {currentUser.full_name}
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Réservez votre poste de travail en un clic sur le Digital Twin 2D de l’XFactory Safi et accédez immédiatement à votre environnement personnalisé.
            </p>

            {/* Quick Stats Pill Row */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <div className="flex items-center space-x-2 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200">
                <BookmarkCheck className="w-4 h-4 text-emerald-600" />
                <span className="text-xs text-slate-700 font-medium">
                  <strong className="text-slate-900">{myReservations.length}</strong> Réservations
                </span>
              </div>

              <div className="flex items-center space-x-2 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200">
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-slate-700 font-medium">
                  Cluster favori : <strong className="text-slate-900">CL-A Innovation</strong>
                </span>
              </div>

              <div className="flex items-center space-x-2 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span className="text-xs text-slate-700 font-medium">Accès Port & Site Validé</span>
              </div>
            </div>
          </div>

          {/* Active Reservation Quick Card in Hero */}
          {activeHeroRes ? (
            <div className="bg-emerald-50/60 rounded-2xl border border-emerald-200 p-5 w-full lg:w-80 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-200/80 pb-2">
                <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#00b050] animate-pulse" />
                  Poste Actif Réservé
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-mono font-bold border border-emerald-200">
                  {activeHeroRes.status}
                </span>
              </div>

              <div>
                <div className="text-2xl font-black text-slate-900 tracking-wider">
                  {activeHeroRes.workstation_code}
                </div>
                <p className="text-xs text-emerald-800 font-bold mt-0.5">
                  {activeHeroRes.cluster_name}
                </p>
              </div>

              <div className="space-y-1 text-xs text-slate-600 pt-1 border-t border-emerald-200/60">
                <div className="flex items-center justify-between">
                  <span>Aujourd'hui :</span>
                  <span className="font-semibold text-slate-800">{activeHeroRes.start_time} - {activeHeroRes.end_time}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Usage :</span>
                  <span className="text-slate-700 font-medium truncate max-w-[140px]">{activeHeroRes.purpose || 'Co-working'}</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between gap-2">
                <button
                  onClick={() => alert(`Badge virtuel OCP Safi généré pour le poste ${activeHeroRes.workstation_code}`)}
                  className="w-full bg-[#008751] hover:bg-[#005f38] text-white py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 shadow-xs"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Mon Badge QR</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 w-full lg:w-80 text-center space-y-3">
              <Sparkles className="w-8 h-8 text-emerald-600 mx-auto" />
              <p className="text-xs text-slate-600 font-medium">
                Aucune réservation active pour le moment. Sélectionnez un poste ci-dessous sur le Digital Twin 2D.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Booking Interactive Panel Section */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-600" />
              <span>1. Choisir la date et réserver un poste</span>
            </h2>
            <p className="text-xs text-slate-500">
              Définissez votre créneau puis cliquez sur un poste disponible (vert) sur la carte 2D.
            </p>
          </div>
        </div>

        {/* Date / Time Controls Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <CalendarIcon className="w-3.5 h-3.5 text-emerald-600" />
              <span>Date de réservation</span>
            </label>
            <input
              type="date"
              value={resDate}
              onChange={(e) => setResDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-emerald-600" />
              <span>Heure de début</span>
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-emerald-600" />
              <span>Heure de fin</span>
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Motif / Projet</label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Ex: Sprint Planning XFactory"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
            />
          </div>
        </div>

        {/* Success Confirmation Toast */}
        {bookingSuccessMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl flex items-center justify-between shadow-sm animate-in fade-in">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="text-xs font-bold">{bookingSuccessMsg}</p>
            </div>
            <button
              onClick={() => setBookingSuccessMsg(null)}
              className="text-xs font-bold text-emerald-700 hover:underline"
            >
              Fermer
            </button>
          </div>
        )}

        {/* Selected Seat Confirmation Panel */}
        {selectedSeat && (
          <div className="bg-emerald-900 text-white rounded-2xl p-5 border border-emerald-600/50 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-2">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-[#00b050] text-white flex items-center justify-center font-black text-lg border-2 border-white/40 shadow-lg">
                {selectedSeat.workstation.code.split('-')[2]}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-black">{selectedSeat.workstation.code}</h3>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-200 font-semibold">
                    {selectedSeat.cluster.name}
                  </span>
                </div>
                <p className="text-xs text-slate-200 mt-0.5">
                  Créneau : {resDate} de {startTime} à {endTime} | Écran: {selectedSeat.workstation.metadata.monitor_size}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
              <button
                type="button"
                onClick={() => setSelectedSeat(null)}
                className="px-4 py-2 text-xs text-slate-300 hover:text-white font-bold"
              >
                Changer de poste
              </button>

              <button
                onClick={handleConfirmBooking}
                disabled={isSubmitting}
                className="bg-[#00b050] hover:bg-[#009040] text-white px-6 py-2.5 rounded-xl text-xs font-extrabold shadow-lg shadow-emerald-950/50 flex items-center space-x-2 transition-all"
              >
                {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Confirmer la réservation</span>
              </button>
            </div>
          </div>
        )}

        {/* Digital Twin 2D Floor Plan */}
        <DigitalTwin
          onSelectSeat={handleSeatClickFromTwin}
          selectedSeatCode={selectedSeat?.workstation.code || null}
        />
      </div>

      {/* My Reservations Table */}
      <div className="pt-4">
        <ReservationsTable userOnly={true} />
      </div>
    </div>
  );
};
