import React, { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, Search, AlertTriangle, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * The application's single table pattern.
 *
 * Structured, repetitive records (reservations, users, clusters, requests) are far easier to
 * scan and compare in a table than as cards. Cards stay for KPIs and single summaries, where
 * they genuinely help.
 *
 * Deliberately one component rather than a bespoke table per screen: column headers, sorting,
 * search, pagination, hover, and the loading / empty / error states all behave identically
 * everywhere. It keeps the existing visual identity (rounded 2xl card shell, slate palette,
 * #008751 accent) rather than introducing a new design language.
 */

export interface DataTableColumn<T> {
  /** Stable key; also the default sort field when `sortable` and no accessor is given. */
  key: string;
  header: string;
  /** Cell renderer. Receives the row. */
  render: (row: T) => React.ReactNode;
  /** Value used for sorting and search. Omit to exclude the column from both. */
  value?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  /** Hidden below `lg` so narrow screens keep the columns that matter. */
  secondary?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  /** Shown when there are no rows and no error. */
  emptyMessage?: string;
  emptyHint?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** 0 disables pagination. */
  pageSize?: number;
  /** Rendered above the table, right of the search box (filters, actions…). */
  toolbar?: React.ReactNode;
  onRetry?: () => void;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = null,
  emptyMessage = 'Aucun élément à afficher.',
  emptyHint,
  searchable = false,
  searchPlaceholder = 'Rechercher…',
  pageSize = 0,
  toolbar,
  onRetry,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);

  const searchable_ = columns.filter((c) => c.value);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((row) =>
      searchable_.some((c) => String(c.value!(row) ?? '').toLowerCase().includes(q))
    );
  }, [rows, search, searchable_]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.value) return filtered;
    // Copy first: sorting the prop array in place would mutate the caller's state.
    return [...filtered].sort((a, b) => {
      const av = col.value!(a);
      const bv = col.value!(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'fr', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, columns]);

  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const safePage = Math.min(page, totalPages - 1);
  const visible = pageSize > 0 ? sorted.slice(safePage * pageSize, safePage * pageSize + pageSize) : sorted;

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  };

  const colCount = columns.length;

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      {(searchable || toolbar) && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-4 border-b border-slate-100">
          {searchable && (
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
              />
            </div>
          )}
          {toolbar && <div className="flex items-center gap-2 shrink-0">{toolbar}</div>}
        </div>
      )}

      {/* Horizontal scroll rather than a mobile card rewrite: the table stays a table, and the
          least important columns drop out below lg via `secondary`. */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 uppercase text-[10px]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`py-3 px-3 font-bold whitespace-nowrap ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                  } ${col.secondary ? 'hidden lg:table-cell' : ''} ${col.className || ''}`}
                >
                  {col.sortable && col.value ? (
                    <button
                      onClick={() => toggleSort(col.key)}
                      className="inline-flex items-center gap-1 hover:text-slate-800 transition-colors uppercase font-bold"
                      aria-label={`Trier par ${col.header}`}
                    >
                      {col.header}
                      {sortKey === col.key ? (
                        sortDir === 'asc' ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )
                      ) : (
                        <ChevronsPlaceholder />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={colCount} className="py-10 text-center text-slate-400">
                  Chargement…
                </td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={colCount} className="py-10 text-center">
                  <div className="inline-flex flex-col items-center gap-2 text-rose-700">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-semibold">{error}</span>
                    {onRetry && (
                      <button
                        onClick={onRetry}
                        className="mt-1 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 font-bold hover:bg-rose-100"
                      >
                        Réessayer
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}

            {!loading && !error && visible.length === 0 && (
              <tr>
                <td colSpan={colCount} className="py-10 text-center">
                  <div className="inline-flex flex-col items-center gap-1.5 text-slate-400">
                    <Inbox className="w-5 h-5 text-slate-300" />
                    <span className="font-semibold text-slate-600">
                      {search.trim() ? 'Aucun résultat pour cette recherche.' : emptyMessage}
                    </span>
                    {emptyHint && !search.trim() && <span className="text-[11px]">{emptyHint}</span>}
                  </div>
                </td>
              </tr>
            )}

            {!loading &&
              !error &&
              visible.map((row) => (
                <tr key={rowKey(row)} className="hover:bg-slate-50/80 transition-colors">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`py-3 px-3 align-middle ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                      } ${col.secondary ? 'hidden lg:table-cell' : ''} ${col.className || ''}`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {pageSize > 0 && !loading && !error && sorted.length > pageSize && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 text-[11px] text-slate-500">
          <span>
            {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} sur {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Page précédente"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-bold text-slate-700 px-1">
              {safePage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Page suivante"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Neutral placeholder keeping sortable headers from shifting when unsorted. */
const ChevronsPlaceholder: React.FC = () => (
  <span className="inline-block w-3 h-3 opacity-25">
    <ChevronUp className="w-3 h-3 -mb-1" />
  </span>
);

// ── Status badges ────────────────────────────────────────────────────────────────────────────
// One vocabulary for the whole application. Each badge pairs colour with a distinct label and a
// glyph, so status is never communicated by colour alone (WCAG 1.4.1).
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';

const TONE_STYLES: Record<StatusTone, string> = {
  success: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  danger: 'bg-rose-100 text-rose-800 border-rose-200',
  info: 'bg-sky-100 text-sky-800 border-sky-200',
  accent: 'bg-purple-100 text-purple-800 border-purple-200',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
};

const TONE_GLYPH: Record<StatusTone, string> = {
  success: '●',
  warning: '◐',
  danger: '✕',
  info: '◆',
  accent: '★',
  neutral: '○',
};

export const StatusBadge: React.FC<{ label: string; tone?: StatusTone; title?: string }> = ({
  label,
  tone = 'neutral',
  title,
}) => (
  <span
    title={title}
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${TONE_STYLES[tone]}`}
  >
    <span aria-hidden="true" className="text-[8px] leading-none">
      {TONE_GLYPH[tone]}
    </span>
    {label}
  </span>
);

/** Shared mapping so the same state never renders differently on two screens. */
export function reservationStatusBadge(status: string): { label: string; tone: StatusTone } {
  switch (status) {
    case 'check-in':
      return { label: 'CHECK-IN', tone: 'success' };
    case 'confirmée':
      return { label: 'CONFIRMÉE', tone: 'info' };
    case 'en attente':
      return { label: 'EN ATTENTE', tone: 'warning' };
    case 'no-show':
      return { label: 'NO-SHOW', tone: 'danger' };
    case 'annulée':
      return { label: 'ANNULÉE', tone: 'neutral' };
    case 'rejetée':
      return { label: 'REJETÉE', tone: 'danger' };
    case 'terminée':
      return { label: 'TERMINÉE', tone: 'neutral' };
    case 'check-out':
      return { label: 'CHECK-OUT', tone: 'neutral' };
    default:
      return { label: status.toUpperCase(), tone: 'neutral' };
  }
}

export function lateCheckInStatusBadge(status: string): { label: string; tone: StatusTone } {
  switch (status) {
    case 'APPROVED':
      return { label: 'APPROUVÉE', tone: 'success' };
    case 'REJECTED':
      return { label: 'REFUSÉE', tone: 'danger' };
    case 'PENDING':
    default:
      return { label: 'EN ATTENTE', tone: 'warning' };
  }
}
