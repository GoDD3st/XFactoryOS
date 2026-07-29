import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  QrCode,
  FileText,
  AlertTriangle,
  Printer,
  Check,
  Radio
} from 'lucide-react';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { ReservationsTable } from '../../../shared/components/ReservationsTable';
import { getLocalReservations } from '@/services/reservations/reservationService';

export const SecurityView: React.FC = () => {
  const reservations = getLocalReservations();
  const activeOccupants = reservations.filter((r) => r.status === 'check-in');

  const handlePrintEvacuationList = () => {
    alert(`Génération du Registre d'Évacuation d'Urgence OCP Safi (${activeOccupants.length} personnes présentes sur site).`);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded bg-slate-700 text-slate-200 font-bold text-xs">
              Rôle : Gardien Sécurité & Porterie
            </span>
            <span className="text-xs text-slate-400">Contrôle Accès Port & Site Safi</span>
          </div>
          <h1 className="text-xl font-bold mt-1">Console Sécurité & Registre Présence en Direct</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Validation des badges d'accès au port OCP, vérification des présents sur site et plan d'évacuation d'urgence.
          </p>
        </div>

        <button
          onClick={handlePrintEvacuationList}
          className="bg-rose-700 hover:bg-rose-800 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-2"
        >
          <Printer className="w-4 h-4" />
          <span>Liste d'Évacuation Urgence ({activeOccupants.length})</span>
        </button>
      </div>

      {/* Security Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
            <span>Occupants Présents sur Site</span>
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
          </div>
          <div className="text-2xl font-black text-emerald-400">{activeOccupants.length} Personnes</div>
          <p className="text-[11px] text-slate-400">Badges validés à la porterie</p>
        </div>

        <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
            <span>Accès Port & Zone Risque</span>
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-white">Niveau 1 Conforme</div>
          <p className="text-[11px] text-slate-400">Accréditations OCP Valides</p>
        </div>

        <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
            <span>Alertes Accès Non Autorisé</span>
            <ShieldAlert className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400">0 Alerte</div>
          <p className="text-[11px] text-slate-400">Système sécurisé</p>
        </div>
      </div>

      <DigitalTwin />
      <ReservationsTable />
    </div>
  );
};
