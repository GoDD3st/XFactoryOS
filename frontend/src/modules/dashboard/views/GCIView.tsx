import React from 'react';
import {
  Briefcase,
  ShieldCheck,
  FileCheck,
  PieChart,
  Lock,
  Download,
  AlertCircle
} from 'lucide-react';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { ReservationsTable } from '../../../shared/components/ReservationsTable';

export const GCIView: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold text-xs">
              Rôle : GCI Governance Manager
            </span>
            <span className="text-xs text-slate-400">Gouvernance Chimie & Intégration Industrielle Safi</span>
          </div>
          <h1 className="text-xl font-bold mt-1">Conformité & Allocation Clusters Restreints</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Supervision de la politique d'allocation des postes pour le pôle Chimie & Gouvernance (Clusters E, F, G).
          </p>
        </div>

        <button
          onClick={() => alert('Rapport de Conformité GCI OCP Safi (PDF) généré !')}
          className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-2"
        >
          <Download className="w-4 h-4" />
          <span>Exporter Audit Conformité</span>
        </button>
      </div>

      {/* Compliance Quotas Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Quota Cluster CL-E (GCI)</span>
            <Lock className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">8 / 8 postes</div>
          <p className="text-[11px] text-cyan-700 font-semibold">Allocations 100% conformes</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Clusters Restreints VIP (CL-F & CL-G)</span>
            <ShieldCheck className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-900">Accès VIP Restreint</div>
          <p className="text-[11px] text-purple-700 font-semibold">16 postes protégés par RLS</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Score Audit Sécurité</span>
            <FileCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600">99.8%</div>
          <p className="text-[11px] text-slate-500">Zéro violation de quota détectée</p>
        </div>
      </div>

      {/* Digital Twin */}
      <div>
        <h2 className="text-sm font-bold text-slate-900 mb-2">Cartographie des 7 Clusters - Vue Gouvernance GCI</h2>
        <DigitalTwin />
      </div>

      <ReservationsTable />
    </div>
  );
};
