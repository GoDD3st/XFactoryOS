import React from 'react';
import {
  TrendingUp,
  Award,
  Users,
  Building,
  BarChart2,
  PieChart,
  Download,
  Calendar
} from 'lucide-react';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { ReservationsTable } from '../../../shared/components/ReservationsTable';

export const DirectionView: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-xs">
              Rôle : Directeur de Site
            </span>
            <span className="text-xs text-slate-400">Direction Générale OCP Safi</span>
          </div>
          <h1 className="text-xl font-bold mt-1">Tableau de Bord Exécutif & Métriques Stratégiques</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            KPIs de performance globale, taux d'utilisation des espaces de travail et optimisation immobilière.
          </p>
        </div>

        <button
          onClick={() => alert('Rapport Stratégique Exécutif OCP Safi (PDF) généré !')}
          className="bg-rose-700 hover:bg-rose-800 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-2"
        >
          <Download className="w-4 h-4" />
          <span>Synthèse Exécutive PDF</span>
        </button>
      </div>

      {/* Strategic Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Taux Occupation Moyen Mois</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">84.2%</div>
          <p className="text-[11px] text-emerald-600 font-semibold">+12% vs mois dernier</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Projets Hébergés</span>
            <Building className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">14 Projets</div>
          <p className="text-[11px] text-slate-500">Digital, Chimie & Ingestion</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Économie m² Flex-Office</span>
            <Award className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-900">+280 m²</div>
          <p className="text-[11px] text-purple-700 font-semibold">Gains d’espace optimisé</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Ratiomètre Présentiel</span>
            <Users className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">1.4 pers/poste</div>
          <p className="text-[11px] text-slate-500">Flex-Office Efficace</p>
        </div>
      </div>

      <DigitalTwin />
      <ReservationsTable />
    </div>
  );
};
