import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Monitor,
  Maximize2,
  Minimize2,
  Sparkles,
  Cpu,
  Building,
  ShieldCheck,
  Briefcase,
  Lock,
  Award,
  RefreshCw,
  Info,
  Eye,
  EyeOff,
  Wrench,
  Check,
  UserCheck,
  KeyRound,
  Clock,
  X
} from 'lucide-react';
import { Cluster, Workstation, SeatStatus } from '../../types';
import { fetchClustersWithOverlays } from '@/services/workspaces/workspaceService';
import { apiToggleSeatVisibility, apiToggleSeatMaintenance, apiRequestClusterAccess } from '@/services/api/workspaceApi';
import { useAuth } from '../../modules/auth/context/AuthContext';
import { BuildingFloorPlan } from './BuildingFloorPlan';

/** Maps each Open Space zone in the floor plan to the cluster codes it contains. */
const OPEN_SPACE_ZONE_CLUSTER_CODES: Record<string, string[]> = {
  'open-space': ['CL-A', 'CL-B', 'CL-C', 'CL-D', 'CL-E', 'CL-F', 'CL-G'],
};

interface DigitalTwinProps {
  onSelectSeat?: (workstation: Workstation, cluster: Cluster) => void;
  selectedSeatCode?: string | null;
  readOnly?: boolean;
  /**
   * When true, onSelectSeat fires for ANY seat regardless of status - used by admin/operational
   * screens (e.g. BuildingView) where clicking a seat opens an edit modal, not a reservation
   * flow. Without this, the reservation-flow gating (only 'disponible' / authorized
   * management-reserved seats are clickable) blocked Building Manager from ever opening the
   * edit modal for a seat that needed it most - one in maintenance, occupied, or reserved.
   */
  adminEditMode?: boolean;
  /**
   * Fired whenever the slot selector changes, so a host screen can prefill its reservation form
   * with the window the user was actually looking at.
   */
  onSlotChange?: (slot: { date: string; startTime: string; endTime: string }) => void;
  /**
   * Fired when the user asks to queue for a seat they cannot book right now - either taken all
   * day, or taken for the specific window they selected.
   */
  onQueueSeat?: (
    workstation: Workstation,
    cluster: Cluster,
    slot: { date: string; startTime: string; endTime: string }
  ) => void;
  /**
   * Fired when the viewer releases a seat they hold, from the seat dialog. The host owns the
   * call and the refresh, the same way it owns booking and queuing - the Twin renders the floor,
   * it does not mutate reservations.
   */
  onCancelOwnReservation?: (
    reservationId: string,
    workstation: Workstation,
    cluster: Cluster
  ) => void;
  /** Hides the date/time selector for screens that only ever show today's live floor state. */
  hideSlotSelector?: boolean;
  /**
   * Controlled slot. When a host screen already owns a date/time form (EndUserDashboard does),
   * it passes those values here and the grid recolours as that form changes - rather than the
   * screen carrying two pickers that can disagree about which window is being booked.
   */
  slotDate?: string;
  slotStart?: string;
  slotEnd?: string;
}

const BUSINESS_START = '08:00';
const BUSINESS_END = '18:00';

type StatusFilter = 'all' | 'disponible' | 'partiel' | 'réservé' | 'occupé' | 'maintenance';

const STATUS_FILTERS: { key: StatusFilter; label: string; dot: string }[] = [
  { key: 'all', label: 'Tous', dot: 'bg-slate-400' },
  { key: 'disponible', label: 'Disponible', dot: 'bg-[#00b050]' },
  { key: 'partiel', label: 'Partiel', dot: 'bg-[#eab308]' },
  { key: 'réservé', label: 'Réservé', dot: 'bg-[#e05252]' },
  { key: 'occupé', label: 'Occupé', dot: 'bg-[#3b82f6]' },
  { key: 'maintenance', label: 'Maintenance', dot: 'bg-[#f59e0b]' },
];

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Sparkles: (p) => <Sparkles {...p} />,
  Cpu: (p) => <Cpu {...p} />,
  Building: (p) => <Building {...p} />,
  ShieldCheck: (p) => <ShieldCheck {...p} />,
  Briefcase: (p) => <Briefcase {...p} />,
  Lock: (p) => <Lock {...p} />,
  Award: (p) => <Award {...p} />,
};

export const DigitalTwin: React.FC<DigitalTwinProps> = ({
  onSelectSeat,
  selectedSeatCode,
  readOnly = false,
  adminEditMode = false,
  onSlotChange,
  onQueueSeat,
  onCancelOwnReservation,
  hideSlotSelector = false,
  slotDate: slotDateProp,
  slotStart: slotStartProp,
  slotEnd: slotEndProp
}) => {
  const { canView8Postes, isAdminOrSuperAdmin, canAccessManagementClusters, currentUser } = useAuth();

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // The window the grid is answering for. Seats are coloured relative to THIS slot, so changing
  // the hours recolours the floor - a seat booked 08:00-09:00 is free (green) once you ask for
  // 10:00-12:00, which is exactly the case the old date-blind overlay got wrong.
  const [ownDate, setOwnDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [ownStart, setOwnStart] = useState<string>(BUSINESS_START);
  const [ownEnd, setOwnEnd] = useState<string>(BUSINESS_END);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Controlled when the host supplies the slot, uncontrolled otherwise.
  const isControlled = slotDateProp !== undefined;
  const slotDate = slotDateProp ?? ownDate;
  const slotStart = slotStartProp ?? ownStart;
  const slotEnd = slotEndProp ?? ownEnd;
  const setSlotDate = isControlled ? () => {} : setOwnDate;
  const setSlotStart = isControlled ? () => {} : setOwnStart;
  const setSlotEnd = isControlled ? () => {} : setOwnEnd;

  const showSlotSelector = !hideSlotSelector && !isControlled;
  const slotInvalid = slotStart >= slotEnd;

  // 8-postes visibility is a straight permission, not a toggle - admins/super-admins always see
  // all 8 seats/cluster, everyone else always sees the standard 4. No manual ON/OFF anymore.
  const show8Postes = canView8Postes;

  // Selected Cluster filter (null = all 7 clusters)
  const [activeClusterId, setActiveClusterId] = useState<string | null>(null);

  // Detail dialog for a seat the user CANNOT simply book - one that is taken and can be queued
  // for, or a locked management cluster. A bookable seat never lands here: clicking it goes
  // straight to the booking form, which is the only thing the old bar did for it anyway.
  //
  // It used to be `seatDetail`, opened on mouseenter as well as click, and rendered as a bar
  // appended below the floor plan. On a zoomed plan that bar was off-screen, so clicking a seat
  // looked like nothing happened until you scrolled - the same complaint that moved the booking
  // form into a modal. It is a dialog now, and it opens only on a deliberate click.
  const [seatDetail, setSeatDetail] = useState<{
    workstation: Workstation;
    cluster: Cluster;
  } | null>(null);

  // Escape closes the seat dialog, and the page behind stops scrolling while it is up - the same
  // contract SeatBookingModal offers, so the two dialogs do not behave differently.
  useEffect(() => {
    if (!seatDetail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSeatDetail(null);
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [seatDetail]);

  // BR-09 / SRS §14.4 - request temporary access to a locked management cluster
  const [accessRequestCluster, setAccessRequestCluster] = useState<Cluster | null>(null);
  const [accessRequestReason, setAccessRequestReason] = useState('');
  const [accessRequestSubmitting, setAccessRequestSubmitting] = useState(false);
  const [accessRequestError, setAccessRequestError] = useState<string | null>(null);
  const [accessRequestSent, setAccessRequestSent] = useState(false);

  const slot = useMemo(
    () => ({ date: slotDate, startTime: slotStart, endTime: slotEnd }),
    [slotDate, slotStart, slotEnd]
  );

  const loadData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    const data = await fetchClustersWithOverlays({
      date: slotDate,
      startTime: slotStart,
      endTime: slotEnd,
      businessStart: BUSINESS_START,
      businessEnd: BUSINESS_END,
      // So a seat the viewer booked themselves comes back knowing it is theirs.
      currentUserId: currentUser.id,
    });
    setClusters(data);
    if (showSpinner) setLoading(false);
  };

  // Re-runs whenever the slot changes, so the floor recolours for the newly selected window.
  // An inverted range would make every seat read as free, so the fetch is skipped until it's valid.
  useEffect(() => {
    if (slotInvalid) return;
    loadData();

    const refresh = () => loadData(false);

    window.addEventListener('xfactory_reservations_changed', refresh);
    window.addEventListener('xfactory_workstations_changed', refresh);

    return () => {
      window.removeEventListener('xfactory_reservations_changed', refresh);
      window.removeEventListener('xfactory_workstations_changed', refresh);
    };
  }, [slotDate, slotStart, slotEnd, slotInvalid]);

  useEffect(() => {
    if (!slotInvalid) onSlotChange?.(slot);
  }, [slot, slotInvalid]);

  // Filter logic
  const filteredClusters = useMemo(() => {
    return clusters.map((cluster) => {
      if (activeClusterId && cluster.id !== activeClusterId) {
        return { ...cluster, workstations: [] };
      }

      const filteredSeats = cluster.workstations.filter((ws) => {
        // Seat visibility: managers (8-postes view) always see every seat so they can manage
        // hidden ones; regular collaborators only see seats not explicitly hidden via
        // visibleToUsers (defaults to true - any post, not just extensions, can be hidden).
        const isSeatVisibleByCapacity = show8Postes || ws.visibleToUsers !== false;

        if (!isSeatVisibleByCapacity) return false;

        // Search query filter (matches seat code e.g. CL-A-01 or cluster name)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesCode = ws.code.toLowerCase().includes(q);
          const matchesCluster = cluster.name.toLowerCase().includes(q) || cluster.code.toLowerCase().includes(q);
          if (!matchesCode && !matchesCluster) return false;
        }

        if (statusFilter !== 'all' && ws.status !== statusFilter) return false;

        return true;
      });

      return {
        ...cluster,
        workstations: filteredSeats
      };
    });
  }, [clusters, activeClusterId, show8Postes, searchQuery, statusFilter]);

  const handleAdminToggleVisibility = async (clusterId: string, seatId: string, currentVal: boolean) => {
    await apiToggleSeatVisibility(clusterId, seatId, !currentVal);
    loadData();
  };

  const handleAdminToggleMaintenance = async (clusterId: string, seatId: string, currentStatus: SeatStatus) => {
    const isMaint = currentStatus === 'maintenance';
    await apiToggleSeatMaintenance(clusterId, seatId, !isMaint);
    loadData();
  };

  const openAccessRequest = (cluster: Cluster) => {
    setAccessRequestCluster(cluster);
    setAccessRequestReason('');
    setAccessRequestError(null);
    setAccessRequestSent(false);
  };

  const submitAccessRequest = async () => {
    if (!accessRequestCluster) return;
    if (accessRequestReason.trim().length < 3) {
      setAccessRequestError('Le motif doit contenir au moins 3 caractères.');
      return;
    }
    setAccessRequestSubmitting(true);
    setAccessRequestError(null);
    try {
      await apiRequestClusterAccess(accessRequestCluster.id, { reason: accessRequestReason.trim() });
      setAccessRequestSent(true);
    } catch (err: any) {
      setAccessRequestError(err.message || "Échec de l'envoi de la demande.");
    } finally {
      setAccessRequestSubmitting(false);
    }
  };

  const getStatusColorClass = (status: SeatStatus) => {
    switch (status) {
      case 'disponible':
        return 'bg-[#00b050] text-white border-[#009040] shadow-emerald-200/50 hover:bg-[#009040]';
      case 'partiel':
        return 'bg-[#eab308] text-white border-[#ca8a04] shadow-yellow-200/50 hover:bg-[#ca8a04]';
      case 'réservé':
        return 'bg-[#e05252] text-white border-[#cb3e3e] shadow-rose-200/50 hover:bg-[#cb3e3e]';
      case 'maintenance':
        return 'bg-[#f59e0b] text-white border-[#d97706] shadow-amber-200/50 hover:bg-[#d97706]';
      case 'occupé':
        return 'bg-[#3b82f6] text-white border-[#2563eb] shadow-blue-200/50 hover:bg-[#2563eb]';
      case 'extension':
        return 'bg-[#6366f1] text-white border-[#4f46e5] shadow-indigo-200/50 hover:bg-[#4f46e5]';
      case 'disabled':
        return 'bg-slate-600 text-white border-slate-700 shadow-slate-300/50';
      default:
        return 'bg-slate-500 text-white';
    }
  };

  const getStatusLabel = (status: SeatStatus) => {
    switch (status) {
      case 'disponible': return 'Disponible';
      case 'partiel': return 'Partiellement réservé';
      case 'réservé': return 'Réservé (journée entière)';
      case 'maintenance': return 'Maintenance';
      case 'occupé': return 'Occupé';
      case 'extension': return 'Extension (Admin)';
      case 'disabled': return 'Désactivé (période expirée)';
    }
  };

  // Compute total seat stats for legend
  const totalStats = useMemo(() => {
    let free = 0, partial = 0, reserved = 0, occupied = 0, maint = 0, ext = 0;
    clusters.forEach((cl) => {
      cl.workstations.forEach((ws) => {
        if (ws.seat_number <= 4 || show8Postes || ws.visibleToUsers) {
          if (ws.status === 'disponible') free++;
          else if (ws.status === 'partiel') partial++;
          else if (ws.status === 'réservé') reserved++;
          else if (ws.status === 'occupé') occupied++;
          else if (ws.status === 'maintenance') maint++;
          else if (ws.status === 'extension') ext++;
        }
      });
    });
    return { free, partial, reserved, occupied, maint, ext, total: free + partial + reserved + occupied + maint + ext };
  }, [clusters, show8Postes]);

  /**
   * A partially-booked seat is bookable when the selected window misses its busy stretches - that
   * is the whole point of the 'partiel' status. Fully-reserved and occupied seats are not, and
   * management-reserved keeps its existing BR-07 carve-out.
   */
  const isSeatBookable = (ws: Workstation, cluster: Cluster): boolean => {
    if (adminEditMode) return true;
    if (ws.status === 'disponible') return true;
    if (ws.status === 'partiel') return ws.availability?.windowFree !== false;
    if (ws.status === 'management_reserved') {
      return canAccessManagementClusters || !!cluster.vipMemberIds?.includes(currentUser.id);
    }
    return false;
  };

  /** Queuing is offered exactly where booking isn't possible but the seat is a real target. */
  const isSeatQueueable = (ws: Workstation, cluster: Cluster): boolean => {
    if (readOnly || adminEditMode || !onQueueSeat) return false;
    // Never queue for your own desk. Without this the owner of a seat booked 08:00-12:00 clicked
    // it and was invited to join the waiting list for it - the queue exists to hand the seat over
    // if the HOLDER never shows up, so offering it to the holder is asking them to wait for
    // themselves.
    if (ws.availability?.ownReservation) return false;
    if (ws.status === 'réservé' || ws.status === 'occupé') return true;
    if (ws.status === 'partiel') return ws.availability?.windowFree === false;
    return false;
  };

  const renderClusterCard = (cluster: Cluster) => {
    const IconComponent = ICON_MAP[cluster.icon_name || 'Building'] || Building;

    return (
      <div
        key={cluster.id}
        className={`bg-slate-50/80 rounded-2xl border p-4 transition-all duration-200 ${
          cluster.is_management_only
            ? 'border-purple-200 bg-purple-50/40'
            : 'border-slate-200 hover:bg-white hover:shadow-sm hover:border-slate-300'
        }`}
      >
        {/* Cluster Header */}
        <div className="flex items-start justify-between mb-3 border-b border-slate-200/80 pb-2.5">
          <div className="flex items-center space-x-2.5">
            <div className={`p-2 rounded-xl ${cluster.is_management_only ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
              <IconComponent className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-slate-900">{cluster.code}</span>
                <span className="text-xs font-semibold text-slate-700">{cluster.name}</span>
              </div>
              <p className="text-[11px] text-slate-500 line-clamp-1">{cluster.description}</p>
            </div>
          </div>

          {cluster.is_management_only && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200 font-bold shrink-0">
              Restreint VIP
            </span>
          )}
        </div>

        {/* Workstations Seats Grid (8 positions) */}
        {cluster.workstations.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-4 text-center">Aucun poste ne correspond aux filtres.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 py-1">
            {cluster.workstations.map((ws) => {
              const isSelected = selectedSeatCode === ws.code;
              const statusColor = getStatusColorClass(ws.status);
              // BR-07: management-reserved seats are directly selectable by
              // Director/EA/Admin/SuperAdmin - they're the roles those clusters are
              // reserved FOR, they don't need the GCI/Building Manager unlock step.
              // Individually-assigned VIP members (cluster.vipMemberIds) can also book,
              // even without one of those roles. Non-management unavailability
              // (occupied/reserved/maintenance) is never bypassable - that would allow
              // double-booking a real desk.
              const isSelectable = isSeatBookable(ws, cluster);
              // Queueable seats stay clickable so the drawer can offer the waiting list - a
              // fully-booked seat is still a destination, just not a bookable one.
              const isQueueable = isSeatQueueable(ws, cluster);
              // A locked management cluster is neither bookable nor queueable, but it IS a
              // destination: the dialog is where "Demander l'accès" lives. While the detail panel
              // also opened on hover this did not matter, because hovering a disabled button still
              // fires mouseenter. Now that it opens on click alone, leaving these disabled would
              // quietly remove the only route to a BR-09 access request.
              // A seat you already hold: not bookable (it is taken - by you) and deliberately not
              // queueable, but it must stay clickable, because the dialog is the only place the
              // owner can read their booking back or release it. Suppressing the queue without
              // adding this made your own desk unclickable with a not-allowed cursor - the same
              // trap as the management-cluster case below, which is why both are listed here
              // rather than inferred from isQueueable.
              const ownsSeat = !!ws.availability?.ownReservation;
              const opensDetail =
                isQueueable ||
                (!readOnly && ownsSeat) ||
                (!readOnly && !adminEditMode && ws.status === 'management_reserved');

              return (
                <div key={ws.id} className="relative group">
                  {/* Seat Pill Button */}
                  <button
                    disabled={readOnly || (!isSelectable && !opensDetail)}
                    onClick={() => {
                      // One click, one outcome. A bookable seat opens the booking form and
                      // nothing else - it used to ALSO open the detail bar, which repeated the
                      // seat's name and offered a "Sélectionner ce poste" button for the form
                      // that had already opened. Everything else opens the detail dialog, which
                      // is where queuing and access requests live.
                      if (onSelectSeat && isSelectable) {
                        onSelectSeat(ws, cluster);
                        return;
                      }
                      setSeatDetail({ workstation: ws, cluster });
                    }}
                    className={`w-full py-2.5 px-1 rounded-xl text-center flex flex-col items-center justify-center transition-all border font-bold text-xs seat-pill shadow-xs ${statusColor} ${
                      isSelected ? 'ring-4 ring-emerald-500 ring-offset-2 ring-offset-white scale-105 z-10' : ''
                    } ${!isSelectable && !opensDetail ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'}`}
                  >
                    <span className="text-[10px] tracking-tight opacity-90">{ws.code.split('-')[2]}</span>
                    <span className="text-[11px] truncate w-full font-extrabold">{ws.code}</span>
                    {ws.status === 'partiel' && ws.availability?.gaps?.length ? (
                      <span className="text-[9px] font-semibold opacity-95 leading-tight">
                        libre {ws.availability.gaps[0].start} - {ws.availability.gaps[0].end}
                      </span>
                    ) : null}
                  </button>

                  {/* Admin Quick Action Controls Overlay on Hover */}
                  {isAdminOrSuperAdmin && ws.is_extension && (
                    <div className="absolute top-1 right-1 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white p-1 rounded-lg shadow-md z-20">
                      <button
                        title={ws.visibleToUsers ? 'Masquer aux collaborateurs' : 'Rendre visible aux collaborateurs'}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdminToggleVisibility(cluster.id, ws.id, ws.visibleToUsers || false);
                        }}
                        className="p-1 hover:bg-slate-800 rounded"
                      >
                        {ws.visibleToUsers ? <Eye className="w-3 h-3 text-emerald-400" /> : <EyeOff className="w-3 h-3 text-slate-400" />}
                      </button>
                      <button
                        title={ws.status === 'maintenance' ? 'Rétablir statut libre' : 'Mettre en maintenance'}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdminToggleMaintenance(cluster.id, ws.id, ws.status);
                        }}
                        className="p-1 hover:bg-slate-800 text-amber-300 rounded"
                      >
                        <Wrench className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-5 overflow-hidden">
      {/* Header bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        {/* No deployment/sync badge and no "supervision" framing here: this component is shown
            to every role, including the collaborator and the receptionist, who neither supervise
            the site nor have any use for the module's delivery status. The cluster count is read
            from the data instead of being hardcoded. */}
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
              Plan de l'Open Space
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {clusters.length} cluster(s) - Site Safi.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {!canView8Postes && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <Info className="w-3.5 h-3.5 text-amber-500" />
              <span>Vue Standard (4 postes/cluster)</span>
            </div>
          )}

          <button
            onClick={() => loadData()}
            title="Rafraîchir les postes"
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Color Status Legend Bar - Professional Polish */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs">
        <div className="flex items-center space-x-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
          <span className="w-3.5 h-3.5 rounded-md bg-[#00b050] inline-block shadow-xs" />
          <span className="text-slate-700 font-semibold">Disponible ({totalStats.free})</span>
        </div>
        <div className="flex items-center space-x-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
          <span className="w-3.5 h-3.5 rounded-md bg-[#e05252] inline-block shadow-xs" />
          <span className="text-slate-700 font-semibold">Réservé ({totalStats.reserved})</span>
        </div>
        <div className="flex items-center space-x-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
          <span className="w-3.5 h-3.5 rounded-md bg-[#3b82f6] inline-block shadow-xs" />
          <span className="text-slate-700 font-semibold">Occupé ({totalStats.occupied})</span>
        </div>
        <div className="flex items-center space-x-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
          <span className="w-3.5 h-3.5 rounded-md bg-[#eab308] inline-block shadow-xs" />
          <span className="text-slate-700 font-semibold">Partiel ({totalStats.partial})</span>
        </div>
        <div className="flex items-center space-x-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
          <span className="w-3.5 h-3.5 rounded-md bg-[#f59e0b] inline-block shadow-xs" />
          <span className="text-slate-700 font-semibold">Maintenance ({totalStats.maint})</span>
        </div>
        <div className="flex items-center space-x-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
          <span className="w-3.5 h-3.5 rounded-md bg-[#6366f1] inline-block shadow-xs" />
          <span className="text-slate-700 font-semibold">Extension ({totalStats.ext})</span>
        </div>
      </div>

      {/* Search & Cluster Filter Bar - the Open Space is a single room with no window/PMR/quiet-zone
          distinctions, so there is nothing to filter by beyond seat code and cluster. */}
      <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par code poste (ex: CL-A-01) ou cluster..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          {/* Cluster filter dropdown */}
          <div className="flex items-center space-x-2 w-full md:w-auto">
            <select
              value={activeClusterId || ''}
              onChange={(e) => setActiveClusterId(e.target.value ? e.target.value : null)}
              className="bg-white border border-slate-200 text-xs text-slate-700 font-medium rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 w-full md:w-auto"
            >
              <option value="">Tous les 7 Clusters</option>
              {clusters.map((cl) => (
                <option key={cl.id} value={cl.id}>
                  {cl.code} - {cl.name} {cl.is_management_only ? '(Restreint)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Slot selector - the grid answers "what is free for THIS window", so the colours change
            as the hours change. Without it the floor could only ever describe the whole day. */}
        {showSlotSelector && (
          <div className="flex flex-col md:flex-row md:items-center gap-3 pt-1 border-t border-slate-200">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Créneau</label>
              <input
                type="date"
                value={slotDate}
                onChange={(e) => setSlotDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <input
                type="time"
                value={slotStart}
                onChange={(e) => setSlotStart(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <span className="text-xs text-slate-400 font-semibold">→</span>
              <input
                type="time"
                value={slotEnd}
                onChange={(e) => setSlotEnd(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <button
                onClick={() => {
                  setSlotDate(new Date().toISOString().split('T')[0]);
                  setSlotStart(BUSINESS_START);
                  setSlotEnd(BUSINESS_END);
                }}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100"
              >
                Journée entière
              </button>
            </div>

            {slotInvalid && (
              <span className="text-[11px] font-semibold text-rose-600">
                L'heure de fin doit être postérieure à l'heure de début.
              </span>
            )}
          </div>
        )}

        {/* Status filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-200">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                statusFilter === f.key
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${f.dot}`} />
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2D Interactive Digital Twin Layout */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Chargement du Digital Twin...</p>
        </div>
      ) : (
        <BuildingFloorPlan
          getOpenSpaceSummary={(zoneId) => {
            const codes = OPEN_SPACE_ZONE_CLUSTER_CODES[zoneId] || [];
            const zoneClusters = filteredClusters.filter((c) => codes.includes(c.code));
            const seatCount = zoneClusters.reduce((sum, c) => sum + c.workstations.length, 0);
            return { clusterCount: zoneClusters.length, seatCount };
          }}
          renderOpenSpaceDetail={(zoneId) => {
            const codes = OPEN_SPACE_ZONE_CLUSTER_CODES[zoneId] || [];
            const zoneClusters = filteredClusters.filter((c) => codes.includes(c.code));
            if (zoneClusters.length === 0) {
              return <p className="text-xs text-slate-400 italic px-1">Aucun cluster ne correspond aux filtres.</p>;
            }
            return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{zoneClusters.map(renderClusterCard)}</div>;
          }}
        />
      )}

      {/* Seat detail dialog - taken seats and locked clusters.
          Floating, like the booking form, and for the same reason: appended below the floor plan
          it sat off-screen on a zoomed plan, so the answer to "can I have this desk?" was a scroll
          away from the question. */}
      {seatDetail && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setSeatDetail(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Poste ${seatDetail.workstation.code}`}
        >
          <div
            className="bg-slate-900 text-white border border-slate-800 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 animate-in fade-in"
            onClick={(e) => e.stopPropagation()}
          >
          <div className="flex items-start space-x-3">
            <span
              className={`w-4 h-4 rounded-full inline-block ${
                seatDetail.workstation.status === 'disponible'
                  ? 'bg-[#00b050]'
                  : seatDetail.workstation.status === 'partiel'
                  ? 'bg-[#eab308]'
                  : seatDetail.workstation.status === 'réservé'
                  ? 'bg-[#e05252]'
                  : seatDetail.workstation.status === 'occupé'
                  ? 'bg-[#3b82f6]'
                  : seatDetail.workstation.status === 'maintenance'
                  ? 'bg-[#f59e0b]'
                  : 'bg-[#6366f1]'
              }`}
            />
            <div className="min-w-0">
              {/* Cluster on its own line: at dialog width the three of these on one row wrapped
                  mid-name. The bar had a whole screen to spread across; this does not. */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-base text-white">{seatDetail.workstation.code}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-semibold border border-slate-700">
                  {getStatusLabel(seatDetail.workstation.status)}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 truncate">
                Cluster: {seatDetail.cluster.name} ({seatDetail.cluster.code})
              </p>
              <p className="text-xs text-slate-300 mt-0.5">Poste {seatDetail.workstation.seat_number}</p>
              {seatDetail.workstation.availability && (
                <div className="mt-1.5 space-y-0.5">
                  {seatDetail.workstation.availability.busy.length > 0 && (
                    <p className="text-[11px] text-rose-300">
                      Occupé&nbsp;:{' '}
                      {seatDetail.workstation.availability.busy
                        .map((b) => `${b.start} - ${b.end}`)
                        .join(', ')}
                    </p>
                  )}
                  {seatDetail.workstation.availability.gaps.length > 0 && (
                    <p className="text-[11px] text-emerald-300">
                      Libre&nbsp;:{' '}
                      {seatDetail.workstation.availability.gaps
                        .map((g) => `${g.start} - ${g.end}`)
                        .join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Your booking.
              A seat you hold reads as "Réservé" to the grid exactly like anyone else's, so before
              this the owner clicked their own desk and was offered a place in the waiting list for
              it. What they actually want is the two things below: confirmation of what they booked
              and a way out of it. */}
          {seatDetail.workstation.availability?.ownReservation && (
            <div className="rounded-xl bg-emerald-950/40 border border-emerald-800/60 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-extrabold text-emerald-300">
                  Cette réservation est la vôtre
                </span>
              </div>

              {(() => {
                const own = seatDetail.workstation.availability!.ownReservation!;
                const multiDay = !!own.endDate && own.endDate !== own.date;
                const rows: [string, string][] = [
                  ['Date', multiDay ? `${own.date} → ${own.endDate}` : own.date],
                  ['Créneau', `${own.start} - ${own.end}`],
                  ['Statut', own.status],
                  [
                    'Check-in',
                    own.checkInAt
                      ? new Date(own.checkInAt).toLocaleString('fr-FR')
                      : 'Pas encore effectué',
                  ],
                ];
                if (own.purpose) rows.push(['Motif', own.purpose]);
                if (own.notes) rows.push(['Notes', own.notes]);
                rows.push(['Référence', `#${own.id.substring(0, 8)}`]);

                return (
                  <dl className="space-y-1">
                    {rows.map(([label, value]) => (
                      <div key={label} className="flex gap-2 text-[11px]">
                        <dt className="text-slate-400 w-24 shrink-0">{label}</dt>
                        <dd className="text-slate-100 font-semibold break-words min-w-0">{value}</dd>
                      </div>
                    ))}
                  </dl>
                );
              })()}

              {/* Said plainly, because cancelling frees the desk for whoever is queued for it and
                  there is no undo - re-booking is a fresh request against a seat someone else may
                  have taken in the meantime. */}
              {!seatDetail.workstation.availability!.ownReservation!.checkInAt && (
                <p className="text-[10px] text-amber-300/90 leading-snug">
                  Sans check-in à l'heure prévue, la réservation est libérée automatiquement
                  (no-show) et proposée à la liste d'attente.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1 border-t border-slate-800">
            {onSelectSeat && !readOnly && isSeatBookable(seatDetail.workstation, seatDetail.cluster) && (
              <button
                onClick={() => onSelectSeat(seatDetail.workstation, seatDetail.cluster)}
                className="w-full bg-[#00b050] hover:bg-[#009040] text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 shadow-md"
              >
                <Check className="w-4 h-4" />
                <span>
                  {seatDetail.workstation.status === 'partiel'
                    ? 'Réserver ce créneau'
                    : 'Sélectionner ce poste'}
                </span>
              </button>
            )}

            {/* Queue for a seat that can't be booked for this window - the no-show cascade offers
                it to the first person waiting if the holder never checks in. */}
            {isSeatQueueable(seatDetail.workstation, seatDetail.cluster) && (
              <button
                onClick={() => {
                  onQueueSeat?.(seatDetail.workstation, seatDetail.cluster, slot);
                  setSeatDetail(null);
                }}
                className="w-full bg-amber-500 hover:bg-amber-400 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 shadow-md"
              >
                <Clock className="w-4 h-4" />
                <span>Rejoindre la liste d'attente</span>
              </button>
            )}
            {!readOnly &&
              !adminEditMode &&
              seatDetail.workstation.status === 'management_reserved' &&
              !canAccessManagementClusters &&
              !seatDetail.cluster.vipMemberIds?.includes(currentUser.id) && (
                <button
                  onClick={() => {
                    openAccessRequest(seatDetail.cluster);
                    setSeatDetail(null);
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 shadow-md"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Demander l'accès</span>
                </button>
              )}
            {seatDetail.workstation.availability?.ownReservation && onCancelOwnReservation && (
              <button
                onClick={() => {
                  const own = seatDetail.workstation.availability!.ownReservation!;
                  if (
                    !window.confirm(
                      `Annuler votre réservation du poste ${seatDetail.workstation.code} ` +
                        `(${own.date}, ${own.start} - ${own.end}) ?\n\n` +
                        "Le poste redevient disponible immédiatement et sera proposé aux personnes en liste d'attente."
                    )
                  ) {
                    return;
                  }
                  onCancelOwnReservation(own.id, seatDetail.workstation, seatDetail.cluster);
                  setSeatDetail(null);
                }}
                className="w-full bg-rose-600 hover:bg-rose-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 shadow-md"
              >
                <X className="w-4 h-4" />
                <span>Annuler la réservation</span>
              </button>
            )}

            <button
              onClick={() => setSeatDetail(null)}
              className="w-full text-xs text-slate-400 hover:text-white px-2 py-2 font-semibold"
            >
              Fermer
            </button>
          </div>
          </div>
        </div>
      )}

      {/* Cluster Access Request Modal - BR-09 / SRS §14.4 */}
      {accessRequestCluster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <KeyRound className="w-4 h-4 text-purple-600" />
                <span>Demander l'accès - {accessRequestCluster.name}</span>
              </div>
              <button
                onClick={() => setAccessRequestCluster(null)}
                className="p-1 rounded hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {accessRequestSent ? (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                Demande envoyée. Le Building Manager / GCI Manager en sera notifié et vous recevrez une notification une fois la décision prise.
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-500">
                  Ce cluster est réservé management. Expliquez pourquoi vous avez besoin d'y accéder - la demande sera transmise au Building Manager et au GCI Manager pour décision.
                </p>
                <textarea
                  rows={3}
                  value={accessRequestReason}
                  onChange={(e) => setAccessRequestReason(e.target.value)}
                  placeholder="Ex : Réunion client confidentielle nécessitant le cluster G"
                  className="w-full p-3 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-purple-400 outline-none"
                />
                {accessRequestError && (
                  <p className="text-xs text-red-600 font-semibold">{accessRequestError}</p>
                )}
              </>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setAccessRequestCluster(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                {accessRequestSent ? 'Fermer' : 'Annuler'}
              </button>
              {!accessRequestSent && (
                <button
                  onClick={submitAccessRequest}
                  disabled={accessRequestSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md bg-purple-600 hover:bg-purple-500 disabled:opacity-60 disabled:cursor-wait"
                >
                  {accessRequestSubmitting ? 'Envoi...' : 'Envoyer la demande'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
