import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Award,
  Sparkles,
  Check,
  X,
  User
} from 'lucide-react';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { ReservationsTable } from '../../../shared/components/ReservationsTable';

interface VIPRequest {
  id: string;
  requester: string;
  department: string;
  cluster: string;
  seatCode: string;
  date: string;
  time: string;
  reason: string;
}

export const ApprovalsView: React.FC = () => {
  const [pendingRequests, setPendingRequests] = useState<VIPRequest[]>([
    {
      id: 'REQ-801',
      requester: 'M. Rachid Bennani (Directeur Industriel)',
      department: 'Direction Chimie Safi',
      cluster: 'CL-F Management Restricted 1',
      seatCode: 'CL-F-01',
      date: new Date().toISOString().split('T')[0],
      time: '09:00 - 18:00',
      reason: 'Comité Exécutif OCP SA & Délégation Partenaires'
    },
    {
      id: 'REQ-802',
      requester: 'Mme. Leila Tazi (Auditeur Externe)',
      department: 'Audit Général OCP',
      cluster: 'CL-G Management Restricted 2',
      seatCode: 'CL-G-03',
      date: new Date().toISOString().split('T')[0],
      time: '10:30 - 16:00',
      reason: 'Mission Audit Stratégique Site Safi'
    }
  ]);

  const handleApprove = (id: string) => {
    setPendingRequests(pendingRequests.filter((r) => r.id !== id));
    alert(`Demande VIP #${id} validée avec succès ! Inscription dans la table officielle des réservations OCP.`);
  };

  const handleReject = (id: string) => {
    setPendingRequests(pendingRequests.filter((r) => r.id !== id));
    alert(`Demande VIP #${id} refusée.`);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold text-xs">
              Rôle : Assistant Direction
            </span>
            <span className="text-xs text-slate-400">Secrétariat Général OCP Safi</span>
          </div>
          <h1 className="text-xl font-bold mt-1">Validation des Demandes VIP & Clusters F/G</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            File d'attente d'approbation pour l'accès aux postes haute confidentialité et réservations VIP.
          </p>
        </div>

        <div className="bg-slate-800 px-4 py-2 rounded-xl border border-slate-700 text-center">
          <div className="text-xs text-slate-400">Demandes en Attente</div>
          <div className="text-lg font-black text-purple-400">{pendingRequests.length}</div>
        </div>
      </div>

      {/* Pending VIP Approvals Queue */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Award className="w-4 h-4 text-purple-600" />
            <span>Demandes VIP & Direction en Attente de Validation</span>
          </span>
        </h3>

        {pendingRequests.length === 0 ? (
          <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-500">
            Toutes les demandes VIP ont été traitées.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="p-4 rounded-xl border border-purple-200 bg-purple-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-extrabold text-xs text-slate-900">{req.requester}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-purple-200 text-purple-800 font-bold">{req.id}</span>
                  </div>
                  <p className="text-xs text-slate-600 font-medium">
                    Poste : <strong className="text-purple-900">{req.seatCode}</strong> ({req.cluster}) | Date: {req.date} ({req.time})
                  </p>
                  <p className="text-xs text-slate-500 italic">Motif : "{req.reason}"</p>
                </div>

                <div className="flex items-center space-x-2 justify-end">
                  <button
                    onClick={() => handleReject(req.id)}
                    className="bg-slate-100 hover:bg-rose-100 text-rose-700 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Refuser</span>
                  </button>

                  <button
                    onClick={() => handleApprove(req.id)}
                    className="bg-[#008751] hover:bg-[#005f38] text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md flex items-center space-x-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approuver & Réserver</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DigitalTwin />
      <ReservationsTable />
    </div>
  );
};
