import React, { useEffect, useState } from 'react';
import { KeyRound, Check, X, Clock, AlertCircle } from 'lucide-react';
import { ClusterAuthorization } from '@/frontend/src/types';
import { apiFetchPendingClusterAccessRequests, apiDecideClusterAccessRequest } from '@/services/api/workspaceApi';

/**
 * BR-09 / SRS §14.4 — pending requests for locked management-cluster access, with
 * Autoriser/Refuser decisions. Shown to Building Manager / GCI Manager / Admin / Super Admin
 * (the same roles the backend's decision endpoint accepts).
 *
 * Approving requires an explicit end time: SRS §2158 makes these clusters "désactivés par
 * défaut" and the activation "temporaire", so the decider grants a window rather than flipping
 * the cluster open indefinitely. The server re-locks the cluster once the window elapses.
 */
interface ClusterAccessRequestsPanelProps {
  /** Fired after a decision (approve/refuse) is successfully recorded. */
  onDecided?: () => void;
  /** Render an explicit "no pending requests" card instead of collapsing to nothing. */
  showEmptyState?: boolean;
}

const DURATION_PRESETS: { label: string; minutes: number }[] = [
  { label: '2 h', minutes: 120 },
  { label: '4 h', minutes: 240 },
  { label: "Journée (8 h)", minutes: 480 },
  { label: '24 h', minutes: 1440 },
];

/** `datetime-local` wants local wall-clock time, not the UTC that toISOString() produces. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const ClusterAccessRequestsPanel: React.FC<ClusterAccessRequestsPanelProps> = ({
  onDecided,
  showEmptyState = false,
}) => {
  const [requests, setRequests] = useState<ClusterAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDecisionId, setActiveDecisionId] = useState<string | null>(null);
  const [decisionType, setDecisionType] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [windowMode, setWindowMode] = useState<'preset' | 'range'>('preset');
  const [presetMinutes, setPresetMinutes] = useState(480);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');

  const loadRequests = async () => {
    setLoading(true);
    try {
      const list = await apiFetchPendingClusterAccessRequests();
      setRequests(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
    window.addEventListener('xfactory_workstations_changed', loadRequests);
    return () => window.removeEventListener('xfactory_workstations_changed', loadRequests);
  }, []);

  const openDecision = (req: ClusterAuthorization, type: 'APPROVED' | 'REJECTED') => {
    setActiveDecisionId(req.id);
    setDecisionType(type);
    setDecisionNote(type === 'APPROVED' ? 'Accès autorisé.' : 'Demande refusée.');
    setDecisionError(null);

    // Pre-fill with whatever window the requester asked for, so the decider confirms or edits
    // an actual proposal instead of typing one from scratch.
    if (req.starts_at && req.ends_at) {
      setWindowMode('range');
      setStartAt(toLocalInputValue(new Date(req.starts_at)));
      setEndAt(toLocalInputValue(new Date(req.ends_at)));
    } else {
      setWindowMode('preset');
      setPresetMinutes(480);
      setStartAt('');
      setEndAt('');
    }
  };

  const closeDecision = () => {
    setActiveDecisionId(null);
    setDecisionType(null);
    setDecisionError(null);
  };

  const confirmDecision = async () => {
    if (!activeDecisionId || !decisionType) return;

    let startsAtIso: string | undefined;
    let endsAtIso: string | undefined;

    if (decisionType === 'APPROVED') {
      if (windowMode === 'preset') {
        const start = new Date();
        startsAtIso = start.toISOString();
        endsAtIso = new Date(start.getTime() + presetMinutes * 60000).toISOString();
      } else {
        if (!startAt || !endAt) {
          setDecisionError('Précisez une heure de début et une heure de fin.');
          return;
        }
        startsAtIso = new Date(startAt).toISOString();
        endsAtIso = new Date(endAt).toISOString();
        if (new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {
          setDecisionError("L'heure de fin doit être postérieure à l'heure de début.");
          return;
        }
        if (new Date(endsAtIso).getTime() <= Date.now()) {
          setDecisionError("L'heure de fin doit être dans le futur.");
          return;
        }
      }
    }

    setSubmitting(true);
    setDecisionError(null);
    try {
      await apiDecideClusterAccessRequest(activeDecisionId, decisionType, {
        note: decisionNote,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
      });
      closeDecision();
      setDecisionNote('');
      await loadRequests();
      onDecided?.();
    } catch (err: any) {
      setDecisionError(err.message || 'Échec de la décision.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-center text-xs text-slate-400">Chargement des demandes…</div>;
  }

  if (requests.length === 0) {
    if (!showEmptyState) return null;
    return (
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm text-center">
        <KeyRound className="w-5 h-5 text-slate-300 mx-auto mb-1.5" />
        <p className="text-xs font-bold text-slate-600">Aucune demande en attente</p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Les demandes d'accès aux clusters Management apparaîtront ici pour décision.
        </p>
      </div>
    );
  }

  const activeRequest = requests.find((r) => r.id === activeDecisionId);

  return (
    <div className="p-5 rounded-2xl bg-white border border-purple-200 shadow-sm space-y-3">
      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-purple-600" />
        <span>Demandes d'autorisation cluster management</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
          {requests.length}
        </span>
      </h3>

      <div className="space-y-2">
        {requests.map((req) => (
          <div key={req.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
            <div className="text-xs">
              <div className="font-bold text-slate-800">
                Cluster {req.cluster_code || req.cluster_id} — demandé par {req.requester_name || req.requested_by}
                {req.requester_department && (
                  <span className="font-normal text-slate-400"> ({req.requester_department})</span>
                )}
              </div>
              <div className="text-slate-500 mt-0.5">{req.reason}</div>
              <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(req.created_at).toLocaleString('fr-FR')}
                {req.starts_at && req.ends_at && (
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-semibold">
                    Créneau souhaité : {new Date(req.starts_at).toLocaleString('fr-FR')} → {new Date(req.ends_at).toLocaleString('fr-FR')}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => openDecision(req, 'APPROVED')}
                className="p-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700"
                title="Autoriser"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => openDecision(req, 'REJECTED')}
                className="p-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700"
                title="Refuser"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {activeDecisionId && decisionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <h4 className="text-sm font-bold text-slate-900">
              {decisionType === 'APPROVED' ? 'Autoriser cet accès ?' : 'Refuser cette demande ?'}
            </h4>

            {activeRequest && (
              <div className="text-[11px] text-slate-500 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-700">
                  Cluster {activeRequest.cluster_code || activeRequest.cluster_id}
                </span>{' '}
                — {activeRequest.requester_name || activeRequest.requested_by}
              </div>
            )}

            {decisionType === 'APPROVED' && (
              <div className="space-y-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-800">
                  <Clock className="w-3.5 h-3.5" />
                  Durée de l'autorisation (obligatoire)
                </div>
                <p className="text-[10px] text-amber-700">
                  Le cluster se reverrouille automatiquement à la fin de cette période.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWindowMode('preset')}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                      windowMode === 'preset'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-amber-800 border-amber-300'
                    }`}
                  >
                    Durée rapide
                  </button>
                  <button
                    type="button"
                    onClick={() => setWindowMode('range')}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                      windowMode === 'range'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-amber-800 border-amber-300'
                    }`}
                  >
                    Plage horaire
                  </button>
                </div>

                {windowMode === 'preset' ? (
                  <div className="flex flex-wrap gap-1.5">
                    {DURATION_PRESETS.map((p) => (
                      <button
                        key={p.minutes}
                        type="button"
                        onClick={() => setPresetMinutes(p.minutes)}
                        className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all ${
                          presetMinutes === p.minutes
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-100'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-amber-800 block mb-0.5">Début</label>
                      <input
                        type="datetime-local"
                        value={startAt}
                        onChange={(e) => setStartAt(e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-amber-800 block mb-0.5">Fin</label>
                      <input
                        type="datetime-local"
                        value={endAt}
                        onChange={(e) => setEndAt(e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 block">Motif de la décision</label>
              <textarea
                rows={3}
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                className="w-full p-3 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-purple-400 outline-none"
              />
            </div>

            {decisionError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{decisionError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={closeDecision}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Annuler
              </button>
              <button
                onClick={confirmDecision}
                disabled={submitting}
                className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md disabled:opacity-60 disabled:cursor-wait ${
                  decisionType === 'APPROVED' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {submitting ? 'Traitement...' : decisionType === 'APPROVED' ? 'Autoriser' : 'Refuser'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
