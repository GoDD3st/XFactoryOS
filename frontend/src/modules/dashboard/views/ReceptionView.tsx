import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  QrCode,
  Search,
  CheckCircle,
  Clock,
  Building,
  Users,
  ShieldCheck,
  BadgePlus,
  AlertCircle,
  Check
} from 'lucide-react';
import { ReservationsTable } from '../../../shared/components/ReservationsTable';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { getLocalReservations, updateReservationStatus } from '@/services/reservations/reservationService';
import { Reservation } from '../../../types';

// SRS 8.9: Visitor is "modélisé mais non activé en self-service" for Module 1 — the guest-badge
// panel below stays in the codebase (data/handlers untouched) but is not shown to receptionists
// until Visitor is actually activated in a future module.
const VISITOR_BADGE_ENABLED = false;

export const ReceptionView: React.FC = () => {
  const [todaysReservations, setTodaysReservations] = useState<Reservation[]>([]);
  const [visitorBadgeName, setVisitorBadgeName] = useState<string>('');
  const [visitorCompany, setVisitorCompany] = useState<string>('');
  const [assignedSeat, setAssignedSeat] = useState<string>('CL-A-01');
  const [guestBadges, setGuestBadges] = useState<
    Array<{ id: string; name: string; company: string; seat: string; time: string }>
  >([
    { id: 'GB-101', name: 'M. Marc Dupont', company: 'Schneider Electric', seat: 'CL-A-04', time: '09:15' },
    { id: 'GB-102', name: 'Mme. Sarah Cohen', company: 'OCP Solutions Casablanca', seat: 'CL-C-02', time: '10:00' }
  ]);

  const loadData = () => {
    const res = getLocalReservations();
    const today = new Date().toISOString().split('T')[0];
    setTodaysReservations(res.filter((r) => r.reservation_date === today));
  };

  useEffect(() => {
    loadData();
    window.addEventListener('xfactory_reservations_changed', loadData);
    return () => window.removeEventListener('xfactory_reservations_changed', loadData);
  }, []);

  const handleQuickCheckin = async (id: string) => {
    await updateReservationStatus(id, 'check-in');
    loadData();
  };

  const handleIssueBadge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitorBadgeName || !visitorCompany) return;
    const newBadge = {
      id: `GB-${Math.floor(100 + Math.random() * 900)}`,
      name: visitorBadgeName,
      company: visitorCompany,
      seat: assignedSeat,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setGuestBadges([newBadge, ...guestBadges]);
    setVisitorBadgeName('');
    setVisitorCompany('');
    alert(`Badge invité OCP Safi #${newBadge.id} émis avec succès pour ${newBadge.name} !`);
  };

  const activeCheckinsCount = todaysReservations.filter((r) => r.status === 'check-in').length;
  const pendingArrivalsCount = todaysReservations.filter((r) => r.status === 'confirmée').length;

  return (
    <div className="space-y-6">
      {/* Title & Stats Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded bg-teal-500/20 text-teal-300 font-bold text-xs">
              Rôle : Réceptionniste Site
            </span>
            <span className="text-xs text-slate-400">Accueil & Porterie Safi</span>
          </div>
          <h1 className="text-xl font-bold mt-1">Console Réception & Control Arrivées</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Validation des badges collaborateurs, enregistrement des invités et supervision en direct des accès postes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-800 px-4 py-2 rounded-xl border border-slate-700 text-center">
            <div className="text-xs text-slate-400">Check-ins Valider</div>
            <div className="text-lg font-black text-emerald-400">{activeCheckinsCount}</div>
          </div>

          <div className="bg-slate-800 px-4 py-2 rounded-xl border border-slate-700 text-center">
            <div className="text-xs text-slate-400">En attente d'arrivée</div>
            <div className="text-lg font-black text-amber-400">{pendingArrivalsCount}</div>
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${VISITOR_BADGE_ENABLED ? 'lg:grid-cols-3' : ''}`}>
        {/* Rapid Check-in Queue */}
        <div className={`bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4 ${VISITOR_BADGE_ENABLED ? 'lg:col-span-2' : ''}`}>
          <h3 className="text-sm font-bold text-slate-900 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-teal-600" />
              <span>Arrivées du Jour - Validation Rapide Check-in</span>
            </span>
            <span className="text-xs text-slate-500 font-normal">{todaysReservations.length} collaborateurs</span>
          </h3>

          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {todaysReservations.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">Aucune réservation aujourd'hui.</p>
            ) : (
              todaysReservations.map((res) => (
                <div key={res.id} className="py-3 flex items-start justify-between hover:bg-slate-50 px-2 rounded-lg transition-colors border-b border-slate-100/60 last:border-0">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-xs text-slate-900">{res.user_name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-bold">{res.user_department}</span>
                      <span className="text-[9px] font-mono text-slate-400">ID: {res.user_id}</span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium">
                      Poste: <strong className="text-slate-900">{res.workstation_code}</strong> ({res.cluster_name}) | Horaire: {res.start_time} - {res.end_time}
                    </p>
                    <p className="text-[11px] text-slate-500 font-semibold">
                      Motif: <span className="text-slate-800">{res.purpose || 'Session de travail'}</span>
                      {res.notes && <span className="text-slate-400 font-normal ml-2">— Notes: {res.notes}</span>}
                    </p>
                    <p className="text-[9px] font-mono text-slate-400">Réf: #{res.id.substring(0, 8)}</p>
                  </div>

                  <div>
                    {res.status === 'check-in' ? (
                      <span className="text-xs font-bold text-[#3b82f6] flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-lg">
                        <Check className="w-3.5 h-3.5" /> Badge Validé
                      </span>
                    ) : (
                      <button
                        onClick={() => handleQuickCheckin(res.id)}
                        className="bg-[#008751] hover:bg-[#005f38] text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center space-x-1"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Valider Entrée</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Issue Visitor Badge Form */}
        {VISITOR_BADGE_ENABLED && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BadgePlus className="w-4 h-4 text-teal-600" />
            <span>Émission Badge Invité Temporaire</span>
          </h3>

          <form onSubmit={handleIssueBadge} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Nom du Visiteur</label>
              <input
                type="text"
                required
                placeholder="Ex: M. Jean Martin"
                value={visitorBadgeName}
                onChange={(e) => setVisitorBadgeName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Entreprise / Organisme</label>
              <input
                type="text"
                required
                placeholder="Ex: Prestataire OCP / Siemens"
                value={visitorCompany}
                onChange={(e) => setVisitorCompany(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Affecter Poste Temporaire</label>
              <select
                value={assignedSeat}
                onChange={(e) => setAssignedSeat(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold"
              >
                <option value="CL-A-01">CL-A-01 (Innovation & Design)</option>
                <option value="CL-C-02">CL-C-02 (Facility Management)</option>
                <option value="CL-D-04">CL-D-04 (Security & Access)</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center space-x-1.5"
            >
              <QrCode className="w-4 h-4" />
              <span>Générer Badge Invité OCP</span>
            </button>
          </form>

          {/* Active Guest Badges List */}
          <div className="pt-2 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-800 mb-2">Badges Invités Émis Aujourd'hui</h4>
            <div className="space-y-2">
              {guestBadges.map((gb) => (
                <div key={gb.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex justify-between items-center">
                  <div>
                    <div className="font-bold text-slate-900">{gb.name} <span className="text-[10px] text-slate-500">({gb.company})</span></div>
                    <div className="text-[10px] text-slate-500">Poste: {gb.seat} | {gb.time}</div>
                  </div>
                  <span className="font-mono text-[10px] bg-slate-200 px-1.5 py-0.5 rounded font-bold">{gb.id}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Digital Twin Supervision */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3">Occupation Physique du Bâtiment (Digital Twin)</h3>
        <DigitalTwin readOnly={true} />
      </div>

      {/* Full Master Table */}
      <div>
        <ReservationsTable />
      </div>
    </div>
  );
};
