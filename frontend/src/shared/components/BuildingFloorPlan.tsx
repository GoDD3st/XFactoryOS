import React, { useState, useEffect } from 'react';
import { X, Clock, ArrowLeft } from 'lucide-react';

/**
 * Schematic room map derived from the real Site Safi Module 1 floor plan blueprint.
 * Coordinates are percentages of the building canvas (left, top, width, height), traced by eye
 * from the blueprint — not architectural precision, but real room names/relative positions/
 * proportions instead of an invented layout.
 *
 * Only the Open Space zone is part of Module 1 (the scope currently being built/validated).
 * `interactive: false` rooms (WCs, kitchens, storage, corridors, prayer room, smoking area) never
 * become clickable — there's nothing to click into, ever, even once other modules ship.
 * `interactive: true` non-openspace rooms (meeting rooms, focus rooms) are plausible future
 * features — clicking shows a "Coming Soon" placeholder rather than faking it.
 */
interface ZoneDef {
  id: string;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
  kind: 'utility' | 'meeting' | 'relax' | 'circulation' | 'openspace';
  interactive: boolean;
  /** Rotates the label 90° — for tall narrow zones (corridors, right-hand column). */
  vertical?: boolean;
}

/**
 * Layout redrawn from the reference blueprint. The structural changes versus the previous
 * version, all of which came from that plan:
 *
 *  - the circulation spine is now TWO vertical corridors, one immediately right of the
 *    left-hand service column and one on the right-hand edge, instead of a single mid-plan
 *    spur; the horizontal corridor under the meeting rooms is kept and now runs between them;
 *  - Accueil / Espace de repos becomes a wide block occupying the bottom-left, to the left of
 *    the Open Space, rather than a narrow strip;
 *  - the bottom-left "Cour" is replaced by Sanitaire 3H + 3F + PMR;
 *  - Kitchenette and Zone Fumeurs sit stacked on the right edge with vertical labels.
 *
 * Every pre-existing space is preserved; only positions changed.
 */
const ZONES: ZoneDef[] = [
  // ── Left service column ────────────────────────────────────────────────────────────────────
  { id: 'vestiaires-1', label: 'Vestiaires', left: 0, top: 0, width: 8.3, height: 13.5, kind: 'utility', interactive: false },
  { id: 'vestiaires-2', label: 'Vestiaires', left: 0, top: 13.5, width: 8.3, height: 13.5, kind: 'utility', interactive: false },
  { id: 'kitchenette-1', label: 'Kitchenette', left: 0, top: 27, width: 8.3, height: 13.5, kind: 'utility', interactive: false },
  { id: 'salle-priere', label: 'Salle de prière', left: 0, top: 40.5, width: 8.3, height: 21, kind: 'relax', interactive: false },
  // Bottom-left is now sanitaires (was "Cour" — absent from the reference plan).
  { id: 'sanitaire-pmr', label: 'Sanitaire 3H + 3F + PMR', left: 0, top: 61.5, width: 8.3, height: 38.5, kind: 'utility', interactive: false },

  // ── Vertical corridor, left ────────────────────────────────────────────────────────────────
  { id: 'couloir-vertical-gauche', label: 'Couloir', left: 8.3, top: 0, width: 3.2, height: 61.5, kind: 'circulation', interactive: false, vertical: true },

  // ── Top utility strip ──────────────────────────────────────────────────────────────────────
  { id: 'sas', label: 'SAS', left: 11.5, top: 0, width: 3.0, height: 15.5, kind: 'circulation', interactive: false },
  { id: 'menages', label: 'Ménages', left: 14.5, top: 0, width: 4.32, height: 15.5, kind: 'utility', interactive: false },
  { id: 'stockage-1', label: 'Stockage', left: 18.82, top: 0, width: 5.42, height: 15.5, kind: 'utility', interactive: false },
  { id: 'lt-1', label: 'L.T.', left: 24.24, top: 0, width: 6.07, height: 15.5, kind: 'utility', interactive: false },
  { id: 'regie-traduction', label: 'Régie Traduction', left: 30.31, top: 0, width: 7.24, height: 15.5, kind: 'utility', interactive: false },

  // Conference room, under the utility strip.
  { id: 'salle-conferences', label: 'Salle de réunion/conférences (52 pers.)', left: 11.5, top: 15.5, width: 26.05, height: 40.75, kind: 'meeting', interactive: true },

  // ── Meeting / lab row ──────────────────────────────────────────────────────────────────────
  { id: 'stand-up-meeting', label: 'Safi Hub', left: 39.88, top: 0, width: 7.88, height: 37.5, kind: 'meeting', interactive: true },
  { id: 'total-focus', label: 'Phos Lab', left: 47.76, top: 0, width: 7.64, height: 37.5, kind: 'meeting', interactive: true },
  { id: 'brainstorming', label: 'Seed Room', left: 55.4, top: 0, width: 7.9, height: 37.5, kind: 'meeting', interactive: true },
  { id: 'lt-2', label: 'Sanitaire 2H + 2F', left: 63.3, top: 0, width: 8.08, height: 37.5, kind: 'utility', interactive: false },
  { id: 'salle-reunion-01', label: 'Growth LAB', left: 71.38, top: 0, width: 15.28, height: 37.5, kind: 'meeting', interactive: true },
  { id: 'salle-reunion-02', label: 'XMind Factory', left: 86.66, top: 0, width: 8.14, height: 37.5, kind: 'meeting', interactive: true },

  // Horizontal corridor under the meeting row, between the two vertical corridors.
  { id: 'couloir-horizontal', label: 'Couloir', left: 39.88, top: 37.5, width: 54.92, height: 21.45, kind: 'circulation', interactive: false },

  // ── Right-hand column ──────────────────────────────────────────────────────────────────────
  { id: 'stockage-2', label: 'Stockage', left: 94.8, top: 0, width: 5.2, height: 13.5, kind: 'utility', interactive: false },
  { id: 'kitchenette-2', label: 'Kitchenette', left: 94.8, top: 13.5, width: 5.2, height: 48, kind: 'utility', interactive: false, vertical: true },
  { id: 'zone-fumeur', label: 'Zone Fumeurs', left: 94.8, top: 61.5, width: 5.2, height: 38.5, kind: 'relax', interactive: false, vertical: true },

  // ── Bottom band ────────────────────────────────────────────────────────────────────────────
  // Accueil / Espace de repos, wide, immediately left of the Open Space.
  { id: 'hall', label: 'Espace de repos / Accueil', left: 8.3, top: 61.5, width: 31.58, height: 38.5, kind: 'relax', interactive: true },
];

// Open Space fusionné en une seule zone unique (au lieu de Ouest/Est séparés)
const OPEN_SPACE_ZONES: ZoneDef[] = [
  { id: 'open-space', label: 'Open Space', left: 39.88, top: 61.5, width: 54.92, height: 38.5, kind: 'openspace', interactive: true },
];

/** Door symbols (gap in the wall + swing arc), positioned/rotated by eye from the user's blueprint markup. */
interface DoorDef {
  id: string;
  left: number;
  top: number;
  /** 0 = door sits on a horizontal wall (swings up into the room above); 90 = sits on a vertical wall (swings right) */
  rotation: number;
  label: string;
}

const DOORS: DoorDef[] = [
  { id: 'door-exterior-hall', left: 24, top: 100, rotation: 0, label: "Porte principale — accès extérieur vers l'Espace de repos / Accueil" },
  { id: 'door-hall-openspace', left: 39.88, top: 82, rotation: 90, label: "Porte d'accès — Accueil vers l'Open Space" },
  { id: 'door-exterior-openspace', left: 57.5, top: 100, rotation: 0, label: 'Porte principale — accès extérieur direct vers l\'Open Space' },
];

const DoorSymbol: React.FC<DoorDef> = ({ left, top, rotation, label }) => (
  <div
    className="absolute z-10 group"
    style={{ left: `${left}%`, top: `${top}%`, width: '4%', aspectRatio: '1', transform: 'translate(-50%, -50%)' }}
    title={label}
  >
    <svg viewBox="0 0 40 40" className="w-full h-full overflow-visible" style={{ transform: `rotate(${rotation}deg)` }}>
      {/* gap in the wall */}
      <rect x="0" y="17" width="40" height="6" fill="white" />
      {/* door leaf, open at ~80° */}
      <line x1="2" y1="20" x2="2" y2="38" stroke="#0f172a" strokeWidth="2" />
      {/* swing arc */}
      <path d="M 2 38 A 18 18 0 0 0 20 20" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />
    </svg>
  </div>
);

interface BuildingFloorPlanProps {
  /** Full interactive cluster cards for a given Open Space zone — shown only in the zoomed-in view */
  renderOpenSpaceDetail: (zoneId: string) => React.ReactNode;
  /** Lightweight stats for the compact building-overview tile */
  getOpenSpaceSummary: (zoneId: string) => { clusterCount: number; seatCount: number };
}

const ZONE_COLORS: Record<ZoneDef['kind'], string> = {
  utility: 'bg-slate-50 border-slate-200 text-slate-400',
  meeting: 'bg-sky-50/60 border-sky-200 text-sky-700',
  relax: 'bg-amber-50/60 border-amber-200 text-amber-700',
  circulation: 'bg-slate-100/50 border-slate-200 text-slate-300',
  openspace: 'bg-emerald-50/60 border-emerald-400 text-emerald-800',
};

const ZOOM_MS = 480;

export const BuildingFloorPlan: React.FC<BuildingFloorPlanProps> = ({ renderOpenSpaceDetail, getOpenSpaceSummary }) => {
  const [comingSoonZone, setComingSoonZone] = useState<string | null>(null);
  const [zoomedZoneId, setZoomedZoneId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'building' | 'zooming-in' | 'zoomed' | 'zooming-out'>('building');
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const [zoomedMounted, setZoomedMounted] = useState(false);

  useEffect(() => {
    if (phase !== 'zoomed') return;
    setZoomedMounted(false);
    const raf = requestAnimationFrame(() => setZoomedMounted(true));
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const handleOpenSpaceClick = (zone: ZoneDef) => {
    setZoomOrigin({ x: zone.left + zone.width / 2, y: zone.top + zone.height / 2 });
    setZoomedZoneId(zone.id);
    setPhase('zooming-in');
    window.setTimeout(() => setPhase('zoomed'), ZOOM_MS);
  };

  const handleBack = () => {
    setZoomedMounted(false);
    setPhase('zooming-out');
    window.setTimeout(() => {
      setPhase('building');
      setZoomedZoneId(null);
    }, ZOOM_MS);
  };

  const buildingVisible = phase === 'building' || phase === 'zooming-in';

  return (
    <div className="space-y-2">
      {buildingVisible ? (
        <>
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-emerald-600" />
            Plan réel du site Safi — cliquez sur l'<strong className="text-emerald-700">Open Space (Module 1)</strong> pour voir les postes. Les autres salles seront activées aux modules suivants.
          </p>

          <div
            className="relative w-full border-2 border-slate-800 rounded-lg overflow-hidden bg-white transition-all ease-in"
            style={{
              aspectRatio: '2000 / 760',
              transitionDuration: `${ZOOM_MS}ms`,
              transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
              transform: phase === 'zooming-in' ? 'scale(9)' : 'scale(1)',
              opacity: phase === 'zooming-in' ? 0 : 1,
            }}
          >
            {ZONES.map((z) =>
              z.interactive ? (
                <button
                  key={z.id}
                  onClick={() => setComingSoonZone(z.label)}
                  className={`absolute border text-center flex items-center justify-center px-1 leading-tight font-semibold hover:brightness-95 transition-all cursor-pointer overflow-hidden ${ZONE_COLORS[z.kind]}`}
                  style={{
                    left: `${z.left}%`, top: `${z.top}%`, width: `${z.width}%`, height: `${z.height}%`,
                    fontSize: 'clamp(6px, 0.9vw, 12px)',
                    writingMode: z.vertical ? 'vertical-rl' : undefined,
                  }}
                  title={`${z.label} (à venir)`}
                >
                  {z.label}
                </button>
              ) : (
                <div
                  key={z.id}
                  className={`absolute border text-center flex items-center justify-center px-1 leading-tight font-medium overflow-hidden ${ZONE_COLORS[z.kind]}`}
                  style={{
                    left: `${z.left}%`, top: `${z.top}%`, width: `${z.width}%`, height: `${z.height}%`,
                    fontSize: 'clamp(6px, 0.9vw, 12px)',
                    writingMode: z.vertical ? 'vertical-rl' : undefined,
                  }}
                >
                  {z.label}
                </div>
              )
            )}

            {OPEN_SPACE_ZONES.map((z) => {
              const summary = getOpenSpaceSummary(z.id);
              return (
                <button
                  key={z.id}
                  onClick={() => handleOpenSpaceClick(z)}
                  className={`absolute border-2 rounded flex flex-col items-center justify-center gap-1 transition-all hover:brightness-95 hover:scale-[1.02] cursor-pointer ${ZONE_COLORS.openspace}`}
                  style={{ left: `${z.left}%`, top: `${z.top}%`, width: `${z.width}%`, height: `${z.height}%` }}
                >
                  <span className="text-[10px] sm:text-xs font-black uppercase tracking-wide">{z.label}</span>
                  <span className="text-[9px] sm:text-[11px] font-semibold opacity-80">
                    {summary.clusterCount} cluster{summary.clusterCount !== 1 ? 's' : ''} • {summary.seatCount} postes
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-bold opacity-70">Cliquer pour zoomer</span>
                </button>
              );
            })}

            {DOORS.map((d) => (
              <DoorSymbol key={d.id} {...d} />
            ))}
          </div>
        </>
      ) : (
        <div
          className="transition-all ease-out"
          style={{
            transitionDuration: `${ZOOM_MS}ms`,
            opacity: zoomedMounted && phase === 'zoomed' ? 1 : 0,
            transform: zoomedMounted && phase === 'zoomed' ? 'scale(1)' : 'scale(0.94)',
          }}
        >
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 mb-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Retour au plan du bâtiment
          </button>
          {zoomedZoneId && renderOpenSpaceDetail(zoomedZoneId)}
        </div>
      )}

      {comingSoonZone && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          onClick={() => setComingSoonZone(null)}
        >
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center space-y-3 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setComingSoonZone(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
            <Clock className="w-10 h-10 text-emerald-600 mx-auto" />
            <h3 className="text-2xl font-black text-slate-800">Bientôt disponible</h3>
            <p className="text-sm text-slate-500">
              <strong>{comingSoonZone}</strong> fera partie d'un module ultérieur. Seul l'Open Space (Module 1) est actif pour le moment.
            </p>
            <button
              onClick={() => setComingSoonZone(null)}
              className="mt-2 px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};