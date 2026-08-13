import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Send,
  AlertCircle,
  FileText,
  Clock,
  Building,
  CheckCircle2
} from 'lucide-react';

interface ExtensionRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { objective: string; motif: string }) => void;
  businessDays: number;
  startDate: string;
  endDate: string;
  workstationCode: string;
  clusterName: string;
  isReLoop?: boolean;
  initialObjective?: string;
  initialMotif?: string;
  approverFeedbackNote?: string;
}

export const ExtensionRequestModal: React.FC<ExtensionRequestModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  businessDays,
  startDate,
  endDate,
  workstationCode,
  clusterName,
  isReLoop = false,
  initialObjective = '',
  initialMotif = '',
  approverFeedbackNote,
}) => {
  const [objective, setObjective] = useState<string>(initialObjective);
  const [motif, setMotif] = useState<string>(initialMotif);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!objective.trim() || objective.trim().length < 15) {
      setErrorMsg('Veuillez fournir un objectif et motif détaillé (minimum 15 caractères).');
      return;
    }

    setIsSubmitting(true);
    onSubmit({ objective, motif: motif || 'Projet Longue Durée Safi' });
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
          <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200 text-purple-700">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded bg-purple-900 text-white uppercase">
                {businessDays} Jours Ouvrés &gt; 2j
              </span>
              <span className="text-xs text-purple-700 font-bold">Workflow Validation Multi-Direction</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">
              {isReLoop
                ? 'Nouvelle Description Demandée (Re-Loop Approval)'
                : 'Formulaire de Demande d\'Extension de Réservation'}
            </h2>
          </div>
        </div>

        {/* Approver Feedback Note (Re-Loop Case) */}
        {isReLoop && approverFeedbackNote && (
          <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-300 text-xs text-amber-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-amber-800">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span>Remarque du Valideur (Nouvelle description demandée) :</span>
            </div>
            <p className="italic pl-5 font-semibold text-slate-800">{approverFeedbackNote}</p>
          </div>
        )}

        {/* Reservation Context Summary */}
        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs space-y-1 text-slate-700">
          <div className="flex justify-between items-center font-bold text-slate-800">
            <span>Poste : {workstationCode} ({clusterName})</span>
            <span className="text-purple-700">{businessDays} Jours Ouvrés</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Du <strong>{startDate}</strong> au <strong>{endDate}</strong> (08:00 – 18:00)
          </p>
          <p className="text-[11px] text-purple-800 font-semibold pt-1 border-t border-slate-200">
            👥 Sera soumis pour arbitrage à : <strong>Building Manager, Assistant Directeur, Directeur, Admin &amp; SuperAdmin</strong>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Objective / Detailed Description */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">
              Objectif et Motif Détaillé de la Réservation (&gt; 2 Jours Ouvrés) <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              value={objective}
              onChange={(e) => {
                setObjective(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="Expliquez en détail le projet, la mission ou l'objectif nécessitant l'occupation du poste sur plus de 2 jours..."
              className="w-full p-3 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-purple-600 outline-none"
            />
            <p className="text-[11px] text-slate-400">Minimum 15 caractères. Précisez le projet et les livrables associés.</p>
          </div>

          {/* Project / Mission Name */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">
              Intitulé du Projet / Mission
            </label>
            <input
              type="text"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="ex: Mission Digital Twin Safi Level 1"
              className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-purple-600 outline-none"
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

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
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-purple-700 text-white hover:bg-purple-800 transition-colors shadow-lg shadow-purple-950/20 flex items-center space-x-2"
            >
              <Send className="w-4 h-4" />
              <span>{isReLoop ? 'Re-soumettre l\'objectif' : 'Envoyer la demande de validation'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
