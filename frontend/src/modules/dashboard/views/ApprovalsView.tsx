import React, { useState, useEffect } from 'react';
import { Award, Check, X, Clock, HelpCircle, MessageSquare, AlertCircle, FileText } from 'lucide-react';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { ReservationsTable } from '../../../shared/components/ReservationsTable';
import { apiFetchPendingApprovals, apiDecideApproval, apiFetchApprovalHistory } from '@/services/api/approvalApi';
import { ApprovalRequest } from '../../../types';
import { useAuth } from '../../../modules/auth/context/AuthContext';

export const ApprovalsView: React.FC = () => {
  const { currentUser, currentRole } = useAuth();
  const [pendingRequests, setPendingRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDecisionId, setActiveDecisionId] = useState<string | null>(null);
  const [decisionType, setDecisionType] = useState<'approved' | 'rejected' | 'needs_info' | null>(null);
  const [decisionNote, setDecisionNote] = useState<string>('');
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const [history, setHistory] = useState<ApprovalRequest[]>([]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const [list, decided] = await Promise.all([
        apiFetchPendingApprovals(),
        apiFetchApprovalHistory().catch(() => [] as ApprovalRequest[]),
      ]);
      setPendingRequests(list);
      setHistory(decided);
    } catch (err) {
      console.error('Error loading pending approvals:', err);
    } finally {
      setLoading(false);
    }
  };

  const approvedCount = history.filter((r) => r.status === 'approved').length;
  const rejectedCount = history.filter((r) => r.status === 'rejected').length;

  useEffect(() => {
    loadRequests();
    window.addEventListener('xfactory_approvals_changed', loadRequests);
    return () => window.removeEventListener('xfactory_approvals_changed', loadRequests);
  }, []);

  const openDecisionModal = (id: string, type: 'approved' | 'rejected' | 'needs_info') => {
    setActiveDecisionId(id);
    setDecisionType(type);
    setDecisionError(null);
    // Only the approval path gets a default. A refusal (or a request for more information) is
    // sent verbatim to the requester in the notification, so a canned "refusée pour dépassement
    // de quota" would tell them nothing about the actual reason - the SRS workflow requires a
    // real motif here.
    setDecisionNote(type === 'approved' ? 'Extension accordée.' : '');
  };

  const requiresNote = decisionType === 'rejected' || decisionType === 'needs_info';

  const handleConfirmDecision = async () => {
    if (!activeDecisionId || !decisionType) return;

    if (requiresNote && decisionNote.trim().length < 5) {
      setDecisionError(
        decisionType === 'rejected'
          ? 'Un motif de refus est obligatoire - il est transmis au demandeur.'
          : "Précisez les informations attendues du demandeur."
      );
      return;
    }

    setDecisionError(null);
    try {
      await apiDecideApproval(
        activeDecisionId,
        decisionType,
        decisionNote.trim() || 'Extension accordée.'
      );
    } catch (err: any) {
      // Some pending requests are routed to a specific approver role (Director vs Executive
      // Assistant) - a decider outside that role gets rejected server-side rather than silently.
      setDecisionError(err?.message || 'Échec de la décision.');
      return;
    }

    setActiveDecisionId(null);
    setDecisionType(null);
    setDecisionNote('');
    loadRequests();
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold text-xs capitalize">
              Rôle : {currentRole.replace('_', ' ')}
            </span>
            <span className="text-xs text-slate-400">Arbitrage Réservations Multi-Jours (&gt; 2j Ouvrés)</span>
          </div>
          <h1 className="text-xl font-bold mt-1">Validation des Extensions &amp; Demandes Longue Durée</h1>
          {/* BR-06: the long-duration approvers are Executive Assistant and Director. Building
              Manager and Administrator were both removed from APPROVER_ROLES, so the previous
              wording here (which still listed them) no longer described who can decide. */}
          <p className="text-xs text-slate-400 mt-0.5">
            Approbateurs longue durée : Assistant(e) de Direction et Directeur (BR-06).
          </p>
        </div>

        {/* Three 92px-minimum tiles plus gaps do not fit a 375px screen beside the heading. They
            share the row evenly on a phone and keep their fixed width from sm upwards. */}
        <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-3 w-full sm:w-auto">
          <div className="bg-slate-800 px-2 sm:px-4 py-2 rounded-xl border border-slate-700 text-center sm:min-w-[92px]">
            <div className="text-xs text-slate-400">En attente</div>
            <div className="text-lg font-black text-purple-400">{loading ? '...' : pendingRequests.length}</div>
          </div>
          <div className="bg-slate-800 px-2 sm:px-4 py-2 rounded-xl border border-slate-700 text-center sm:min-w-[92px]">
            <div className="text-xs text-slate-400">Approuvées</div>
            <div className="text-lg font-black text-emerald-400">{loading ? '...' : approvedCount}</div>
          </div>
          <div className="bg-slate-800 px-2 sm:px-4 py-2 rounded-xl border border-slate-700 text-center sm:min-w-[92px]">
            <div className="text-xs text-slate-400">Refusées</div>
            <div className="text-lg font-black text-rose-400">{loading ? '...' : rejectedCount}</div>
          </div>
        </div>
      </div>

      {/* Pending VIP Approvals Queue */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Award className="w-4 h-4 text-purple-600" />
            <span>Demandes d'Extension (&gt; 2 Jours Ouvrés) en Attente d'Arbitrage</span>
          </span>
        </h3>

        {loading ? (
          <div className="p-6 text-center text-xs text-slate-400">Chargement depuis la base de données...</div>
        ) : pendingRequests.length === 0 ? (
          <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-500">
            Aucune demande d'extension en attente d'arbitrage.
          </div>
        ) : (
          <div className="space-y-4">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="p-5 rounded-2xl border border-purple-200 bg-purple-50/40 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-100 pb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-black text-sm text-slate-900">{req.requester_name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-purple-200 text-purple-800 font-bold">
                        {req.user_department || 'Non renseigné'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-white font-bold">
                        {req.duration_days || 3} Jours Ouvrés
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      Poste: <strong>{req.workstation_code || 'WS'}</strong> ({req.cluster_name || 'Cluster Safi'}) | Du {req.reservation_date} au {req.end_date}
                    </p>
                  </div>

                  <span className="text-[11px] font-bold text-slate-400">
                    ID: {req.id.substring(0, 10)}
                  </span>
                </div>

                {/* Detailed Objective Section */}
                <div className="bg-white p-3.5 rounded-xl border border-purple-100 space-y-1 text-xs">
                  <div className="font-bold text-slate-700 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-purple-600" />
                    <span>Objectif &amp; Description Détaillée de la Demande :</span>
                  </div>
                  {/* break-words: this is free text the requester typed. A single long unbroken token - a
                      pasted id, a URL, or just a run of characters - had no wrap opportunity and
                      pushed the whole page into horizontal scrolling on a phone. */}
                  <p className="text-slate-800 leading-relaxed font-semibold pl-5 break-words">
                    "{req.objective || req.reason}"
                  </p>
                </div>

                {/* 3 Approver Actions */}
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  {/* Demander nouvelle description (Re-loop) */}
                  <button
                    onClick={() => openDecisionModal(req.id, 'needs_info')}
                    className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-amber-700" />
                    <span>Demander nouvelle description</span>
                  </button>

                  {/* Refuser */}
                  <button
                    onClick={() => openDecisionModal(req.id, 'rejected')}
                    className="bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5 text-rose-700" />
                    <span>Refuser avec motif</span>
                  </button>

                  {/* Approuver */}
                  <button
                    onClick={() => openDecisionModal(req.id, 'approved')}
                    className="bg-[#008751] hover:bg-[#005f38] text-white px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approuver l'extension</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Decision Confirmation Modal */}
      {activeDecisionId && decisionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center space-x-2 font-bold text-slate-900 border-b border-slate-100 pb-3">
              <MessageSquare className="w-5 h-5 text-purple-600" />
              <span>
                {decisionType === 'approved'
                  ? 'Confirmer l\'Approbation'
                  : decisionType === 'needs_info'
                  ? 'Demander une Nouvelle Description (Re-Loop)'
                  : 'Confirmer le Refus de l\'Extension'}
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                {decisionType === 'needs_info'
                  ? 'Précisez la remarque ou les informations attendues du demandeur :'
                  : decisionType === 'rejected'
                  ? 'Motif du refus * (transmis au demandeur)'
                  : 'Motif ou remarque de décision :'}
              </label>
              <textarea
                rows={3}
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder={requiresNote ? 'Obligatoire - expliquez la décision au demandeur.' : ''}
                className="w-full p-3 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-purple-600 outline-none"
              />
            </div>

            {decisionError && (
              <div className="flex items-start space-x-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{decisionError}</span>
              </div>
            )}

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  setActiveDecisionId(null);
                  setDecisionType(null);
                  setDecisionError(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmDecision}
                disabled={requiresNote && decisionNote.trim().length < 5}
                className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                  decisionType === 'approved'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : decisionType === 'needs_info'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                Valider la Décision
              </button>
            </div>
          </div>
        </div>
      )}

      <DigitalTwin />
      <ReservationsTable />
    </div>
  );
};
