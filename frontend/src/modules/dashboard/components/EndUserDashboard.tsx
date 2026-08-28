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
  FileText, ScanLine } from 'lucide-react';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { ExtensionRequestModal } from '../../../shared/components/ExtensionRequestModal';
import { SeatBookingModal } from '../../../shared/components/SeatBookingModal';
import { Workstation, Cluster, Reservation, ApprovalRequest, SystemSettings } from '../../../types';
import { createReservation, syncReservationsFromDb } from '@/services/reservations/reservationService';
import {
  apiFetchExtensionOffers,
  apiAcceptExtension,
  EarlyExtensionOffer,
} from '@/services/api/reservationApi';
import { validateReservationConstraints } from '@/frontend/src/shared/utils/dateValidation';
import { findOwnSlotClash, describeSlotClash } from '@/services/reservations/slotOverlap';
import { apiCheckIn, apiCheckOut } from '@/services/api/checkinoutApi';
import { apiJoinWaitingList } from '@/services/api/waitingListApi';
import { apiCompleteApprovalRequest, apiFetchMyApprovalRequests } from '@/services/api/approvalApi';
import { ReservationConflictError } from '@/services/api/reservationApi';
import { ApprovalService } from '@/services/approval/approvalService';
import { SettingsService } from '@/services/settings/settingsService';
import { useAuth } from '../../../modules/auth/context/AuthContext';
import { SelfSeatScanModal } from '@/frontend/src/shared/components/SelfSeatScanModal';


// Returns the first valid booking date = today + bookingWindowDays, skipping weekends
function getFirstValidBookingDate(bookingWindowDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + bookingWindowDays);

  // Skip weekends
  if (date.getDay() === 6) date.setDate(date.getDate() + 2); // Saturday → Monday
  if (date.getDay() === 0) date.setDate(date.getDate() + 1); // Sunday → Monday

  return date.toISOString().split('T')[0];
}

export const EndUserDashboard: React.FC = () => {
  const { currentUser, currentRole } = useAuth();
  const [settings, setSettings] = useState<SystemSettings>(SettingsService.getSettings() as SystemSettings);
  const firstValidDate = getFirstValidBookingDate(settings.bookingWindowDays);

  useEffect(() => {
    const handleSettingsChange = () => setSettings(SettingsService.getSettings() as SystemSettings);
    window.addEventListener('xfactory_settings_changed', handleSettingsChange);
    return () => window.removeEventListener('xfactory_settings_changed', handleSettingsChange);
  }, []);

  // Booking Form State
  const [resDate, setResDate] = useState<string>(firstValidDate);
  const [endDate, setEndDate] = useState<string>(firstValidDate);
  const [startTime, setStartTime] = useState<string>('08:00');
  const [endTime, setEndTime] = useState<string>('18:00');
  const [purpose, setPurpose] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [showSeatScan, setShowSeatScan] = useState(false);
  const [businessDaysCount, setBusinessDaysCount] = useState<number>(1);
  const [requiresExtension, setRequiresExtension] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | undefined>();
  const [conflictAlternatives, setConflictAlternatives] = useState<{ code: string; cluster_name: string }[]>([]);
  const [reason, setReason] = useState<string>('');

  // Extension Modal State
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState<boolean>(false);

  // Re-loop Extension State (when approver requested new description)
  const [reLoopRequest, setReLoopRequest] = useState<ApprovalRequest | null>(null);
  const [isReLoopModalOpen, setIsReLoopModalOpen] = useState<boolean>(false);

  // Selected Seat state from DigitalTwin. `forDate` is the day the floor plan had loaded when the
  // seat was picked, and therefore the only day its attached availability - including any hours
  // released early - actually describes.
  const [selectedSeat, setSelectedSeat] = useState<{
    workstation: Workstation;
    cluster: Cluster;
    forDate: string;
  } | null>(null);

  const [bookingSuccessMsg, setBookingSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Active / Upcoming reservation for Hero Banner
  const [myReservations, setMyReservations] = useState<Reservation[]>([]);

  /**
   * Earlier starts offered on reservations this user already holds, because the previous occupant
   * of that same desk left before the end of their slot.
   *
   * This is the ONLY route those freed hours can take. They are never published as availability,
   * never shorten anyone's lead time, and are never applied without the press below - the holder's
   * day is planned around the start time, so moving it is their decision, not the system's.
   */
  const [extensionOffers, setExtensionOffers] = useState<EarlyExtensionOffer[]>([]);
  const [extensionBusy, setExtensionBusy] = useState<string | null>(null);
  const [extensionMsg, setExtensionMsg] = useState<string | null>(null);

  const loadMyData = async () => {
    const all = await syncReservationsFromDb();
    const mine = all.filter(
      (r) => r.user_id === currentUser.id || r.user_name === currentUser.full_name
    );
    setMyReservations(mine);

    // BPMN D2 "DEMANDER INFO": surface a request the validator sent back for more detail.
    //
    // This used to read getPendingApprovals(), which filters to status === 'pending', then search
    // that list for status === 'needs_info' - mutually exclusive, so the banner never rendered and
    // the re-clarification loop was unreachable. /api/approvals/mine returns the caller's own
    // requests in every state.
    const myRequests = await apiFetchMyApprovalRequests();
    setReLoopRequest(myRequests.find((a) => a.status === 'needs_info') || null);

    // Recomputed server-side from the desk's timeline on every load rather than stored anywhere,
    // so an offer that has lapsed - the hours passed, the desk was re-taken - simply stops
    // appearing instead of lingering as a promise the server would refuse.
    setExtensionOffers(await apiFetchExtensionOffers().catch(() => []));
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

  /**
   * The viewer's own booking that collides with the window currently selected, if any.
   *
   * Derived rather than folded into validationError so it can never go stale: cancelling the
   * offending booking, or a refresh that brings in a new one, re-answers this on the spot, where
   * a value written into state at slot-change time would keep refusing a slot that has since
   * been freed. The server enforces the same rule from its own read - this is what stops the
   * refusal arriving only after the user has filled in the dialog and pressed confirm.
   */
  const ownSlotClash = React.useMemo(
    () =>
      findOwnSlotClash(myReservations, {
        startDate: resDate,
        endDate: endDate || resDate,
        startTime,
        endTime,
      }),
    [myReservations, resDate, endDate, startTime, endTime]
  );

  // --- Ma présence (check-in / check-out) ---
  const [presenceBusy, setPresenceBusy] = useState(false);
  const [presenceMsg, setPresenceMsg] = useState<string | null>(null);
  // Recompute the countdown each minute so it stays truthful without a reload.
  const [, setPresenceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPresenceTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const todayKey = new Date().toISOString().split('T')[0];
  const todayPresence = myReservations.find(
    (r) => r.reservation_date === todayKey && (r.status === 'confirmée' || r.status === 'check-in')
  );

  // The no-show window is configured by the Super Admin (settings.noShowDelayMinutes) - read it
  // rather than assuming the SRS default of 30.
  const noShowDelay = (settings as SystemSettings)?.noShowDelayMinutes ?? 30;

  const presenceMinutesLeft = (() => {
    if (!todayPresence || todayPresence.status === 'check-in') return null;
    const [h, m] = (todayPresence.start_time || '00:00').split(':').map(Number);
    const start = new Date(`${todayPresence.reservation_date}T00:00:00`);
    start.setHours(h || 0, m || 0, 0, 0);
    return Math.round((start.getTime() + noShowDelay * 60000 - Date.now()) / 60000);
  })();

  const handlePresenceAction = async () => {
    if (!todayPresence) return;
    setPresenceBusy(true);
    setPresenceMsg(null);
    try {
      if (todayPresence.status === 'check-in') {
        await apiCheckOut(todayPresence.id);
        setPresenceMsg('Check-out effectué - le poste est libéré.');
      } else {
        await apiCheckIn(todayPresence.id);
        setPresenceMsg('Check-in effectué - bonne journée !');
      }
      await loadMyData();
      // Both ends of the day change what the floor shows: the desk becomes occupied on check-in
      // and returns to the ordinary pool on check-out. The freed remainder is NOT advertised as a
      // special opening - see services/reservations/earlyExtensionService.ts.
      window.dispatchEvent(new CustomEvent('xfactory_reservations_changed'));
    } catch (err: any) {
      setPresenceMsg(err?.message || 'Action impossible.');
    } finally {
      setPresenceBusy(false);
    }
  };



  type SeatSelection = { workstation: Workstation; cluster: Cluster; forDate: string };

  /**
   * Slot edits, from the booking dialog or from the floor plan's slot selector.
   *
   * Every change routes through here so the verdict moves with the state: a holiday must stop
   * being flagged the moment a working day is chosen, and the business-day count that decides
   * whether the booking needs Direction approval has to be recomputed on the same edit.
   */
  const applySlotValidation = (next: {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
  }) => {
    setResDate(next.startDate);
    setEndDate(next.endDate);
    setStartTime(next.startTime);
    setEndTime(next.endTime);

    const result = validateReservationConstraints(
      next.startDate,
      next.endDate,
      next.startTime,
      next.endTime,
      settings,
      currentRole
    );
    setValidationError(result.errorMessage);
    setBusinessDaysCount(result.businessDays);
    setRequiresExtension(result.requiresExtensionApproval);
    setConflictAlternatives([]);
  };

  const handleModalSlotChange = (next: {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
  }) => applySlotValidation(next);

  const handleSeatClickFromTwin = (ws: Workstation, cl: Cluster) => {
    setSelectedSeat({ workstation: ws, cluster: cl, forDate: resDate });
    setBookingSuccessMsg(null);
  };

  /**
   * The window chosen in the floor plan's own slot selector.
   *
   * The plan is the only booking path, so its selector owns the slot for the whole screen and
   * the same validation the dialog runs is applied here - the grid, the dialog and what is
   * finally sent to the server can never describe different hours.
   *
   * A multi-day end date set in the dialog is kept as long as it still ends after the new start
   * day: the plan only ever speaks about one day, so collapsing endDate onto it would silently
   * undo an extension request the user had already filled in.
   */
  const handleTwinSlotChange = (slot: { date: string; startTime: string; endTime: string }) => {
    applySlotValidation({
      startDate: slot.date,
      endDate: endDate && endDate > slot.date ? endDate : slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
    });
  };

  /**
   * Queue for a desk that can't be booked for the selected window - either taken all day, or
   * taken for exactly these hours. If the holder never checks in, the no-show sweep offers this
   * desk to the queue in order, and the first person to accept gets it.
   */
  /**
   * Release a seat the viewer holds, from the seat dialog on the floor plan.
   *
   * The Twin renders the floor and does not mutate reservations, so it hands the id back here -
   * the same division of labour as booking and queuing. deleteReservation is the identical call
   * "Mes Réservations" makes, so cancelling from the plan and cancelling from the list cannot
   * diverge in what they do to the record or the audit trail.
   */
  const handleCancelOwnReservation = async (
    reservationId: string,
    workstation: Workstation
  ) => {
    setValidationError(undefined);
    try {
      const { deleteReservation } = await import('@/services/reservations/reservationService');
      await deleteReservation(reservationId);
      setBookingSuccessMsg(`Réservation du poste ${workstation.code} annulée. Le poste est de nouveau disponible.`);
      // Repaints the grid and lets the waiting-list cascade see the freed desk, rather than
      // leaving the seat coloured as taken until something else happens to refresh.
      window.dispatchEvent(new CustomEvent('xfactory_reservations_changed'));
    } catch (err: any) {
      setValidationError(err?.message || "Échec de l'annulation de la réservation.");
    }
  };

  const handleQueueSeat = async (
    workstation: Workstation,
    cluster: Cluster,
    slot: { date: string; startTime: string; endTime: string }
  ) => {
    setValidationError(undefined);
    try {
      await apiJoinWaitingList({
        cluster_preference: cluster.code,
        requested_workstation_id: workstation.id,
        requested_workstation_code: workstation.code,
        reservation_date: slot.date,
        time_slot: `${slot.startTime} - ${slot.endTime}`,
        notes: `Attente du poste ${workstation.code} (${slot.startTime} - ${slot.endTime})`,
      });
      setBookingSuccessMsg(
        `Vous êtes inscrit sur la liste d'attente pour ${workstation.code}. En cas de no-show, l'offre vous sera proposée en priorité.`
      );
      window.dispatchEvent(new CustomEvent('xfactory_waiting_list_changed'));
    } catch (err: any) {
      setValidationError(err?.message || "Échec de l'inscription en liste d'attente.");
    }
  };

  /**
   * Accepts an earlier start. The server rebuilds the offer from the database and re-validates
   * ownership, the timeline and every conflict before writing anything, so this call is a request
   * rather than an instruction - a stale offer is refused with an explanation, not applied.
   */
  const handleAcceptExtension = async (offer: EarlyExtensionOffer) => {
    setExtensionBusy(offer.reservationId);
    setExtensionMsg(null);
    try {
      await apiAcceptExtension(offer.reservationId, offer.proposedStart);
      setExtensionMsg(
        `Réservation prolongée : le poste ${offer.workstationCode} est à vous dès ${offer.proposedStart}.`
      );
      await loadMyData();
      window.dispatchEvent(new CustomEvent('xfactory_reservations_changed'));
    } catch (err: any) {
      setExtensionMsg(err?.message || 'Échec de la prolongation.');
    } finally {
      setExtensionBusy(null);
    }
  };

  const handleConfirmBookingClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeat) return;
    if (validationError) return;
    // Refused server-side too; stopping here keeps the user out of the approval flow below for a
    // booking that cannot be created.
    if (ownSlotClash) return;

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
    setConflictAlternatives([]);

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
          end_date: endDate || resDate,
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
      if (err instanceof ReservationConflictError) {
        setConflictAlternatives(err.alternatives);
      }
      setIsSubmitting(false);
      return;
    }

    // If extension required (> 2 business days), the server already created the Director-routed
    // approval request as part of createReservation (see ReservationService.createReservation) - 
    // it has the objective/motif too, since they're threaded through via notes/purpose above.
    // A second client-side call here used to create a duplicate approval row for the same
    // reservation, tagged the same way, which duplicated the approver's queue.
    if (requiresExtension && newRes) {
      setBookingSuccessMsg(
        `Demande d'extension (${businessDaysCount} jours ouvrés) envoyée à la Direction. Référence: #${newRes.id.substring(0, 8)}.`
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
    try {
      // Via the API: calling the service directly persisted to localStorage only, so the success
      // message below was shown for a re-submission the approver could never see.
      await apiCompleteApprovalRequest(reLoopRequest.id, data.objective, data.motif);
      setBookingSuccessMsg('Votre nouvelle description a bien été re-soumise aux valideurs pour examen.');
      loadMyData();
    } catch (err: any) {
      setValidationError(err?.message || 'Échec de la re-soumission de la demande.');
    }
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
      <div className="bg-white text-slate-900 rounded-2xl p-4 sm:p-8 border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            {/* No session/system status badge: the collaborator has no mandate over platform
                state, and "Session Active" asserted something the screen never actually checked. */}
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Bienvenue, {currentUser.full_name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
              Réservez votre poste de travail Smart Open Space. (08:00 - 18:00).
            </p>

            {/* Scanning the badge on the desk OPENS the check-in screen - it does not perform
                the check-in, which waits for an explicit button (see SeatScanScreen). It already
                worked from the phone's own camera app, since the QR encodes this site with
                ?scan=<token>; this button is for when the app is already open, where being told
                to leave it, open the camera app and come back is absurd, and for desktops, which
                have no camera app to leave to. Same endpoint either way: the server reads the
                user from the session and the desk from the signed token, and answers only about
                a reservation matching both. */}
            <button
              type="button"
              onClick={() => setShowSeatScan(true)}
              className="mt-1 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition-colors"
              title="Scanner le QR code collé sur le poste pour faire votre check-in ou check-out"
            >
              <ScanLine className="w-4 h-4 text-amber-300" />
              Scanner le QR du poste
            </button>
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

      {/* Ma présence - check-in/check-out for today's reservation.
          FR-59: the collaborator must be warned before the check-in window expires, and after
          noShowDelayMinutes the reservation auto-flips to no-show and the seat is released.
          This action previously lived only in "Mes Réservations", so the single most
          time-critical thing this role does was absent from its home screen. */}
      {todayPresence && (
        <div
          className={`rounded-2xl p-4 sm:p-5 border shadow-sm space-y-3 ${
            todayPresence.status === 'check-in'
              ? 'bg-emerald-50 border-emerald-200'
              : presenceMinutesLeft !== null && presenceMinutesLeft <= 0
              ? 'bg-rose-50 border-rose-200'
              : 'bg-amber-50 border-amber-200'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Ma présence - {todayPresence.workstation_code}
                {todayPresence.cluster_name && (
                  <span className="font-normal text-slate-500 text-xs">({todayPresence.cluster_name})</span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Réservation {todayPresence.start_time} → {todayPresence.end_time}
              </p>

              {todayPresence.status === 'check-in' ? (
                <p className="text-xs font-bold text-emerald-700 mt-1">
                  Check-in effectué - vous occupez ce poste.
                </p>
              ) : presenceMinutesLeft === null ? null : presenceMinutesLeft > 0 ? (
                <p className="text-xs font-bold text-amber-700 mt-1">
                  Check-in possible encore {presenceMinutesLeft} min - au-delà, la réservation
                  passe en no-show et le poste est libéré.
                </p>
              ) : (
                <p className="text-xs font-bold text-rose-700 mt-1">
                  Délai de check-in dépassé - la réservation va passer en no-show.
                </p>
              )}
            </div>

            <button
              onClick={handlePresenceAction}
              disabled={presenceBusy}
              className={`shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-all disabled:opacity-60 ${
                todayPresence.status === 'check-in'
                  ? 'bg-slate-800 hover:bg-slate-700'
                  : 'bg-[#008751] hover:bg-[#00703f]'
              }`}
            >
              {presenceBusy
                ? 'Enregistrement...'
                : todayPresence.status === 'check-in'
                ? 'Check-out'
                : 'Check-in'}
            </button>
          </div>

          {presenceMsg && (
            <div className="text-xs font-semibold text-slate-700 bg-white/70 rounded-lg px-3 py-2 border border-slate-200">
              {presenceMsg}
            </div>
          )}
        </div>
      )}

      {/* Booking success is reported above the plan, so it stays visible instead of scrolling
          away with the section that produced it. */}
      {bookingSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 rounded-2xl flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-xs font-bold">{bookingSuccessMsg}</p>
          </div>
          <button onClick={() => setBookingSuccessMsg(null)} className="text-xs font-bold text-emerald-700 hover:underline">
            Fermer
          </button>
        </div>
      )}

      {/* An earlier period became free on a desk this user already holds.
          Shown as an offer with an explicit button - never applied on their behalf. */}
      {extensionOffers.map((offer) => (
        <div
          key={offer.reservationId}
          className="bg-teal-50 border-2 border-teal-300 p-4 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start space-x-3 min-w-0">
            <div className="p-2 bg-teal-600 text-white rounded-xl shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-black text-teal-900 uppercase tracking-tight">
                Une période antérieure s'est libérée avant votre réservation
              </h4>
              <p className="text-xs text-teal-900 font-semibold mt-1">
                Poste {offer.workstationCode} ({offer.clusterName}) le {offer.date} — votre créneau :{' '}
                <span className="font-black">
                  {offer.currentStart} → {offer.currentEnd}
                </span>
              </p>
              <p className="text-xs text-teal-800 font-semibold">
                Vous pouvez le faire commencer plus tôt :{' '}
                <span className="font-black">
                  {offer.proposedStart} → {offer.currentEnd}
                </span>{' '}
                ({offer.gainedMinutes} min de plus)
              </p>
            </div>
          </div>
          <button
            onClick={() => handleAcceptExtension(offer)}
            disabled={extensionBusy === offer.reservationId}
            className="px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-extrabold rounded-xl shadow transition-all shrink-0"
          >
            {extensionBusy === offer.reservationId ? 'Prolongation...' : 'Prolonger la réservation'}
          </button>
        </div>
      ))}

      {extensionMsg && (
        <div className="bg-slate-50 border border-slate-200 text-slate-800 p-3 rounded-2xl flex items-center justify-between gap-3">
          <p className="text-xs font-bold">{extensionMsg}</p>
          <button
            onClick={() => setExtensionMsg(null)}
            className="text-xs font-bold text-slate-500 hover:underline shrink-0"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Already seated elsewhere on these hours.
          Its own banner rather than a line in the dialog, because it is true before any desk is
          picked: the whole floor is unavailable for this window, and saying so once at the top
          beats letting someone choose a desk and meet the refusal at the last step. */}
      {ownSlotClash && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 p-4 rounded-2xl flex items-start justify-between gap-3 shadow-sm">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs font-bold">{describeSlotClash(ownSlotClash)}</p>
          </div>
        </div>
      )}

      {/* The dialog reports its own failures. Everything that happens outside it - an invalid
          window picked on the plan, a release or a queue join that was refused - had nowhere
          left to be seen once the form path was removed, so it is reported here instead of
          failing silently. */}
      {validationError && !selectedSeat && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 p-4 rounded-2xl flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <p className="text-xs font-bold">{validationError}</p>
          </div>
          <button
            onClick={() => setValidationError(undefined)}
            className="text-xs font-bold text-rose-700 hover:underline"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Booking, from the floor plan.
          The cluster filter and the slot selector live inside the twin, so the seat being clicked
          and the hours chosen are never in two distant places on the page. */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-sm space-y-5">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#008751]" />
            <span>Réserver depuis le plan</span>
          </h2>
          <p className="text-[11px] text-slate-500 text-right hidden sm:block">
            Choisissez le créneau, un cluster, puis un poste sur le plan.
          </p>
        </div>

        <DigitalTwin
          onSelectSeat={handleSeatClickFromTwin}
          selectedSeatCode={selectedSeat?.workstation.code || null}
          slotDate={resDate}
          slotStart={startTime}
          slotEnd={endTime}
          onSlotChange={handleTwinSlotChange}
          onQueueSeat={handleQueueSeat}
          onCancelOwnReservation={handleCancelOwnReservation}
        />
      </div>

      {selectedSeat && (
        <SeatBookingModal
          isOpen
          onClose={() => setSelectedSeat(null)}
          workstation={selectedSeat.workstation}
          cluster={selectedSeat.cluster}
          user={currentUser}
          startDate={resDate}
          endDate={endDate}
          startTime={startTime}
          endTime={endTime}
          purpose={purpose}
          notes={notes}
          businessDays={businessDaysCount}
          requiresExtension={requiresExtension}
          isSubmitting={isSubmitting}
          validationError={
            validationError || (ownSlotClash ? describeSlotClash(ownSlotClash) : undefined)
          }
          conflictAlternatives={conflictAlternatives}
          onSlotChange={handleModalSlotChange}
          onPurposeChange={setPurpose}
          onNotesChange={setNotes}
          onConfirm={() => handleConfirmBookingClick(new Event('submit') as unknown as React.FormEvent)}
        />
      )}

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
      {showSeatScan && (
        <SelfSeatScanModal
          onClose={() => setShowSeatScan(false)}
          onDone={() => {
            // The scan screen's check-in/check-out changes a reservation's status, so the floor
            // and the user's own list have to
            // repaint - the same event the booking path dispatches.
            window.dispatchEvent(new CustomEvent('xfactory_reservations_changed'));
          }}
        />
      )}
    </div>

  );
};