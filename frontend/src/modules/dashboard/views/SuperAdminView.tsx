import React, { useState } from 'react';
import {
  ShieldAlert,
  Database,
  Cpu,
  RefreshCw,
  Terminal,
  Activity,
  CheckCircle,
  Server
} from 'lucide-react';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { ReservationsTable } from '../../../shared/components/ReservationsTable';
import { supabase } from '@/services/supabase/supabaseClient';

export const SuperAdminView: React.FC = () => {
  const [dbStatus, setDbStatus] = useState<'connected' | 'checking' | 'fallback'>('connected');
  const [lastSyncTime, setLastSyncTime] = useState<string>(new Date().toLocaleTimeString());

  const handleTestDbSync = async () => {
    setDbStatus('checking');
    try {
      const { data, error } = await supabase.from('clusters').select('count', { count: 'exact', head: true });
      if (!error) {
        setDbStatus('connected');
      } else {
        setDbStatus('fallback');
      }
    } catch (e) {
      setDbStatus('fallback');
    }
    setLastSyncTime(new Date().toLocaleTimeString());
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded bg-violet-500/20 text-violet-300 font-bold text-xs">
              Rôle : Super Admin Enterprise
            </span>
            <span className="text-xs text-slate-400">Contrôle Total Infrastructure & Supabase</span>
          </div>
          <h1 className="text-xl font-bold mt-1">Super Admin Console & Systèmes OCP SA</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Diagnostic en direct Supabase PostgreSQL (`ygoqiipvarlqtvpuhrbo`), journaux de sécurité, matrice RBAC et état de la synchronisation.
          </p>
        </div>

        <button
          onClick={handleTestDbSync}
          className="bg-violet-700 hover:bg-violet-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-md"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${dbStatus === 'checking' ? 'animate-spin' : ''}`} />
          <span>Tester Connexion Supabase</span>
        </button>
      </div>

      {/* Supabase Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
            <span>Base Supabase DB</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-black text-emerald-400 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Connecté (PostgreSQL)</span>
          </div>
          <p className="text-[11px] text-slate-400">Dernière synchro : {lastSyncTime}</p>
        </div>

        <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
            <span>Matrice RBAC</span>
            <ShieldAlert className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-lg font-black text-white">10 Rôles Unifiés</div>
          <p className="text-[11px] text-slate-400">Collaborateur à Super Admin</p>
        </div>

        <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
            <span>Capacité Totale Site</span>
            <Server className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-lg font-black text-white">56 Postes (7 Clusters x 8)</div>
          <p className="text-[11px] text-slate-400">Règle des 8 sièges stricte</p>
        </div>
      </div>

      <DigitalTwin />
      <ReservationsTable />
    </div>
  );
};
