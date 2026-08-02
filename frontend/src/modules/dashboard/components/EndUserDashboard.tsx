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
  AlertCircle,
  FileText
} from 'lucide-react';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { ReservationsTable } from '../../../shared/components/ReservationsTable';
import { DateTimePicker24h } from '../../../shared/components/DateTimePicker24h';
import { ExtensionRequestModal } from '../../../shared/components/ExtensionRequestModal';
import { Workstation, Cluster, Reservation, ApprovalRequest, SystemSettings } from '../../../types';
import { createReservation, getLocalReservations } from '@/services/reservations/reservationService';
import { ApprovalService } from '@/services/approval/approvalService';
import { SettingsService } from '@/services/settings/settingsService';
import { useAuth } from '../../../modules/auth/context/AuthContext';


function getNextValidDate(): string {
  const date = new Date();

  // if Saturday (6) → +2 days
  if (date.getDay() === 6) {
    date.setDate(date.getDate() + 2);
  }

  // if Sunday (0) → +1 day
  if (date.getDay() === 0) {
    date.setDate(date.getDate() + 1);
  }

  return date.toISOString().split('T')[0];
}

// NOTE: getMaxDate() used to hardcode "+2 days". It's now driven by the live
// SystemSettings.bookingWindowDays, set from the Super Admin settings screen.
function getMaxDate(bookingWindowDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + bookingWindowDays);

  return date.toISOString().split('T')[0];
}

export const EndUserDashboard: React.FC = () => {
  const { currentUser, currentRole } = useAuth();
  const [settings, setSettings] = useState<SystemSettings>(SettingsService.getSettings());
  const maxDate = getMaxDate(settings.bookingWindowDays);

  useEffect(() => {
    const handleSettingsChange = () => setSettings(SettingsService.getSettings());
    window.addEventListener('xfactory_settings_changed', handleSettingsChange);
    return () => window.removeEventListener('xfactory_settings_changed', handleSettingsChange);
  }, []);

  // Booking Form State
  const [resDate, setResDate] = useState<string>(getNextValidDate());
  const [endDate, setEndDate] = useState<string>(getNextValidDate());
  const [startTime, setStartTime] = useState<string>('08:00');
  const [endTime, setEndTime] = useState<string>('18:00');
  const [purpose, setPurpose] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [businessDaysCount, setBusinessDaysCount] = useState<number>(1);
  const [requiresExtension, setRequiresExtension] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | undefined>();
  const [reason, setReason] = useState<string>('');

  // Extension Modal State
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState<boolean>(false);

  // Re-loop Extension State (when approver requested new description)
  const [reLoopRequest, setReLoopRequest] = useState<ApprovalRequest | null>(null);
  const [isReLoopModalOpen, setIsReLoopModalOpen] = useState<boolean>(false);

  // Selected Seat state from DigitalTwin
  const [selectedSeat, setSelectedSeat] = useState<{
    workstation: Workstation;
    cluster: Cluster;
  } | null>(null);

  const [bookingSuccessMsg, setBookingSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Active / Upcoming reservation for Hero Banner
  const [myReservations, setMyReservations] = useState<Reservation[]>([]);

  const loadMyData = async () => {
    const all = getLocalReservations();
    const mine = all.filter(
      (r) => r.user_id === currentUser.id || r.user_name === currentUser.full_name
    );
    setMyReservations(mine);

    // Check if user has an approval request with 'needs_info' status (Re-Loop)
    const pendingApprovals = await ApprovalService.getPendingApprovals();
    const needsInfoReq = pendingApprovals.find(
      (a) => a.requester_id === currentUser.id && a.status === 'needs_info'
    );
    setReLoopRequest(needsInfoReq || null);
  };

  useEffect(() => {
    loadMyData();

    const handleResChange = () => {
      loadMyData();
    };
    window.addEventListener('xfactory_reservations_changed', handleResChange);
    window.addEventListener('xfactory_approvals_changed', handleResChange);

    return () => {
      window.removeEventListener('xfactory_reservations_changed', handleResChange);
      window.removeEventListener('xfactory_approvals_changed', handleResChange);
    };
  }, [currentUser]);

  const activeHeroRes = myReservations.find(
    (r) => r.status === 'check-in' || r.status === 'confirmée'
  );

  const handleSeatClickFromTwin = (ws: Workstation, cl: Cluster) => {
    setSelectedSeat({ workstation: ws, cluster: cl });
    setBookingSuccessMsg(null);
  };

  const handleDateTimePickerChange = (data: {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    businessDays: number;
    requiresExtensionApproval: boolean;
    errorMessage?: string;
  }) => {
    setResDate(data.startDate);
    setEndDate(data.endDate);
    setStartTime(data.startTime);
    setEndTime(data.endTime);
    setBusinessDaysCount(data.businessDays);
    setRequiresExtension(data.requiresExtensionApproval);
    setValidationError(data.errorMessage);
  };

  const handleConfirmBookingClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeat) return;
    if (validationError) return;

    if (requiresExtension) {
      // Open Extension Request Modal to collect objective
      setIsExtensionModalOpen(true);
    } else {
      executeReservationCreation();
    }
  };

  const executeReservationCreation = async (objectivePayload?: string, motifPayload?: string) => {
    if (!selectedSeat) return;

    setIsSubmitting(true);
    setValidationError(undefined);

    const resStatus = requiresExtension ? 'en attente' : 'confirmée';

    let newRes: Reservation;
    try {
      newRes = await createReservation(
        {
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
          purpose: motifPayload || purpose,
          notes: objectivePayload ? `[OBJECTIF EXTENSION >2J]: ${objectivePayload} | ${notes}` : notes,
          status: resStatus
        },
        currentRole
      );
    } catch (err: any) {
      // Surfaces conflict / booking-window / daily-weekly quota rejections from
      // ReservationService instead of failing silently.
      setValidationError(err?.message || 'Erreur lors de la création de la réservation.');
      setIsSubmitting(false);
      return;
    }

    // If extension required (> 2 business days), submit approval request
    if (requiresExtension && newRes) {
      await ApprovalService.createApprovalRequest({
        reservation_id: newRes.id,
        requester_id: currentUser.id,
        requester_name: currentUser.full_name,
        user_department: currentUser.department,
        approver_role: 'director',
        reason: motifPayload || purpose,
        objective: objectivePayload,
        reservation_date: resDate,
        end_date: endDate,
        start_time: startTime,
        end_time: endTime,
        duration_days: businessDaysCount,
        workstation_code: selectedSeat.workstation.code,
        cluster_name: selectedSeat.cluster.name,
      });

      setBookingSuccessMsg(
        `Demande d'extension (${businessDaysCount} jours ouvrés) envoyée à la Direction, Building Manager & Admin. Référence: #${newRes.id.substring(0, 8)}.`
      );
    } else {
      setBookingSuccessMsg(
        `Réservation confirmée avec succès pour le poste ${selectedSeat.workstation.code} (${selectedSeat.cluster.name}) !`
      );
    }

    setIsSubmitting(false);
    setSelectedSeat(null);
    loadMyData();
  };

  const handleReLoopSubmit = async (data: { objective: string; motif: string }) => {
    if (!reLoopRequest) return;
    await ApprovalService.updateExtensionRequest(reLoopRequest.id, data.objective, data.motif);
    setBookingSuccessMsg('Votre nouvelle description à bien été re-soumise aux valideurs pour examen.');
    loadMyData();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Re-Loop Alert Banner when approver asked for clarification */}
      {reLoopRequest && (
        <div className="bg-amber-50 border-2 border-amber-400 p-4 rounded-2xl shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500 text-white rounded-xl">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black text-amber-900 uppercase tracking-tight">
                Nouvelle Description Demandée pour votre Réservation ({reLoopRequest.workstation_code})
              </h4>
              <p className="text-xs text-amber-800 font-semibold mt-0.5">
                Note du valideur : <em>"{reLoopRequest.decision_note || 'Veuillez préciser l\'objectif détaillé.'}"</em>
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsReLoopModalOpen(true)}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold rounded-xl shadow transition-all shrink-0"
          >
            Editer & Re-soumettre l'objectif
          </button>
        </div>
      )}

      {/* Hero Reservation Banner */}
      <div className="bg-white text-slate-900 rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-xs font-bold">
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              <span>Session Active — OCP SA Safi</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Bienvenue, {currentUser.full_name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
              Réservez votre poste de travail Smart Open Space. (08:00 – 18:00).
            </p>
          </div>

          {activeHeroRes ? (
            <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-xl flex items-center space-x-4 shrink-0">
              <div className="p-3.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-lg shadow-inner">
                {activeHeroRes.workstation_code.split('-')[2] || 'WS'}
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  Poste Réservé
                </span>
                <div className="text-sm font-black">{activeHeroRes.workstation_code}</div>
                <div className="text-[11px] text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-emerald-400" />
                  <span>{activeHeroRes.reservation_date} ({activeHeroRes.start_time} - {activeHeroRes.end_time})</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-xs text-slate-500 space-y-1 shrink-0">
              <div className="font-bold text-slate-700 flex items-center gap-1">
                <BookmarkCheck className="w-4 h-4 text-[#008751]" />
                <span>Aucune réservation en cours</span>
              </div>
              <p className="text-[11px]">Cliquez sur un siège vert disponible sur la carte 2D.</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Interactive Reservation Section */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
          <span className="w-6 h-6 rounded-full bg-[#008751] text-white text-xs flex items-center justify-center font-black">!</span>
          <span>Choisir la date et réserver un poste</span>
        </h2>

        {/* Custom 24h DateTime Picker Component */}
        <DateTimePicker24h
          startDate={resDate}
          endDate={endDate}
          startTime={startTime}
          endTime={endTime}
          settings={settings}
          userRole={currentRole}
          onChange={handleDateTimePickerChange}
        />

        {/* Motif / Notes Optional */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Motif du reservation</label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-[#008751] outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Notes complémentaires</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-[#008751] outline-none"
            />
          </div>
        </div>

        {/* Success Confirmation Toast */}
        {bookingSuccessMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 rounded-2xl flex items-center justify-between shadow-sm animate-in fade-in">
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
          <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-2">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-[#00b050] text-white flex items-center justify-center font-black text-lg border-2 border-white/40 shadow-lg">
                {selectedSeat.workstation.code.split('-')[2] || 'WS'}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-black">{selectedSeat.workstation.code}</h3>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-200 font-semibold">
                    {selectedSeat.cluster.name}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Du <strong>{resDate}</strong> au <strong>{endDate || resDate}</strong> ({startTime} – {endTime}) | {businessDaysCount} jour{businessDaysCount > 1 ? 's' : ''} ouvré{businessDaysCount > 1 ? 's' : ''}
                </p>
                {validationError && (
                  <p className="text-xs font-bold text-red-300 mt-1.5 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {validationError}
                  </p>
                )}
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
                onClick={handleConfirmBookingClick}
                disabled={isSubmitting || !!validationError}
                className={`px-6 py-2.5 rounded-xl text-xs font-extrabold shadow-lg flex items-center space-x-2 transition-all cursor-pointer ${
                  requiresExtension
                    ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-950/50'
                    : 'bg-[#00b050] hover:bg-[#009040] text-white shadow-emerald-950/50'
                }`}
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : requiresExtension ? (
                  <Sparkles className="w-4 h-4" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>
                  {requiresExtension
                    ? 'Formulaire d\'Extension (> 2j)'
                    : 'Confirmer la réservation'}
                </span>
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

      {/* Extension Request Modal (> 2 Business Days) */}
      <ExtensionRequestModal
        isOpen={isExtensionModalOpen}
        onClose={() => setIsExtensionModalOpen(false)}
        onSubmit={({ objective, motif }) => executeReservationCreation(objective, motif)}
        businessDays={businessDaysCount}
        startDate={resDate}
        endDate={endDate || resDate}
        workstationCode={selectedSeat?.workstation.code || 'Poste'}
        clusterName={selectedSeat?.cluster.name || 'Cluster'}
      />

      {/* Re-Loop Extension Modal (When approver asked for clarification) */}
      {reLoopRequest && (
        <ExtensionRequestModal
          isOpen={isReLoopModalOpen}
          onClose={() => setIsReLoopModalOpen(false)}
          onSubmit={handleReLoopSubmit}
          businessDays={reLoopRequest.duration_days || 3}
          startDate={reLoopRequest.reservation_date || resDate}
          endDate={reLoopRequest.end_date || endDate}
          workstationCode={reLoopRequest.workstation_code || 'Poste'}
          clusterName={reLoopRequest.cluster_name || 'Cluster'}
          isReLoop={true}
          initialObjective={reLoopRequest.objective || ''}
          initialMotif={reLoopRequest.reason || ''}
          approverFeedbackNote={reLoopRequest.decision_note}
        />
      )}
    </div>
  );
};