import React, { useState, useEffect } from 'react';
import { WaitingListEntry } from '@/frontend/src/types';
import { WaitingListService } from '@/services/waitinglist/waitingListService';
import { Clock, Layers, Plus, Trash2, CheckCircle, Users } from 'lucide-react';

export const WaitingListView: React.FC = () => {
  const [list, setList] = useState<WaitingListEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [clusterPref, setClusterPref] = useState('CL-A');
  const [timeSlot, setTimeSlot] = useState('09:00 - 17:00');
  const [notes, setNotes] = useState('');

  const loadList = () => {
    setList(WaitingListService.getWaitingList());
  };

  useEffect(() => {
    loadList();
    window.addEventListener('xfactory_waiting_list_changed', loadList);
    return () => window.removeEventListener('xfactory_waiting_list_changed', loadList);
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await WaitingListService.addToWaitingList({
      user_id: 'usr-current',
      user_name: 'Collaborateur Safi',
      user_department: 'Digital Factory',
      cluster_preference: clusterPref,
      reservation_date: new Date().toISOString().split('T')[0],
      time_slot: timeSlot,
      notes,
    });
    setShowAdd(false);
    loadList();
  };

  const handleCancel = async (id: string) => {
    await WaitingListService.cancelWaitingListEntry(id);
    loadList();
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

      {/* Queue List */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <span className="font-bold text-sm text-slate-800">Files d'Attente Actives</span>
          <span className="text-xs font-semibold text-slate-400">{list.length} en attente</span>
        </div>

        <div className="space-y-2">
          {list.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs"
            >
              <div className="flex items-center space-x-3">
                <div className="w-7 h-7 rounded-full bg-slate-200 font-black text-slate-700 flex items-center justify-center text-xs">
                  #{idx + 1}
                </div>
                <div>
                  <div className="font-bold text-slate-800">{item.user_name} ({item.user_department})</div>
                  <div className="text-[10px] text-slate-500">
                    Cluster: <span className="font-semibold text-[#008751]">{item.cluster_preference}</span> • Créneau: {item.time_slot}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-amber-100 text-amber-800 uppercase">
                  {item.status}
                </span>
                <button
                  onClick={() => handleCancel(item.id)}
                  className="p-1 text-slate-400 hover:text-red-600 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

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
