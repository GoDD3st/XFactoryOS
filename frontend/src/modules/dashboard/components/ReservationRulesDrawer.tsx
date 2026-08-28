import React, { useEffect, useState } from 'react';
import {
  X,
  Scale,
  Clock,
  CalendarDays,
  ListOrdered,
  UserCheck,
  ShieldCheck,
  Layers,
  Sparkles,
} from 'lucide-react';
import { SystemSettings } from '../../../types';
import { SettingsService } from '@/services/settings/settingsService';

/**
 * Reservation rules reference for end users.
 *
 * Replaces the AI assistant on the collaborator surface: in Module 1 the assistant is not made
 * available to collaborators (per-token cost), and the questions they actually asked it were
 * about the booking rules - which are deterministic and can be answered without a model.
 *
 * Every figure comes from the live SystemSettings rather than being written into the copy, so an
 * admin changing the no-show delay or the approval threshold updates this panel too. Hardcoding
 * them would produce a help screen that quietly contradicts the system enforcing the rules.
 */

interface RuleSection {
  icon: React.ReactNode;
  title: string;
  /** BPMN diagram this rule comes from, shown as a small provenance tag. */
  source: string;
  lines: string[];
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min} minutes`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${h} heures`;
}

function buildSections(s: SystemSettings): RuleSection[] {
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const workingDays = (s.workingDays || []).map((d) => days[d]).filter(Boolean).join(', ');

  return [
    {
      icon: <ListOrdered className="w-4 h-4" />,
      title: 'Premier arrivé, premier servi (FIFO)',
      source: 'BPMN D1',
      lines: [
        'Les postes sont attribués dans l’ordre des demandes : la première réservation validée obtient le poste.',
        'Si le poste que vous visez est déjà pris sur votre créneau, l’application vous propose automatiquement des postes libres dans le même cluster.',
      ],
    },
    {
      icon: <Clock className="w-4 h-4" />,
      title: 'Check-in obligatoire et no-show',
      source: 'BPMN D4',
      lines: [
        `Après le début de votre créneau, vous disposez de ${formatMinutes(
          s.noShowDelayMinutes
        )} pour effectuer votre check-in (scan du QR code du poste).`,
        `Sans check-in dans ce délai, la réservation passe en no-show : le poste est automatiquement libéré et proposé aux personnes en liste d’attente.`,
        'Un no-show est enregistré dans vos statistiques d’utilisation. Pensez à annuler si vous ne venez pas.',
        'Oubli de scan ? Vous pouvez demander un check-in tardif : un responsable valide ou refuse la demande.',
      ],
    },
    {
      icon: <CalendarDays className="w-4 h-4" />,
      title: 'Durée et fenêtre de réservation',
      source: 'BPMN D1 / D2',
      lines: [
        `Durée d’un créneau : de ${formatMinutes(s.minReservationMinutes)} à ${formatMinutes(
          s.maxReservationMinutes
        )}.`,
        `Réservation à effectuer au moins ${s.bookingWindowDays} jour(s) à l’avance (délai d’anticipation).`,
        'Un check-out anticipé ne rend pas les heures restantes réservables immédiatement par d’autres collaborateurs : le délai d’anticipation reste applicable à toute nouvelle réservation.',
        'Seul le titulaire de la réservation suivante sur le même poste peut se voir proposer d’avancer le début de sa propre réservation sur la période libérée. La proposition doit être acceptée explicitement depuis le tableau de bord.',
        `Horaires d’ouverture : ${s.workingHoursStart} - ${s.workingHoursEnd}${
          workingDays ? ` (${workingDays})` : ''
        }.`,
        s.allowWeekendBooking
          ? 'Les réservations le week-end sont autorisées.'
          : 'Les réservations le week-end ne sont pas autorisées.',
        s.allowHolidayBooking
          ? 'Les réservations les jours fériés sont autorisées.'
          : 'Les réservations les jours fériés ne sont pas autorisées.',
      ],
    },
    {
      icon: <ShieldCheck className="w-4 h-4" />,
      title: 'Réservation longue durée : accord requis',
      source: 'BPMN D2',
      lines: [
        `Au-delà de ${s.maxReservationDaysWithoutApproval} jour(s) ouvré(s), votre demande part en approbation auprès de l’Assistant de Direction ou du Directeur de Site.`,
        'La demande doit être motivée : indiquez l’objectif et la durée nécessaire.',
        'Trois issues possibles : approuvée, refusée avec motif, ou demande de complément d’information.',
        'En cas de demande de complément, vous recevez une notification : complétez votre motif et la demande repart automatiquement vers l’approbateur.',
      ],
    },
    {
      icon: <UserCheck className="w-4 h-4" />,
      title: 'Liste d’attente',
      source: 'BPMN D5',
      lines: [
        'Si un poste est déjà réservé sur tout le créneau, vous pouvez vous inscrire sur sa liste d’attente.',
        'Si le poste se libère (annulation, no-show, départ anticipé), il est proposé à la première personne inscrite.',
        'L’offre est limitée dans le temps : sans réponse, elle passe automatiquement à la personne suivante.',
        'Une fois l’offre acceptée, le check-in reste obligatoire - sinon le poste repart en liste d’attente.',
      ],
    },
    {
      icon: <Layers className="w-4 h-4" />,
      title: 'Quotas et postes réservés',
      source: 'SRS §13',
      lines: [
        `Vous pouvez avoir jusqu’à ${s.maxReservationsPerUserPerDay} réservation(s) par jour et ${s.maxReservationsPerUserPerWeek} par semaine.`,
        'Certains clusters sont réservés au management : ils apparaissent verrouillés et nécessitent une autorisation du GCI Manager ou du Building Manager, avec motif.',
        'Les postes en maintenance ne sont pas réservables tant que l’intervention n’est pas terminée.',
      ],
    },
    {
      icon: <Sparkles className="w-4 h-4" />,
      title: 'Clean Desk',
      source: 'BPMN D4',
      lines: [
        'À la fin de votre créneau, le poste est libéré automatiquement (check-out automatique).',
        'Vous pouvez aussi faire un check-out manuel si vous partez plus tôt : le poste redevient disponible immédiatement pour les autres.',
        'Laissez le poste propre et sans effet personnel : la politique Clean Desk s’applique à tous les postes partagés.',
      ],
    },
  ];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const ReservationRulesDrawer: React.FC<Props> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<SystemSettings | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Re-read on each open so a settings change made elsewhere is reflected without a reload.
    setSettings(SettingsService.getSettings() as SystemSettings);

    const refresh = () => setSettings(SettingsService.getSettings() as SystemSettings);
    window.addEventListener('xfactory_settings_changed', refresh);
    return () => window.removeEventListener('xfactory_settings_changed', refresh);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sections = settings ? buildSections(settings) : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />

      <aside
        role="dialog"
        aria-label="Règles de réservation"
        className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        <header className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#008751] text-white flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                Règles de réservation
              </h2>
              <p className="text-[11px] text-slate-500">
                Open Space XFactory - {settings?.siteName || 'Site Safi'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!settings ? (
            <p className="text-xs text-slate-400">Chargement des règles...</p>
          ) : (
            sections.map((section) => (
              <section
                key={section.title}
                className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-2"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[#008751] shrink-0">
                    {section.icon}
                  </div>
                  <h3 className="text-xs font-bold text-slate-800 flex-1">{section.title}</h3>
                  <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 shrink-0">
                    {section.source}
                  </span>
                </div>
                <ul className="space-y-1.5 pl-1">
                  {section.lines.map((line, i) => (
                    <li key={i} className="text-[11px] text-slate-600 leading-relaxed flex gap-2">
                      <span className="text-[#008751] font-bold shrink-0">•</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <footer className="p-3 border-t border-slate-200 shrink-0">
          <p className="text-[10px] text-slate-400 text-center">
            Ces règles sont appliquées automatiquement par la plateforme. Les valeurs affichées
            reflètent la configuration en vigueur.
          </p>
        </footer>
      </aside>
    </div>
  );
};
