import React, { useState } from 'react';
import {
  SlidersHorizontal,
  Users,
  Settings,
  ShieldAlert,
  Database,
  Lock,
  Eye,
  Wrench,
  Check
} from 'lucide-react';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { ReservationsTable } from '../../../shared/components/ReservationsTable';
import { useAuth } from '../../../modules/auth/context/AuthContext';

export const AdminView: React.FC = () => {
  const { canView8Postes } = useAuth();

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold text-xs">
              Rôle : Administrateur système
            </span>
            <span className="text-xs text-slate-400">Administration XFactory OS</span>
          </div>
          <h1 className="text-xl font-bold mt-1">Console Administrateur & Mode 8 Postes Extension</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Accès privilégié à la vue 8 postes extension (Indigo `#6366f1`), gestion des droits RLS et sur-réservations.
          </p>
        </div>

        <div className="bg-indigo-950/80 border border-indigo-500/40 px-4 py-2 rounded-xl text-center">
          <div className="text-xs text-indigo-300 font-semibold">Mode Vue 8 Postes Extension</div>
          <div className="text-sm font-black text-white flex items-center justify-center gap-1 mt-0.5">
            <Check className="w-4 h-4 text-emerald-400" /> Actif pour votre rôle
          </div>
        </div>
      </div>

      {/* Admin Feature Highlights Box */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 text-indigo-900 text-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
            <span>Contrôle Direct des Postes Extension (Seats 5-8 per cluster)</span>
          </p>
          <p className="text-indigo-700">
            En tant qu'administrateur, vous pouvez directement survoler n'importe quel poste d'extension (violet `#6366f1`) dans la carte Digital Twin ci-dessous pour le basculer en mode visible aux collaborateurs ou forcer un état de maintenance (`#f59e0b`).
          </p>
        </div>
      </div>

      {/* Digital Twin with active 8-Post Toggle */}
      <div>
        <DigitalTwin />
      </div>

      {/* Master Reservations Control */}
      <ReservationsTable />
    </div>
  );
};
