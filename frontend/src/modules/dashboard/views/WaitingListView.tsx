import React, { useState, useEffect } from 'react';
import { WaitingListEntry, WaitingListPreferences } from '@/frontend/src/types';
import {
  apiFetchWaitingList,
  apiJoinWaitingList,
  apiCancelWaitingListEntry,
  apiAcceptWaitingListOffer,
  apiDeclineWaitingListOffer,
} from '@/services/api/waitingListApi';
import { Clock, Layers, Plus, Trash2, CheckCircle, Users, Check, X } from 'lucide-react';

const PREFERENCE_LABELS: Record<keyof WaitingListPreferences, string> = {
  nearWindow: 'fenêtre',
  isPMR: 'PMR',
  isQuietZone: 'zone calme',
};

/** "fenêtre, zone calme"the attribute constraints an entry is queued with. */
const describePreferences = (prefs: WaitingListPreferences): string =>
  (Object.keys(prefs) as (keyof WaitingListPreferences)[])
    .filter((k) => prefs[k])
    .map((k) => PREFERENCE_LABELS[k])
    .join(', ');

export const WaitingListView: React.FC = () => {
  const [list, setList] = useState<WaitingListEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [clusterPref, setClusterPref] = useState('CL-A');
  const [timeSlot, setTimeSlot] = useState('09:00 - 17:00');
  const [notes, setNotes] = useState('');
  const [preferences, setPreferences] = useState<WaitingListPreferences>({});

  const loadList = async () => {
    setList(await apiFetchWaitingList());
  };

  useEffect(() => {
    loadList();
    window.addEventListener('xfactory_waiting_list_changed', loadList);
    return () => window.removeEventListener('xfactory_waiting_list_changed', loadList);
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiJoinWaitingList({
      cluster_preference: clusterPref,
      reservation_date: new Date().toISOString().split('T')[0],
      time_slot: timeSlot,
      notes,
      // Send nothing rather than {} when no box is ticked - an empty object and "no preferences"
      // mean the same thing to the matcher, and omitting it keeps the stored row honest.
      preferences: Object.keys(preferences).length > 0 ? preferences : undefined,
    });
    setShowAdd(false);
    setNotes('');
    setPreferences({});
    loadList();
  };

  const togglePreference = (key: keyof WaitingListPreferences) =>
    setPreferences((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });

  const handleCancel = async (id: string) => {
    await apiCancelWaitingListEntry(id);
    loadList();
  };

  const [actionError, setActionError] = useState<string | null>(null);

  const handleAccept = async (id: string) => {
    setActionError(null);
    try {
      await apiAcceptWaitingListOffer(id);
      loadList();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleDecline = async (id: string) => {
    setActionError(null);
    try {
      await apiDeclineWaitingListOffer(id);
      loadList();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const formatCountdown = (expiresAt?: string): string | null => {
    if (!expiresAt) return null;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return 'expirée';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Liste d'Attente FIFO</h2>
          <p className="text-xs text-slate-500 mt-0.5">Attribution automatique en cas de libération ou no-show</p>
        </div>

        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#008751] hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4 text-amber-300" />
          <span>Rejoindre la Liste</span>
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4 animate-in fade-in duration-150">
          <h3 className="font-bold text-sm text-slate-800">Ajouter une Demande FIFO</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Cluster Préféré</label>
              <select
                value={clusterPref}
                onChange={(e) => setClusterPref(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="CL-A">CL-A Innovation</option>
                <option value="CL-B">CL-B Digital Factory</option>
                <option value="CL-C">CL-C Facility</option>
                <option value="CL-D">CL-D Security</option>
                <option value="CL-E">CL-E GCI Governance</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Créneau</label>
              <input
                type="text"
                value={timeSlot}
                onChange={(e) => setTimeSlot(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 text-xs block mb-1">Préférences de poste</label>
            <p className="text-[11px] text-slate-500 mb-2">
              Un poste libéré ne vous sera proposé que s'il remplit ces critères. Sans critère, tout
              poste du cluster convient.
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['nearWindow', 'Près d’une fenêtre'],
                  ['isPMR', 'Accessible PMR'],
                  ['isQuietZone', 'Zone calme'],
                ] as [keyof WaitingListPreferences, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => togglePreference(key)}
                  aria-pressed={!!preferences[key]}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                    preferences[key]
                      ? 'bg-[#008751] border-[#008751] text-white shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 text-xs block mb-1">Notes / Raison</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Session travail projet..."
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-[#008751] text-white font-bold text-xs rounded-xl shadow-xs"
          >
            Confirmer Inscription FIFO
          </button>
        </form>
      )}

      {actionError && (
        <div className="p-3 rounded-xl bg-red-50 text-red-800 border border-red-200 text-xs">
          {actionError}
        </div>
      )}

      {/* Queue List */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <span className="font-bold text-sm text-slate-800">Files d'Attente Actives</span>
          <span className="text-xs font-semibold text-slate-400">{list.length} en attente</span>
        </div>

        <div className="space-y-2">
          {list.map((item, idx) => {
            const isOffered = item.status === 'offered';
            const countdown = isOffered ? formatCountdown(item.offer_expires_at) : null;

            return (
              <div
                key={item.id}
                className={`flex items-center justify-between p-3 rounded-xl border text-xs ${
                  isOffered ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-7 h-7 rounded-full bg-slate-200 font-black text-slate-700 flex items-center justify-center text-xs shrink-0">
                    #{idx + 1}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">{item.user_name} ({item.user_department})</div>
                    <div className="text-[10px] text-slate-500">
                      Cluster: <span className="font-semibold text-[#008751]">{item.cluster_preference}</span> • Créneau: {item.time_slot}
                      {item.preferences && (
                        <> • Critères: {describePreferences(item.preferences)}</>
                      )}
                    </div>
                    {isOffered && (
                      <div className="text-[10px] text-emerald-700 font-bold mt-0.5">
                        Poste proposé{item.offered_workstation_code ? ` : ${item.offered_workstation_code}` : ''}
                        {/* The offer can cover only part of the requested slot, so the hours have
                            to be on screen before someone accepts it. */}
                        {item.offered_time_slot ? ` (${item.offered_time_slot})` : ''} - expire dans {countdown}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {isOffered ? (
                    <>
                      <button
                        onClick={() => handleAccept(item.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-lg"
                      >
                        <Check className="w-3.5 h-3.5" /> Accepter
                      </button>
                      <button
                        onClick={() => handleDecline(item.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[10px] rounded-lg"
                      >
                        <X className="w-3.5 h-3.5" /> Refuser
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-amber-100 text-amber-800 uppercase">
                        {item.status}
                      </span>
                      <button
                        onClick={() => handleCancel(item.id)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {list.length === 0 && (
            <div className="text-center py-6 text-xs text-slate-400">
              Aucune demande en file d'attente actuellement.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
