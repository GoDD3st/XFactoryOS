import React, { useState } from 'react';
import {
  Wrench,
  X,
  CheckCircle2,
  AlertTriangle,
  Monitor,
  Eye,
  EyeOff,
  Sliders,
  FileText,
  ShieldCheck
} from 'lucide-react';
import { Workstation, SeatStatus } from '../../types';
import { WorkstationRepository } from '@/database/repositories/workstationRepository';

interface WorkstationEditModalProps {
  workstation: Workstation;
  clusterId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const WorkstationEditModal: React.FC<WorkstationEditModalProps> = ({
  workstation,
  clusterId,
  isOpen,
  onClose,
  onSaved,
}) => {
  const [status, setStatus] = useState<SeatStatus>(workstation.status);
  const [reservable, setReservable] = useState<boolean>(workstation.reservable);
  const [visibleToUsers, setVisibleToUsers] = useState<boolean>(workstation.visibleToUsers);
  const [hasDoubleScreen, setHasDoubleScreen] = useState<boolean>(
    workstation.metadata.has_double_screen
  );
  const [nearWindow, setNearWindow] = useState<boolean>(workstation.metadata.near_window);
  const [isPmr, setIsPmr] = useState<boolean>(workstation.metadata.is_pmr);
  const [isQuietZone, setIsQuietZone] = useState<boolean>(workstation.metadata.is_quiet_zone);
  const [notes, setNotes] = useState<string>(workstation.metadata.notes || '');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    // Save to Supabase repository
    await WorkstationRepository.updateWorkstationStatus(
      workstation.id,
      status,
      reservable
    );

    // Dispatch update event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('xfactory_workstations_changed'));
    }

    setIsSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
          <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/80 text-amber-700">
            <Wrench className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded bg-slate-900 text-white uppercase">
                {workstation.code}
              </span>
              <span className="text-xs text-slate-500 font-semibold">Poste #{workstation.seat_number}</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">
              Modification Poste & Maintenance Bâtiment
            </h2>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Status Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Statut du poste
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'disponible', label: '🟢 Disponible', color: 'border-emerald-300 bg-emerald-50 text-emerald-900' },
                { id: 'maintenance', label: '🟡 Maintenance', color: 'border-amber-300 bg-amber-50 text-amber-900' },
                { id: 'management_reserved', label: '🔒 Réservé Direction', color: 'border-purple-300 bg-purple-50 text-purple-900' },
                { id: 'occupé', label: '🔵 Occupé (Check-in)', color: 'border-blue-300 bg-blue-50 text-blue-900' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStatus(item.id as SeatStatus)}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all ${
                    status === item.id
                      ? `${item.color} ring-2 ring-[#008751]`
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles Grid */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <label className="flex items-center space-x-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={reservable}
                onChange={(e) => setReservable(e.target.checked)}
                className="w-4 h-4 text-[#008751] rounded border-slate-300"
              />
              <span className="text-xs font-bold text-slate-700">Ouvert à la réservation</span>
            </label>

            <label className="flex items-center space-x-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={visibleToUsers}
                onChange={(e) => setVisibleToUsers(e.target.checked)}
                className="w-4 h-4 text-[#008751] rounded border-slate-300"
              />
              <span className="text-xs font-bold text-slate-700">Visible sur le twin 2D</span>
            </label>

            <label className="flex items-center space-x-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={hasDoubleScreen}
                onChange={(e) => setHasDoubleScreen(e.target.checked)}
                className="w-4 h-4 text-[#008751] rounded border-slate-300"
              />
              <span className="text-xs font-bold text-slate-700">Double Écran 4K</span>
            </label>

            <label className="flex items-center space-x-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={nearWindow}
                onChange={(e) => setNearWindow(e.target.checked)}
                className="w-4 h-4 text-[#008751] rounded border-slate-300"
              />
              <span className="text-xs font-bold text-slate-700">Proximité Fenêtre</span>
            </label>

            <label className="flex items-center space-x-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={isPmr}
                onChange={(e) => setIsPmr(e.target.checked)}
                className="w-4 h-4 text-[#008751] rounded border-slate-300"
              />
              <span className="text-xs font-bold text-slate-700">Accès PMR</span>
            </label>

            <label className="flex items-center space-x-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={isQuietZone}
                onChange={(e) => setIsQuietZone(e.target.checked)}
                className="w-4 h-4 text-[#008751] rounded border-slate-300"
              />
              <span className="text-xs font-bold text-slate-700">Zone Silencieuse</span>
            </label>
          </div>

          {/* Notes / Equipment description */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">
              Notes de maintenance & Équipements
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Saisissez une note de maintenance ou un détail d'équipement..."
              className="w-full p-2.5 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-[#008751] outline-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#008751] text-white hover:bg-[#007043] transition-colors shadow-lg shadow-emerald-950/20 flex items-center space-x-2"
            >
              {isSaving ? (
                <span>Enregistrement...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Enregistrer les modifications</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
