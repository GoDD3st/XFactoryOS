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
  AlertCircle
} from 'lucide-react';
import { Reservation, ReservationStatus, Workstation, Cluster } from '../../types';
import {
  fetchReservations,
  createReservation,
  updateReservationStatus,
  deleteReservation
} from '@/services/reservations/reservationService';
import { fetchClustersWithOverlays } from '@/services/workspaces/workspaceService';
import { useAuth } from '../../modules/auth/context/AuthContext';

interface ReservationsTableProps {
  initialFilter?: 'all' | 'upcoming' | 'checkin' | 'cancelled';
  userOnly?: boolean;
}

export const ReservationsTable: React.FC<ReservationsTableProps> = ({
  initialFilter = 'all',
  userOnly = false
}) => {
  const { currentUser } = useAuth();
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
  const [formNotes, setFormNotes] = useState<string>('Réservation poste de travail OCP Safi');
  const [formPurpose, setFormPurpose] = useState<string>('Projet XFactory OS');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

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

    // Extract cluster from seat code
    const parts = selectedSeatCode.split('-');
    const clusterCode = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'CL-A';
    const clusterObj = clusters.find((c) => c.code === clusterCode) || clusters[0];

    await createReservation({
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
    });

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
      case 'terminée':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-500/20 text-slate-400 border border-slate-500/40">Terminée</span>;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-5">
      {/* Table Header Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>Gestion des Réservations OCP Safi</span>
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
                <th className="py-3 px-4">Collaborateur / Département</th>
                <th className="py-3 px-4">Code Poste</th>
                <th className="py-3 px-4">Cluster</th>
                <th className="py-3 px-4">Date & Horaire</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredReservations.map((res) => (
                <tr key={res.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{res.user_name || 'Utilisateur OCP'}</div>
                    <div className="text-[11px] text-slate-500">{res.user_department || 'OCP SA Safi'}</div>
                  </td>

                  <td className="py-3 px-4">
                    <span className="font-extrabold px-2.5 py-1 rounded bg-slate-900 text-white tracking-wider">
                      {res.workstation_code}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-800">{res.cluster_name}</div>
                    <div className="text-[10px] text-slate-400">{res.cluster_id}</div>
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

      {/* Modal for + Nouvelle Réservation */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg p-6 space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                <span>Nouvelle Réservation de Poste - OCP Safi</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg"
              >
                ✕
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

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Heure début</label>
                  <input
                    type="time"
                    required
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Heure fin</label>
                  <input
                    type="time"
                    required
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Choix du Poste (56 postes disponibles)</label>
                <select
                  value={selectedSeatCode}
                  onChange={(e) => setSelectedSeatCode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                >
                  {clusters.map((cl) => (
                    <optgroup key={cl.id} label={`${cl.code} - ${cl.name}`}>
                      {cl.workstations.map((ws) => (
                        <option key={ws.id} value={ws.code}>
                          {ws.code} ({ws.status === 'disponible' ? 'Libre' : ws.status}) {ws.metadata.has_double_screen ? '🖥️ Double screen' : ''}
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
