import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  CheckCircle,
  XCircle,
  Trash2,
  Filter,
  Calendar,
  Clock,
  MapPin,
  User,
  Check,
  RefreshCw,
  AlertCircle,
  ArrowRightLeft,
} from 'lucide-react';
import { Reservation, ReservationStatus, Workstation, Cluster, SystemSettings } from '../../types';
import {
  fetchReservations,
  createReservation,
  updateReservationStatus,
  deleteReservation
} from '@/services/reservations/reservationService';
import { fetchClustersWithOverlays } from '@/services/workspaces/workspaceService';
import { SettingsService } from '@/services/settings/settingsService';
import { useAuth } from '../../modules/auth/context/AuthContext';
import { DateTimePicker24h } from './DateTimePicker24h';
import { apiTransferReservation } from '@/services/api/reservationApi';
import { RESERVATION_TRANSFER_ROLES } from '@/services/reservations/reservationTransferService';

/**
 * The reservation table, shared by every role that manages bookings.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * BEFORE YOU MODIFY THIS
 *
 * Six views render this component:
 *   AdminView, SuperAdminView, BuildingView, DirectionView, ReceptionView, ApprovalsView
 *
 * They differ only by the two props below. A change to the columns, the action buttons or the
 * status handling lands in all six at once - including screens for roles that must NOT be able to
 * act on someone else's reservation. Check `userOnly` and `currentRole` before adding an action.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Data: reads through reservationService and workspaceService rather than holding its own copy,
 * so it sees the same rows the rest of the app does. It re-reads on the app's
 * `xfactory_*_changed` events instead of polling - a booking made on the Digital Twin repaints
 * this table without either component knowing about the other.
 *
 * Settings are read live and refreshed on `xfactory_settings_changed`, because an administrator
 * changing the booking window while this table is open must not leave it validating against the
 * previous rules.
 *
 * Writes go through the service, never straight to a repository: the guard chain in
 * ReservationService.createReservation (quotas, conflicts, approval routing) is the whole reason
 * a reservation is legal, and calling the repository directly would skip all of it.
 */
interface ReservationsTableProps {
  /**
   * Which slice to open on. 'upcoming' and 'checkin' are the operational views (Reception,
   * Building); 'all' is the administrative one. Only the initial state - the user can change it.
   */
  initialFilter?: 'all' | 'upcoming' | 'checkin' | 'cancelled';
  /**
   * Restrict to the signed-in user's own reservations.
   *
   * This is a UI convenience, NOT a security boundary. The server decides what a caller may read
   * and modify (see requireOwnerOrAdmin in backend/middleware/rbacMiddleware.ts). Passing false
   * does not grant anything; it only stops filtering client-side.
   */
  userOnly?: boolean;
}

export const ReservationsTable: React.FC<ReservationsTableProps> = ({
  initialFilter = 'all',
  userOnly = false
}) => {
  const { currentUser, currentRole } = useAuth();
  const [settings, setSettings] = useState<SystemSettings>(SettingsService.getSettings() as SystemSettings);
  const [formError, setFormError] = useState<string | undefined>();

  useEffect(() => {
    const handleSettingsChange = () => setSettings(SettingsService.getSettings() as SystemSettings);
    window.addEventListener('xfactory_settings_changed', handleSettingsChange);
    return () => window.removeEventListener('xfactory_settings_changed', handleSettingsChange);
  }, []);

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters & Search
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>(initialFilter);

  // Modal State for "+ Nouvelle réservation"
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [clusters, setClusters] = useState<Cluster[]>([]);

  // Modal Form State
  const [formDate, setFormDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formStartTime, setFormStartTime] = useState<string>('08:30');
  const [formEndTime, setFormEndTime] = useState<string>('17:30');
  const [formUserName, setFormUserName] = useState<string>(currentUser.full_name);
  const [formDepartment, setFormDepartment] = useState<string>(currentUser.department);
  const [selectedSeatCode, setSelectedSeatCode] = useState<string>('CL-A-01');
  const [formNotes, setFormNotes] = useState<string>('Réservation poste de travail');
  const [formPurpose, setFormPurpose] = useState<string>('Projet XFactory OS');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  /**
   * Moving a reservation onto another desk.
   *
   * Restricted to the roles that make allocation decisions - Building Manager, Administrator,
   * Super Administrator, Director, Executive Assistant. The check here only hides the control;
   * the route enforces the same list, because a hidden button is not authorization.
   */
  const canTransfer = RESERVATION_TRANSFER_ROLES.includes(currentRole);
  const [transferTarget, setTransferTarget] = useState<Reservation | null>(null);
  const [transferSeatCode, setTransferSeatCode] = useState<string>('');
  const [transferError, setTransferError] = useState<string | undefined>();
  const [transferBusy, setTransferBusy] = useState<boolean>(false);

  const openTransfer = (reservation: Reservation) => {
    setTransferTarget(reservation);
    setTransferSeatCode('');
    setTransferError(undefined);
  };

  const submitTransfer = async () => {
    if (!transferTarget || !transferSeatCode) return;
    setTransferBusy(true);
    setTransferError(undefined);
    try {
      await apiTransferReservation(transferTarget.id, { workstationCode: transferSeatCode });
      setTransferTarget(null);
      await loadReservations();
      // The floor plan is showing the old desk as taken and the new one as free until it hears.
      window.dispatchEvent(new CustomEvent('xfactory_reservations_changed'));
    } catch (err: any) {
      setTransferError(err?.message || 'Échec du déplacement.');
    } finally {
      setTransferBusy(false);
    }
  };

  const loadReservations = async () => {
    setLoading(true);
    const data = await fetchReservations();
    setReservations(data);
    setLoading(false);
  };

  const loadClusters = async () => {
    const data = await fetchClustersWithOverlays();
    setClusters(data);
  };

  useEffect(() => {
    loadReservations();
    loadClusters();

    const handleResChange = () => {
      fetchReservations().then(setReservations);
    };

    window.addEventListener('xfactory_reservations_changed', handleResChange);
    return () => window.removeEventListener('xfactory_reservations_changed', handleResChange);
  }, []);

  const handleCheckIn = async (id: string) => {
    await updateReservationStatus(id, 'check-in');
    loadReservations();
  };

  const handleCancel = async (id: string) => {
    await updateReservationStatus(id, 'annulée');
    loadReservations();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Voulez-vous supprimer définitivement cette réservation ?')) {
      await deleteReservation(id);
      loadReservations();
    }
  };

  const handleCreateNewReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeatCode) return;

    setIsSubmitting(true);
    setFormError(undefined);

    // Extract cluster from seat code
    const parts = selectedSeatCode.split('-');
    const clusterCode = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'CL-A';
    const clusterObj = clusters.find((c) => c.code === clusterCode) || clusters[0];

    try {
      await createReservation(
        {
          user_id: currentUser.id,
          user_name: formUserName,
          user_department: formDepartment,
          workstation_id: `ws-${selectedSeatCode}`,
          workstation_code: selectedSeatCode,
          cluster_id: clusterObj ? clusterObj.id : 'cl-A',
          cluster_name: clusterObj ? clusterObj.name : 'Innovation & Design',
          reservation_date: formDate,
          start_time: formStartTime,
          end_time: formEndTime,
          notes: formNotes,
          purpose: formPurpose,
          status: 'confirmée'
        },
        currentRole
      );
    } catch (err: any) {
      setFormError(err?.message || 'Erreur lors de la création de la réservation.');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setIsModalOpen(false);
    loadReservations();
  };

  const filteredReservations = reservations.filter((res) => {
    if (userOnly && res.user_id !== currentUser.id && res.user_name !== currentUser.full_name) {
      return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = (res.user_name || '').toLowerCase().includes(q);
      const matchCode = res.workstation_code.toLowerCase().includes(q);
      const matchCluster = res.cluster_name.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchCluster) return false;
    }

    if (statusFilter === 'upcoming') {
      return res.status === 'confirmée' || res.status === 'en attente';
    }
    if (statusFilter === 'checkin') {
      return res.status === 'check-in';
    }
    if (statusFilter === 'cancelled') {
      return res.status === 'annulée';
    }

    return true;
  });

  const getStatusBadge = (status: ReservationStatus) => {
    switch (status) {
      case 'confirmée':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#00b050]/20 text-[#00b050] border border-[#00b050]/40">Confirmée</span>;
      case 'check-in':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/40">Check-in Actif</span>;
      case 'en attente':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-500 border border-amber-500/40">En attente</span>;
      case 'annulée':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#e05252]/20 text-[#e05252] border border-[#e05252]/40">Annulée</span>;
      case 'rejetée':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-600/20 text-rose-500 border border-rose-600/40">Refusée</span>;
      case 'terminée':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-500/20 text-slate-400 border border-slate-500/40">Terminée</span>;
      case 'no-show':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-500/20 text-orange-500 border border-orange-500/40">No-Show</span>;
      case 'check-out':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-500/20 text-slate-400 border border-slate-500/40">Check-out</span>;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-5">
      {/* Table Header Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>Gestion des Réservations</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
              {filteredReservations.length} enregistrements
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Suivi en direct des réservations, actions de check-in et annulation.
          </p>
        </div>

        <button
          onClick={() => {
            setFormUserName(currentUser.full_name);
            setFormDepartment(currentUser.department);
            setIsModalOpen(true);
          }}
          className="bg-[#008751] hover:bg-[#005f38] text-white px-4 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md shadow-emerald-900/10 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>+ Nouvelle réservation</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par nom, poste (ex: CL-A-01), cluster..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center space-x-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            Toutes
          </button>

          <button
            onClick={() => setStatusFilter('upcoming')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              statusFilter === 'upcoming'
                ? 'bg-[#00b050] text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            À venir / Confirmées
          </button>

          <button
            onClick={() => setStatusFilter('checkin')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              statusFilter === 'checkin'
                ? 'bg-[#3b82f6] text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            Check-in Actifs
          </button>

          <button
            onClick={() => setStatusFilter('cancelled')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              statusFilter === 'cancelled'
                ? 'bg-[#e05252] text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            Annulées
          </button>
        </div>
      </div>

      {/* Table Data Render */}
      {loading ? (
        <div className="py-12 text-center flex flex-col items-center space-y-2">
          <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Chargement des données de réservation...</p>
        </div>
      ) : filteredReservations.length === 0 ? (
        <div className="py-12 border-2 border-dashed border-slate-200 rounded-2xl text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Aucune réservation trouvée</p>
          <p className="text-xs text-slate-400">Ajustez vos filtres de recherche ou créez une nouvelle réservation.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                <th className="py-3 px-4">Collaborateur & ID</th>
                <th className="py-3 px-4">Poste & Cluster</th>
                <th className="py-3 px-4">Date & Horaire</th>
                <th className="py-3 px-4">Motif & Détails</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredReservations.map((res) => (
                <tr key={res.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{res.user_name || 'Utilisateur'}</div>
                    <div className="text-[11px] font-semibold text-emerald-700">{res.user_department || 'Digital Factory'}</div>
                    <div className="text-[10px] text-slate-400 font-mono">ID: {res.user_id}</div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-extrabold px-2.5 py-1 rounded bg-slate-900 text-white tracking-wider text-[11px]">
                        {res.workstation_code}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-800 text-[11px]">{res.cluster_name}</div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex items-center space-x-1 font-semibold text-slate-800">
                      <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{res.reservation_date}</span>
                    </div>
                    <div className="flex items-center space-x-1 text-[11px] text-slate-500 mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>{res.start_time} - {res.end_time}</span>
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-800 text-[11px]">{res.purpose || 'Session de travail'}</div>
                    {res.notes && (
                      <div className="text-[10px] text-slate-500 max-w-xs truncate" title={res.notes}>
                        Notes: {res.notes}
                      </div>
                    )}
                    <div className="text-[9px] text-slate-400 font-mono mt-0.5">Ref: #{res.id.substring(0, 8)}</div>
                  </td>

                  <td className="py-3 px-4">
                    {getStatusBadge(res.status)}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end space-x-1.5">
                      {res.status === 'confirmée' && (
                        <button
                          onClick={() => handleCheckIn(res.id)}
                          title="Effectuer le Check-in"
                          className="bg-[#3b82f6] hover:bg-blue-600 text-white px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center space-x-1"
                        >
                          <Check className="w-3 h-3" />
                          <span>Check-in</span>
                        </button>
                      )}

                      {canTransfer && ['confirmée', 'check-in', 'en attente'].includes(res.status) && (
                        <button
                          onClick={() => openTransfer(res)}
                          title="Déplacer vers un autre poste"
                          className="bg-slate-100 hover:bg-teal-50 text-teal-700 border border-slate-200 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center space-x-1"
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          <span>Déplacer</span>
                        </button>
                      )}

                      {res.status !== 'annulée' && (
                        <button
                          onClick={() => handleCancel(res.id)}
                          title="Annuler la réservation"
                          className="bg-slate-100 hover:bg-rose-50 text-rose-600 border border-slate-200 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center space-x-1"
                        >
                          <XCircle className="w-3 h-3" />
                          <span>Annuler</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(res.id)}
                        title="Supprimer la réservation"
                        className="p-1.5 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Déplacer une réservation vers un autre poste.
          The window, the holder and the status stay as they are - only the desk changes. The
          server re-checks availability and BR-07 for the HOLDER before accepting. */}
      {transferTarget && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-teal-600" />
                <span>Déplacer la réservation</span>
              </h3>
              <button
                onClick={() => setTransferTarget(null)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
              <p>
                <span className="font-bold text-slate-800">{transferTarget.user_name}</span> —{' '}
                {transferTarget.reservation_date} ({transferTarget.start_time} - {transferTarget.end_time})
              </p>
              <p>
                Poste actuel :{' '}
                <span className="font-bold text-slate-800">{transferTarget.workstation_code}</span>
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nouveau poste</label>
              <select
                value={transferSeatCode}
                onChange={(e) => setTransferSeatCode(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
              >
                <option value="">Sélectionner un poste...</option>
                {clusters.flatMap((cl) =>
                  cl.workstations
                    .filter((w) => w.code !== transferTarget.workstation_code && w.status !== 'maintenance')
                    .map((w) => (
                      <option key={w.id} value={w.code}>
                        {w.code} — {cl.name}
                        {w.reservable === false ? ' (Direction/VIP)' : ''}
                      </option>
                    ))
                )}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Le créneau et le collaborateur ne changent pas. La disponibilité du poste de
                destination est vérifiée par le serveur.
              </p>
            </div>

            {transferError && (
              <div className="p-3 rounded-xl bg-red-50 text-red-800 border border-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{transferError}</span>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setTransferTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                onClick={submitTransfer}
                disabled={!transferSeatCode || transferBusy}
                className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-extrabold"
              >
                {transferBusy ? 'Déplacement...' : 'Déplacer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for + Nouvelle Réservation */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg p-6 space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                <span>Nouvelle Réservation de Poste</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg"
              >

              </button>
            </div>

            <form onSubmit={handleCreateNewReservation} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Collaborateur</label>
                  <input
                    type="text"
                    required
                    value={formUserName}
                    onChange={(e) => setFormUserName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Département</label>
                  <input
                    type="text"
                    required
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
                  />
                </div>
              </div>

              <DateTimePicker24h
                startDate={formDate}
                endDate={formDate}
                startTime={formStartTime}
                endTime={formEndTime}
                settings={settings}
                userRole={currentRole}
                onChange={(d) => {
                  setFormDate(d.startDate);
                  setFormStartTime(d.startTime);
                  setFormEndTime(d.endTime);
                }}
              />

              {formError && (
                <div className="p-3 rounded-xl bg-red-50 text-red-800 border border-red-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Choix du Poste</label>
                <select
                  value={selectedSeatCode}
                  onChange={(e) => setSelectedSeatCode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                >
                  {clusters.map((cl) => (
                    <optgroup key={cl.id} label={`${cl.code} - ${cl.name}`}>
                      {cl.workstations.map((ws) => (
                        <option key={ws.id} value={ws.code}>
                          {ws.code} ({ws.status === 'disponible' ? 'Libre' : ws.status})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Motif / Projet</label>
                <input
                  type="text"
                  value={formPurpose}
                  onChange={(e) => setFormPurpose(e.target.value)}
                  placeholder="Ex: Projet Digital Twin Safi"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Remarques</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-[#008751] hover:bg-[#005f38] text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-900/20 flex items-center space-x-2"
                >
                  {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Confirmer la réservation</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};