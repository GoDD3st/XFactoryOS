import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  Monitor,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Sparkles,
  Cpu,
  Building,
  ShieldCheck,
  Briefcase,
  Lock,
  Award,
  RefreshCw,
  Info,
  SlidersHorizontal,
  Eye,
  EyeOff,
  Wrench,
  Check,
  UserCheck
} from 'lucide-react';
import { Cluster, Workstation, QuickFilters, SeatStatus } from '../../types';
import {
  fetchClustersWithOverlays,
  toggleExtensionSeatVisibility,
  setSeatMaintenanceStatus
} from '@/services/workspaces/workspaceService';
import { useAuth } from '../../modules/auth/context/AuthContext';

interface DigitalTwinProps {
  onSelectSeat?: (workstation: Workstation, cluster: Cluster) => void;
  selectedSeatCode?: string | null;
  readOnly?: boolean;
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
  readOnly = false
}) => {
  const { canView8Postes, isAdminOrSuperAdmin } = useAuth();

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Vue Admin (8 postes) toggle - initialized if user has admin privileges
  const [show8Postes, setShow8Postes] = useState<boolean>(canView8Postes);
  
  // Selected Cluster filter (null = all 7 clusters)
  const [activeClusterId, setActiveClusterId] = useState<string | null>(null);

  // Quick filters
  const [filters, setFilters] = useState<QuickFilters>({
    doubleScreen: false,
    nearWindow: false,
    pmr: false,
    quietZone: false,
    statusFreeOnly: false
  });

  // Selected seat detail view modal/tooltip
  const [activeHoverSeat, setActiveHoverSeat] = useState<{
    workstation: Workstation;
    cluster: Cluster;
  } | null>(null);

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

  // Sync admin mode toggle with permission changes
  useEffect(() => {
    if (!canView8Postes) {
      setShow8Postes(false);
    }
  }, [canView8Postes]);

  // Filter logic
  const filteredClusters = useMemo(() => {
    return clusters.map((cluster) => {
      if (activeClusterId && cluster.id !== activeClusterId) {
        return { ...cluster, workstations: [] };
      }

      const filteredSeats = cluster.workstations.filter((ws) => {
        // Seat capacity check:
        // If 8-post view is ON, show seats 1-8.
        // If 8-post view is OFF, show seats 1-4, OR extension seats explicitly toggled visibleToUsers
        const isSeatVisibleByCapacity = show8Postes
          ? true
          : ws.seat_number <= 4 || ws.visibleToUsers;

        if (!isSeatVisibleByCapacity) return false;

        // Search query filter (matches seat code e.g. CL-A-01 or cluster name)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesCode = ws.code.toLowerCase().includes(q);
          const matchesCluster = cluster.name.toLowerCase().includes(q) || cluster.code.toLowerCase().includes(q);
          if (!matchesCode && !matchesCluster) return false;
        }

        // Quick filters
        if (filters.doubleScreen && !ws.metadata.has_double_screen) return false;
        if (filters.nearWindow && !ws.metadata.near_window) return false;
        if (filters.pmr && !ws.metadata.is_pmr) return false;
        if (filters.quietZone && !ws.metadata.is_quiet_zone) return false;
        if (filters.statusFreeOnly && ws.status !== 'disponible') return false;

        return true;
      });

      return {
        ...cluster,
        workstations: filteredSeats
      };
    });
  }, [clusters, activeClusterId, show8Postes, searchQuery, filters]);

  const handleAdminToggleVisibility = async (clusterId: string, seatId: string, currentVal: boolean) => {
    await toggleExtensionSeatVisibility(clusterId, seatId, !currentVal);
    loadData();
  };

  const handleAdminToggleMaintenance = async (clusterId: string, seatId: string, currentStatus: SeatStatus) => {
    const isMaint = currentStatus === 'maintenance';
    await setSeatMaintenanceStatus(clusterId, seatId, !isMaint);
    loadData();
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

  return (
    <div className="w-full bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-5 overflow-hidden">
      {/* Header bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#00b050] animate-pulse-subtle" />
            <h2 className="text-xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
              Digital Twin 2D - Open Space OCP Safi
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Module 1 Sync
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Supervision temps réel des 7 clusters & réservation dynamique de postes. Site OCP SA Safi.
          </p>
        </div>

        {/* Legend & Admin 8-Post Toggle */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Vue Admin 8 Postes Toggle - Restricted strictly to Admin/SuperAdmin */}
          {canView8Postes ? (
            <button
              onClick={() => setShow8Postes(!show8Postes)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all border shadow-xs ${
                show8Postes
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 ring-2 ring-indigo-500/20'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
              <span>Vue Admin (8 postes)</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold ${show8Postes ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {show8Postes ? 'ON' : 'OFF'}
              </span>
            </button>
          ) : (
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

      {/* Search & Quick Filters Bar */}
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

        {/* Filter Badges */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60">
          <span className="text-xs text-slate-500 flex items-center gap-1 font-semibold mr-1">
            <Filter className="w-3 h-3 text-emerald-600" /> Filtres :
          </span>

          <button
            onClick={() => setFilters((f) => ({ ...f, doubleScreen: !f.doubleScreen }))}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
              filters.doubleScreen
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Monitor className="w-3 h-3" /> Double écran
          </button>

          <button
            onClick={() => setFilters((f) => ({ ...f, nearWindow: !f.nearWindow }))}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
              filters.nearWindow
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            🪟 Proximité Fenêtre
          </button>

          <button
            onClick={() => setFilters((f) => ({ ...f, pmr: !f.pmr }))}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
              filters.pmr
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            ♿ Accès PMR
          </button>

          <button
            onClick={() => setFilters((f) => ({ ...f, quietZone: !f.quietZone }))}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
              filters.quietZone
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            🤫 Zone Silencieuse
          </button>

          <button
            onClick={() => setFilters((f) => ({ ...f, statusFreeOnly: !f.statusFreeOnly }))}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
              filters.statusFreeOnly
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 text-[#00b050]" /> Libres uniquement
          </button>

          {(filters.doubleScreen || filters.nearWindow || filters.pmr || filters.quietZone || filters.statusFreeOnly) && (
            <button
              onClick={() =>
                setFilters({
                  doubleScreen: false,
                  nearWindow: false,
                  pmr: false,
                  quietZone: false,
                  statusFreeOnly: false
                })
              }
              className="text-xs text-rose-600 font-bold underline hover:text-rose-700 ml-auto"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      </div>

      {/* 2D Interactive Digital Twin Layout Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Chargement du Digital Twin OCP Safi...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredClusters.map((cluster) => {
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

                      return (
                        <div key={ws.id} className="relative group">
                          {/* Seat Pill Button */}
                          <button
                            disabled={readOnly || (ws.status !== 'disponible' && !isAdminOrSuperAdmin)}
                            onClick={() => {
                              if (onSelectSeat && ws.status === 'disponible') {
                                onSelectSeat(ws, cluster);
                              }
                              setActiveHoverSeat({ workstation: ws, cluster });
                            }}
                            onMouseEnter={() => setActiveHoverSeat({ workstation: ws, cluster })}
                            className={`w-full py-2.5 px-1 rounded-xl text-center flex flex-col items-center justify-center transition-all border font-bold text-xs seat-pill shadow-xs ${statusColor} ${
                              isSelected ? 'ring-4 ring-emerald-500 ring-offset-2 ring-offset-white scale-105 z-10' : ''
                            } ${ws.status !== 'disponible' && !isAdminOrSuperAdmin ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'}`}
                          >
                            <span className="text-[10px] tracking-tight opacity-90">{ws.code.split('-')[2]}</span>
                            <span className="text-[11px] truncate w-full font-extrabold">{ws.code}</span>

                            {/* Badge indicator for features */}
                            <div className="flex items-center justify-center space-x-1 mt-1 text-[9px] opacity-90">
                              {ws.metadata.has_double_screen && <span>🖥️</span>}
                              {ws.metadata.near_window && <span>🪟</span>}
                              {ws.metadata.is_pmr && <span>♿</span>}
                            </div>
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
          })}
        </div>
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
              <p className="text-xs text-slate-300 mt-1">
                Écran: {activeHoverSeat.workstation.metadata.monitor_size} | Dock: {activeHoverSeat.workstation.metadata.docking_station} | Port: {activeHoverSeat.workstation.metadata.network_port}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
            {onSelectSeat && activeHoverSeat.workstation.status === 'disponible' && !readOnly && (
              <button
                onClick={() => onSelectSeat(activeHoverSeat.workstation, activeHoverSeat.cluster)}
                className="bg-[#00b050] hover:bg-[#009040] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-md"
              >
                <Check className="w-4 h-4" />
                <span>Sélectionner ce poste</span>
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
    </div>
  );
};
