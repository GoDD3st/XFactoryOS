import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Info,
  AlertTriangle,
  CheckCircle,
  AlertOctagon,
  Search,
  MailOpen,
  Mail,
} from 'lucide-react';
import { UserNotification } from '../../../types';
import { apiFetchNotifications, apiMarkNotificationRead } from '@/services/api/notificationApi';

/**
 * Full notifications screen.
 *
 * The header dropdown only ever showed a truncated line and marked the entry read on click, so a
 * notification whose body carried the actual information - an approver's reason for requesting
 * more detail, the seat offered by the waiting list - could be dismissed without being readable.
 * Here an entry is *opened*: the list stays on the left, the full body renders on the right, and
 * the read state is persisted on open.
 */

const TYPE_STYLES: Record<
  UserNotification['type'],
  { icon: React.ReactNode; dot: string; badge: string; label: string }
> = {
  info: {
    icon: <Info className="w-3.5 h-3.5" />,
    dot: 'bg-sky-500',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
    label: 'Information',
  },
  success: {
    icon: <CheckCircle className="w-3.5 h-3.5" />,
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    label: 'Confirmation',
  },
  warning: {
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    label: 'Avertissement',
  },
  alert: {
    icon: <AlertOctagon className="w-3.5 h-3.5" />,
    dot: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    label: 'Alerte',
  },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type Filter = 'all' | 'unread';

export const NotificationsView: React.FC = () => {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const load = async () => {
    const data = await apiFetchNotifications();
    setNotifications(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Other surfaces (the header bell, background sweeps) announce changes on this event.
    const refresh = () => load();
    window.addEventListener('xfactory_notifications_changed', refresh);
    return () => window.removeEventListener('xfactory_notifications_changed', refresh);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notifications
      .filter((n) => (filter === 'unread' ? !n.read : true))
      .filter((n) =>
        q ? n.title.toLowerCase().includes(q) || (n.message || '').toLowerCase().includes(q) : true
      );
  }, [notifications, filter, query]);

  const selected = notifications.find((n) => n.id === selectedId) || null;
  const unreadCount = notifications.filter((n) => !n.read).length;

  /** Opening is what marks it read - not merely rendering it in a list. */
  const open = async (n: UserNotification) => {
    setSelectedId(n.id);
    if (n.read) return;

    // Optimistic: the panel shows as read immediately, then the server is told.
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    try {
      await apiMarkNotificationRead(n.id);
      window.dispatchEvent(new CustomEvent('xfactory_notifications_changed'));
    } catch {
      // Roll back so the badge does not lie about what has actually been acknowledged.
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: false } : x)));
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await Promise.all(unread.map((n) => apiMarkNotificationRead(n.id).catch(() => {})));
    window.dispatchEvent(new CustomEvent('xfactory_notifications_changed'));
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#008751] text-white flex items-center justify-center">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Notifications</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {unreadCount > 0
                ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''} sur ${notifications.length}`
                : `${notifications.length} notification${notifications.length > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
          >
            <MailOpen className="w-3.5 h-3.5" />
            Tout marquer comme lu
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* List */}
        <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-3 border-b border-slate-100 space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            <div className="flex gap-1.5">
              {(['all', 'unread'] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                    filter === f
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {f === 'all' ? 'Toutes' : `Non lues (${unreadCount})`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[32rem]">
            {loading ? (
              <p className="text-xs text-slate-400 p-6 text-center">Chargement...</p>
            ) : visible.length === 0 ? (
              <p className="text-xs text-slate-400 p-6 text-center">
                {filter === 'unread' ? 'Aucune notification non lue.' : 'Aucune notification.'}
              </p>
            ) : (
              visible.map((n) => {
                const style = TYPE_STYLES[n.type] || TYPE_STYLES.info;
                const isSelected = n.id === selectedId;
                return (
                  <button
                    key={n.id}
                    onClick={() => open(n)}
                    className={`w-full text-left p-3 border-b border-slate-50 transition-colors flex gap-2.5 ${
                      isSelected ? 'bg-emerald-50/70' : n.read ? 'bg-white hover:bg-slate-50' : 'bg-sky-50/40 hover:bg-sky-50/70'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${n.read ? 'bg-transparent' : style.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs truncate ${n.read ? 'font-semibold text-slate-600' : 'font-bold text-slate-900'}`}>
                        {n.title}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{formatDate(n.created_at)}</p>
                    </div>
                    {!n.read && <Mail className="w-3.5 h-3.5 text-sky-500 shrink-0 mt-0.5" />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Reading pane - the point of the screen: the full body, not a truncated line. */}
        <div className="lg:col-span-3 rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          {!selected ? (
            <div className="h-full min-h-[16rem] flex flex-col items-center justify-center text-center gap-2">
              <Bell className="w-8 h-8 text-slate-200" />
              <p className="text-xs text-slate-400">
                Sélectionnez une notification pour l'ouvrir et lire son contenu complet.
              </p>
            </div>
          ) : (
            <article className="space-y-4">
              <header className="space-y-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      (TYPE_STYLES[selected.type] || TYPE_STYLES.info).badge
                    }`}
                  >
                    {(TYPE_STYLES[selected.type] || TYPE_STYLES.info).icon}
                    {(TYPE_STYLES[selected.type] || TYPE_STYLES.info).label}
                  </span>
                  <span className="text-[11px] text-slate-400">{formatDate(selected.created_at)}</span>
                </div>
                <h3 className="text-base font-black text-slate-800">{selected.title}</h3>
              </header>

              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                {selected.message || 'Cette notification ne comporte pas de contenu détaillé.'}
              </p>
            </article>
          )}
        </div>
      </div>
    </div>
  );
};
