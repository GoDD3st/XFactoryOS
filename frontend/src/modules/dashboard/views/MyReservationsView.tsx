import React, { useState, useEffect, useMemo } from 'react';
import { Reservation } from '@/frontend/src/types';
import { deleteReservation, syncReservationsFromDb } from '@/services/reservations/reservationService';
import {
  apiCheckIn,
  apiCheckOut,
  apiRequestLateCheckIn,
  apiFetchMyLateCheckIns,
  LateCheckInRequest,
} from '@/services/api/checkinoutApi';
import { useAuth } from '@/frontend/src/modules/auth/context/AuthContext';
import { apiFetchMyApprovalRequests, apiCompleteApprovalRequest } from '@/services/api/approvalApi';
import { ExtensionRequestModal } from '@/frontend/src/shared/components/ExtensionRequestModal';
import { ApprovalRequest } from '@/frontend/src/types';
import {
  DataTable,
  DataTableColumn,
  StatusBadge,
  reservationStatusBadge,
  lateCheckInStatusBadge,
} from '@/frontend/src/shared/components/DataTable';
import { CheckCircle, LogOut, Trash2, Clock, X, AlertCircle } from 'lucide-react';

export const MyReservationsView: React.FC = () => {
  const { currentUser } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [lateRequests, setLateRequests] = useState<LateCheckInRequest[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Late check-in request modal
  const [lateTarget, setLateTarget] = useState<Reservation | null>(null);
  const [justification, setJustification] = useState('');
  const [submittingLate, setSubmittingLate] = useState(false);
  const [lateError, setLateError] = useState<string | null>(null);
  // Approval requests this user raised, so a reservation stuck on "the validator wants more
  // detail" can say so on its own row instead of only in the notification list.
  const [myApprovals, setMyApprovals] = useState<ApprovalRequest[]>([]);
  const [reclarifyTarget, setReclarifyTarget] = useState<ApprovalRequest | null>(null);

  const needsInfoFor = (reservationId: string) =>
    myApprovals.find((a) => a.reservation_id === reservationId && a.status === 'needs_info') || null;

  const loadReservations = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const all = await syncReservationsFromDb();
      setReservations(all.filter((r) => r.user_id === currentUser.id));
      setLateRequests(await apiFetchMyLateCheckIns().catch(() => []));
    } catch (err: any) {
      setLoadError(err?.message || 'Impossible de charger vos réservations.');
    } finally {
      setLoading(false);
    }
  };

  const loadApprovals = async () => setMyApprovals(await apiFetchMyApprovalRequests());

  useEffect(() => {
    loadReservations();
    loadApprovals();
    const refresh = () => {
      loadReservations();
      loadApprovals();
    };
    window.addEventListener('xfactory_reservations_changed', refresh);
    return () => window.removeEventListener('xfactory_reservations_changed', refresh);
  }, [currentUser.id]);

  /** Latest request per reservation, so the row can show its state. */
  const lateByReservation = useMemo(() => {
    const map = new Map<string, LateCheckInRequest>();
    lateRequests.forEach((r) => {
      if (!map.has(r.reservation_id)) map.set(r.reservation_id, r);
    });
    return map;
  }, [lateRequests]);

  // Both go through the API rather than CheckInOutService: the server forces the user id from
  // the session (so this can only touch your own reservation) and the write stays behind the
  // ownership guard instead of relying on RLS alone.
  const runAction = async (id: string, fn: () => Promise<void>, okMsg: string) => {
    setBusyId(id);
    setErrorMsg(null);
    try {
      await fn();
      setMsg(okMsg);
      await loadReservations();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Action impossible.');
    } finally {
      setBusyId(null);
    }
  };

  const submitLateRequest = async () => {
    if (!lateTarget) return;
    if (justification.trim().length < 10) {
      setLateError('Merci de détailler votre justification (10 caractères minimum).');
      return;
    }
    setSubmittingLate(true);
    setLateError(null);
    try {
      await apiRequestLateCheckIn(lateTarget.id, justification.trim());
      setMsg('Demande de check-in tardif envoyée - elle doit être approuvée par un responsable.');
      setLateTarget(null);
      setJustification('');
      await loadReservations();
    } catch (err: any) {
      setLateError(err?.message || 'Échec de la demande.');
    } finally {
      setSubmittingLate(false);
    }
  };

  /** A late check-in is offered when the normal check-in is no longer possible or was missed. */
  const canRequestLate = (r: Reservation) => {
    const existing = lateByReservation.get(r.id);
    if (existing && existing.status === 'PENDING') return false;
    if (existing && existing.status === 'APPROVED') return false;
    return r.status === 'no-show' || r.status === 'confirmée';
  };

  const columns: DataTableColumn<Reservation>[] = [
    {
      key: 'workstation',
      header: 'Poste',
      value: (r) => r.workstation_code,
      sortable: true,
      render: (r) => (
        <div>
          <div className="font-bold text-slate-800">{r.workstation_code}</div>
          <div className="text-[10px] text-slate-400">{r.cluster_name}</div>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      value: (r) => r.reservation_date,
      sortable: true,
      render: (r) => <span className="font-mono text-slate-600">{r.reservation_date}</span>,
    },
    {
      key: 'time',
      header: 'Horaire',
      value: (r) => r.start_time,
      sortable: true,
      render: (r) => (
        <span className="font-mono text-slate-600 whitespace-nowrap">
          {r.start_time} - {r.end_time}
        </span>
      ),
    },
    {
      key: 'purpose',
      header: 'Motif',
      value: (r) => r.purpose,
      secondary: true,
      render: (r) => <span className="text-slate-500">{r.purpose || 'Session travail'}</span>,
    },
    {
      key: 'status',
      header: 'Statut',
      value: (r) => r.status,
      sortable: true,
      render: (r) => {
        const badge = reservationStatusBadge(r.status);
        const late = lateByReservation.get(r.id);
        return (
          <div className="flex flex-col gap-1 items-start">
            <StatusBadge label={badge.label} tone={badge.tone} />
            {late && (
              <StatusBadge
                label={`TARDIF ${lateCheckInStatusBadge(late.status).label}`}
                tone={lateCheckInStatusBadge(late.status).tone}
                title={
                  late.status === 'REJECTED' && late.reviewer_comment
                    ? `Motif du refus : ${late.reviewer_comment}`
                    : late.justification
                }
              />
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5 flex-wrap">
          {r.status === 'confirmée' && (
            <button
              onClick={() => runAction(r.id, () => apiCheckIn(r.id), 'Check-in effectué avec succès !')}
              disabled={busyId === r.id}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[10px] font-bold"
            >
              <CheckCircle className="w-3 h-3" />
              Check-in
            </button>
          )}
          {r.status === 'check-in' && (
            <button
              onClick={() => runAction(r.id, () => apiCheckOut(r.id), 'Check-out effectué. Poste libéré.')}
              disabled={busyId === r.id}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-[10px] font-bold"
            >
              <LogOut className="w-3 h-3" />
              Check-out
            </button>
          )}
          {canRequestLate(r) && (
            <button
              onClick={() => {
                setLateTarget(r);
                setJustification('');
                setLateError(null);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold"
              title="Vous étiez présent mais avez oublié de scanner le QR code"
            >
              <Clock className="w-3 h-3" />
              Check-in tardif
            </button>
          )}
          {/* BPMN D2: the validator asked for more detail on THIS reservation. The prompt has to
              live on the row as well as in Notifications - a user checking "where is my booking?"
              looks here first, and the request stalls until they answer. */}
          {needsInfoFor(r.id) && (
            <button
              onClick={() => setReclarifyTarget(needsInfoFor(r.id)!)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white border border-amber-600 text-[10px] font-bold animate-pulse"
              title="Le valideur demande des précisions avant de décider"
            >
              <AlertCircle className="w-3 h-3" />
              Précisions demandées
            </button>
          )}
          {(r.status === 'confirmée' || r.status === 'en attente') && (
            <button
              onClick={() => runAction(r.id, () => deleteReservation(r.id).then(() => undefined), 'Réservation annulée.')}
              disabled={busyId === r.id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[10px] font-bold disabled:opacity-50"
              title="Annuler"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Mes Réservations Open Space</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Suivi de vos réservations, check-in et libération anticipée
          </p>
        </div>
      </div>

      {msg && (
        <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            {msg}
          </span>
          <button onClick={() => setMsg(null)} className="font-bold hover:text-emerald-900">
            Fermer
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-xs flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            {errorMsg}
          </span>
          <button onClick={() => setErrorMsg(null)} className="font-bold hover:text-rose-900">
            Fermer
          </button>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={reservations}
        rowKey={(r) => r.id}
        loading={loading}
        error={loadError}
        onRetry={loadReservations}
        searchable
        searchPlaceholder="Rechercher un poste, une date, un statut..."
        pageSize={10}
        emptyMessage="Aucune réservation."
        emptyHint="Réservez un poste depuis le plan de l'Open Space."
      />

      {/* Late check-in request - free-text justification, no predefined reasons. */}
      {lateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4 relative">
            <button
              onClick={() => setLateTarget(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                Demander un check-in tardif
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Poste <strong>{lateTarget.workstation_code}</strong> · {lateTarget.reservation_date} ·{' '}
                {lateTarget.start_time} - {lateTarget.end_time}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                Justification * <span className="font-normal text-slate-400">(texte libre)</span>
              </label>
              <textarea
                rows={4}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Ex : J'étais bien à mon poste réservé mais j'ai oublié de scanner le QR code en arrivant."
                className="w-full p-3 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-amber-400 outline-none"
              />
              <p className="text-[10px] text-slate-400">
                Votre demande sera examinée par un responsable. Elle n'accorde pas le check-in
                automatiquement.
              </p>
            </div>

            {lateError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{lateError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setLateTarget(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Annuler
              </button>
              <button
                onClick={submitLateRequest}
                disabled={submittingLate || justification.trim().length < 10}
                className="px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submittingLate ? 'Envoi...' : 'Envoyer la demande'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Same form the notification opens: one component, one submit path, so the two entry
          points cannot drift apart. */}
      {reclarifyTarget && (
        <ExtensionRequestModal
          isOpen
          isReLoop
          onClose={() => setReclarifyTarget(null)}
          onSubmit={async ({ objective, motif }) => {
            try {
              await apiCompleteApprovalRequest(reclarifyTarget.id, objective, motif);
              setReclarifyTarget(null);
              await loadApprovals();
              await loadReservations();
            } catch {
              /* the modal stays open so the text isn't lost */
            }
          }}
          businessDays={reclarifyTarget.duration_days || 0}
          startDate={reclarifyTarget.reservation_date || ''}
          endDate={reclarifyTarget.end_date || reclarifyTarget.reservation_date || ''}
          workstationCode={reclarifyTarget.workstation_code || ''}
          clusterName={reclarifyTarget.cluster_name || ''}
          initialObjective={reclarifyTarget.objective || ''}
          initialMotif={reclarifyTarget.reason || ''}
          approverFeedbackNote={reclarifyTarget.decision_note}
          totalHours={reclarifyTarget.total_hours}
        />
      )}
    </div>
  );
};
