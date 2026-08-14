import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Check, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  apiFetchLateCheckInRequests,
  apiDecideLateCheckIn,
  LateCheckInRequest,
} from '@/services/api/checkinoutApi';
import {
  DataTable,
  DataTableColumn,
  StatusBadge,
  lateCheckInStatusBadge,
} from '../../../shared/components/DataTable';

/**
 * Late check-in review queue — Building Manager / Admin / Super Admin only.
 *
 * The role gate here is presentational; the server rejects unauthorised decisions and RLS
 * restricts the table itself, so hiding this screen is not what protects the workflow.
 */
export const LateCheckInRequestsView: React.FC = () => {
  const [requests, setRequests] = useState<LateCheckInRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [target, setTarget] = useState<{ req: LateCheckInRequest; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRequests(await apiFetchLateCheckInRequests());
    } catch (err: any) {
      setLoadError(err?.message || 'Impossible de charger les demandes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = useMemo(() => requests.filter((r) => r.status === 'PENDING'), [requests]);
  const approved = useMemo(() => requests.filter((r) => r.status === 'APPROVED'), [requests]);
  const rejected = useMemo(() => requests.filter((r) => r.status === 'REJECTED'), [requests]);

  const confirmDecision = async () => {
    if (!target) return;
    // A refusal is sent to the requester, so it must explain itself.
    if (target.decision === 'REJECTED' && comment.trim().length < 5) {
      setDecisionError('Un motif de refus est obligatoire — il est transmis au demandeur.');
      return;
    }
    setSubmitting(true);
    setDecisionError(null);
    try {
      await apiDecideLateCheckIn(target.req.id, target.decision, comment.trim() || undefined);
      setMessage(
        target.decision === 'APPROVED'
          ? `Check-in tardif approuvé pour ${target.req.requester_name || 'le collaborateur'} — la réservation est désormais en check-in.`
          : 'Demande refusée. Aucun check-in n\'a été créé.'
      );
      setTarget(null);
      setComment('');
      await load();
    } catch (err: any) {
      setDecisionError(err?.message || 'Échec de la décision.');
    } finally {
      setSubmitting(false);
    }
  };

  const fmtDateTime = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('fr-FR') : '—';
  const fmtTime = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';

  const columns: DataTableColumn<LateCheckInRequest>[] = [
    {
      key: 'requester',
      header: 'Demandeur',
      value: (r) => `${r.requester_name || ''} ${r.requester_email || ''}`,
      sortable: true,
      render: (r) => (
        <div>
          <div className="font-bold text-slate-800">{r.requester_name || '—'}</div>
          <div className="text-[10px] text-slate-400">{r.requester_email}</div>
          {r.requester_department && (
            <div className="text-[10px] text-slate-400">{r.requester_department}</div>
          )}
        </div>
      ),
    },
    {
      key: 'seat',
      header: 'Poste / Cluster',
      value: (r) => r.workstation_code,
      sortable: true,
      render: (r) => (
        <div>
          <div className="font-bold text-slate-800">{r.workstation_code || '—'}</div>
          <div className="text-[10px] text-slate-400">{r.cluster_name}</div>
        </div>
      ),
    },
    {
      key: 'reservation',
      header: 'Réservation',
      value: (r) => r.reservation_start,
      sortable: true,
      render: (r) => (
        <div className="whitespace-nowrap">
          <div className="font-mono text-slate-600">
            {r.reservation_start ? new Date(r.reservation_start).toLocaleDateString('fr-FR') : '—'}
          </div>
          <div className="text-[10px] font-mono text-slate-400">
            {fmtTime(r.reservation_start)} — {fmtTime(r.reservation_end)}
          </div>
          <div className="text-[9px] font-mono text-slate-300" title={r.reservation_id}>
            #{r.reservation_id.slice(0, 8)}
          </div>
        </div>
      ),
    },
    {
      key: 'justification',
      header: 'Justification',
      value: (r) => r.justification,
      render: (r) => (
        <p className="text-slate-700 max-w-xs leading-snug" title={r.justification}>
          {r.justification}
        </p>
      ),
    },
    {
      key: 'submitted',
      header: 'Soumise le',
      value: (r) => r.created_at,
      sortable: true,
      secondary: true,
      render: (r) => <span className="font-mono text-slate-500 whitespace-nowrap">{fmtDateTime(r.created_at)}</span>,
    },
    {
      key: 'status',
      header: 'Statut',
      value: (r) => r.status,
      sortable: true,
      render: (r) => {
        const badge = lateCheckInStatusBadge(r.status);
        return (
          <div className="flex flex-col gap-1 items-start">
            <StatusBadge label={badge.label} tone={badge.tone} />
            {r.status !== 'PENDING' && (
              <span className="text-[10px] text-slate-400 whitespace-nowrap">
                {r.reviewer_name || '—'} · {fmtDateTime(r.reviewed_at)}
              </span>
            )}
            {r.reviewer_comment && (
              <span className="text-[10px] text-slate-500 italic max-w-[14rem]" title={r.reviewer_comment}>
                « {r.reviewer_comment} »
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) =>
        r.status === 'PENDING' ? (
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => {
                setTarget({ req: r, decision: 'APPROVED' });
                setComment('');
                setDecisionError(null);
              }}
              className="p-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700"
              title="Approuver — accorde le check-in"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setTarget({ req: r, decision: 'REJECTED' });
                setComment('');
                setDecisionError(null);
              }}
              className="p-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700"
              title="Refuser"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-slate-300">Traitée</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
          <Clock className="w-5 h-5 text-amber-600" />
          Demandes de check-in tardif
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Un collaborateur présent à son poste mais qui a oublié de scanner son QR code demande
          l'enregistrement de sa présence. L'approbation crée un check-in réel, tracé comme
          « tardif » et non comme un scan normal.
        </p>
      </div>

      {/* KPI cards stay cards — they are summaries, not a list. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">En attente</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className={`text-2xl font-black ${pending.length > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
            {loading ? '…' : pending.length}
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Approuvées</span>
            <Check className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700">{loading ? '…' : approved.length}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Refusées</span>
            <X className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{loading ? '…' : rejected.length}</div>
        </div>
      </div>

      {message && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            {message}
          </span>
          <button onClick={() => setMessage(null)} className="font-bold hover:text-emerald-950">
            Fermer
          </button>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={requests}
        rowKey={(r) => r.id}
        loading={loading}
        error={loadError}
        onRetry={load}
        searchable
        searchPlaceholder="Rechercher un demandeur, un poste, une justification…"
        pageSize={10}
        emptyMessage="Aucune demande de check-in tardif."
        emptyHint="Les demandes des collaborateurs apparaîtront ici."
      />

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              {target.decision === 'APPROVED'
                ? 'Approuver ce check-in tardif ?'
                : 'Refuser cette demande ?'}
            </h3>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
              <div>
                <strong className="text-slate-800">{target.req.requester_name}</strong> ·{' '}
                {target.req.workstation_code} ({target.req.cluster_name})
              </div>
              <div className="italic">« {target.req.justification} »</div>
            </div>

            {target.decision === 'APPROVED' && (
              <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                La réservation passera en check-in et le poste sera marqué occupé. L'origine
                « check-in tardif » et votre identité seront enregistrées.
              </p>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                {target.decision === 'REJECTED'
                  ? 'Motif du refus * (transmis au demandeur)'
                  : 'Commentaire (facultatif)'}
              </label>
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  target.decision === 'REJECTED' ? 'Obligatoire — expliquez la décision.' : ''
                }
                className="w-full p-3 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-[#008751] outline-none"
              />
            </div>

            {decisionError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{decisionError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setTarget(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Annuler
              </button>
              <button
                onClick={confirmDecision}
                disabled={submitting || (target.decision === 'REJECTED' && comment.trim().length < 5)}
                className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                  target.decision === 'APPROVED'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {submitting ? 'Traitement…' : target.decision === 'APPROVED' ? 'Approuver' : 'Refuser'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
