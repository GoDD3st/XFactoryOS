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
   * When true, onSelectSeat fires for ANY seat regardless of status — used by admin/operational
   * screens (e.g. BuildingView) where clicking a seat opens an edit modal, not a reservation
   * flow. Without this, the reservation-flow gating (only 'disponible' / authorized
   * management-reserved seats are clickable) blocked Building Manager from ever opening the
   * edit modal for a seat that needed it most — one in maintenance, occupied, or reserved.
   */
  adminEditMode?: boolean;
}

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
  adminEditMode = false
}) => {
  const { canView8Postes, isAdminOrSuperAdmin, canAccessManagementClusters, currentUser } = useAuth();

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 8-postes visibility is a straight permission, not a toggle — admins/super-admins always see
  // all 8 seats/cluster, everyone else always sees the standard 4. No manual ON/OFF anymore.
  const show8Postes = canView8Postes;

  // Selected Cluster filter (null = all 7 clusters)
  const [activeClusterId, setActiveClusterId] = useState<string | null>(null);

  // Selected seat detail view modal/tooltip
  const [activeHoverSeat, setActiveHoverSeat] = useState<{
    workstation: Workstation;
    cluster: Cluster;
  } | null>(null);

  // BR-09 / SRS §14.4 — request temporary access to a locked management cluster
  const [accessRequestCluster, setAccessRequestCluster] = useState<Cluster | null>(null);
  const [accessRequestReason, setAccessRequestReason] = useState('');
  const [accessRequestSubmitting, setAccessRequestSubmitting] = useState(false);
  const [accessRequestError, setAccessRequestError] = useState<string | null>(null);
  const [accessRequestSent, setAccessRequestSent] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const data = await fetchClustersWithOverlays();
    setClusters(data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();

    // Listen for reservation changes across windows or actions
    const handleResChange = () => {
      fetchClustersWithOverlays().then(setClusters);
    };
    const handleWsChange = () => {
      fetchClustersWithOverlays().then(setClusters);
    };

    window.addEventListener('xfactory_reservations_changed', handleResChange);
    window.addEventListener('xfactory_workstations_changed', handleWsChange);

    return () => {
      window.removeEventListener('xfactory_reservations_changed', handleResChange);
      window.removeEventListener('xfactory_workstations_changed', handleWsChange);
    };
  }, []);

  // Filter logic
  const filteredClusters = useMemo(() => {
    return clusters.map((cluster) => {
      if (activeClusterId && cluster.id !== activeClusterId) {
        return { ...cluster, workstations: [] };
      }

      const filteredSeats = cluster.workstations.filter((ws) => {
        // Seat visibility: managers (8-postes view) always see every seat so they can manage
        // hidden ones; regular collaborators only see seats not explicitly hidden via
        // visibleToUsers (defaults to true — any post, not just extensions, can be hidden).
        const isSeatVisibleByCapacity = show8Postes || ws.visibleToUsers !== false;

        if (!isSeatVisibleByCapacity) return false;

        // Search query filter (matches seat code e.g. CL-A-01 or cluster name)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesCode = ws.code.toLowerCase().includes(q);
          const matchesCluster = cluster.name.toLowerCase().includes(q) || cluster.code.toLowerCase().includes(q);
          if (!matchesCode && !matchesCluster) return false;
        }

        return true;
      });

      return {
        ...cluster,
        workstations: filteredSeats
      };
    });
  }, [clusters, activeClusterId, show8Postes, searchQuery]);

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
      case 'réservé': return 'Réservé';
      case 'maintenance': return 'Maintenance';
      case 'occupé': return 'Occupé';
      case 'extension': return 'Extension (Admin)';
      case 'disabled': return 'Désactivé (période expirée)';
    }
  };

  // Compute total seat stats for legend
  const totalStats = useMemo(() => {
    let free = 0, reserved = 0, occupied = 0, maint = 0, ext = 0;
    clusters.forEach((cl) => {
      cl.workstations.forEach((ws) => {
        if (ws.seat_number <= 4 || show8Postes || ws.visibleToUsers) {
          if (ws.status === 'disponible') free++;
          else if (ws.status === 'réservé') reserved++;
          else if (ws.status === 'occupé') occupied++;
          else if (ws.status === 'maintenance') maint++;
          else if (ws.status === 'extension') ext++;
        }
      });
    });
    return { free, reserved, occupied, maint, ext, total: free + reserved + occupied + maint + ext };
  }, [clusters, show8Postes]);

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
              // Director/EA/Admin/SuperAdmin — they're the roles those clusters are
              // reserved FOR, they don't need the GCI/Building Manager unlock step.
              // Individually-assigned VIP members (cluster.vipMemberIds) can also book,
              // even without one of those roles. Non-management unavailability
              // (occupied/reserved/maintenance) is never bypassable — that would allow
              // double-booking a real desk.
              const isVipMember = !!cluster.vipMemberIds?.includes(currentUser.id);
              const isSelectable =
                adminEditMode ||
                ws.status === 'disponible' ||
                (ws.status === 'management_reserved' && (canAccessManagementClusters || isVipMember));

              return (
                <div key={ws.id} className="relative group">
                  {/* Seat Pill Button */}
                  <button
                    disabled={readOnly || !isSelectable}
                    onClick={() => {
                      if (onSelectSeat && isSelectable) {
                        onSelectSeat(ws, cluster);
                      }
                      setActiveHoverSeat({ workstation: ws, cluster });
                    }}
                    onMouseEnter={() => setActiveHoverSeat({ workstation: ws, cluster })}
                    className={`w-full py-2.5 px-1 rounded-xl text-center flex flex-col items-center justify-center transition-all border font-bold text-xs seat-pill shadow-xs ${statusColor} ${
                      isSelected ? 'ring-4 ring-emerald-500 ring-offset-2 ring-offset-white scale-105 z-10' : ''
                    } ${!isSelectable ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'}`}
                  >
                    <span className="text-[10px] tracking-tight opacity-90">{ws.code.split('-')[2]}</span>
                    <span className="text-[11px] truncate w-full font-extrabold">{ws.code}</span>
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
            {clusters.length} cluster(s) — Site Safi.
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
            onClick={loadData}
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
          <span className="w-3.5 h-3.5 rounded-md bg-[#f59e0b] inline-block shadow-xs" />
          <span className="text-slate-700 font-semibold">Maintenance ({totalStats.maint})</span>
        </div>
        <div className="flex items-center space-x-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
          <span className="w-3.5 h-3.5 rounded-md bg-[#6366f1] inline-block shadow-xs" />
          <span className="text-slate-700 font-semibold">Extension ({totalStats.ext})</span>
        </div>
      </div>

      {/* Search & Cluster Filter Bar — the Open Space is a single room with no window/PMR/quiet-zone
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

      {/* Selected/Hovered Seat Detail Drawer / Modal */}
      {activeHoverSeat && (
        <div className="bg-slate-900 text-white border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mt-2 shadow-lg animate-in fade-in">
          <div className="flex items-center space-x-3">
            <span
              className={`w-4 h-4 rounded-full inline-block ${
                activeHoverSeat.workstation.status === 'disponible'
                  ? 'bg-[#00b050]'
                  : activeHoverSeat.workstation.status === 'réservé'
                  ? 'bg-[#e05252]'
                  : activeHoverSeat.workstation.status === 'occupé'
                  ? 'bg-[#3b82f6]'
                  : activeHoverSeat.workstation.status === 'maintenance'
                  ? 'bg-[#f59e0b]'
                  : 'bg-[#6366f1]'
              }`}
            />
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-base text-white">{activeHoverSeat.workstation.code}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-semibold border border-slate-700">
                  {getStatusLabel(activeHoverSeat.workstation.status)}
                </span>
                <span className="text-xs text-slate-400">
                  Cluster: {activeHoverSeat.cluster.name} ({activeHoverSeat.cluster.code})
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">Poste {activeHoverSeat.workstation.seat_number}</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
            {onSelectSeat && !readOnly && (
              adminEditMode ||
              activeHoverSeat.workstation.status === 'disponible' ||
              (activeHoverSeat.workstation.status === 'management_reserved' &&
                (canAccessManagementClusters || activeHoverSeat.cluster.vipMemberIds?.includes(currentUser.id)))
            ) && (
              <button
                onClick={() => onSelectSeat(activeHoverSeat.workstation, activeHoverSeat.cluster)}
                className="bg-[#00b050] hover:bg-[#009040] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-md"
              >
                <Check className="w-4 h-4" />
                <span>Sélectionner ce poste</span>
              </button>
            )}
            {!readOnly &&
              !adminEditMode &&
              activeHoverSeat.workstation.status === 'management_reserved' &&
              !canAccessManagementClusters &&
              !activeHoverSeat.cluster.vipMemberIds?.includes(currentUser.id) && (
                <button
                  onClick={() => openAccessRequest(activeHoverSeat.cluster)}
                  className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-md"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Demander l'accès</span>
                </button>
              )}
            <button
              onClick={() => setActiveHoverSeat(null)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 font-semibold"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Cluster Access Request Modal — BR-09 / SRS §14.4 */}
      {accessRequestCluster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <KeyRound className="w-4 h-4 text-purple-600" />
                <span>Demander l'accès — {accessRequestCluster.name}</span>
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
                  Ce cluster est réservé management. Expliquez pourquoi vous avez besoin d'y accéder — la demande sera transmise au Building Manager et au GCI Manager pour décision.
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
