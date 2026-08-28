import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X, ScanLine } from 'lucide-react';
import { SeatScanScreen } from '@/frontend/src/modules/dashboard/components/SeatScanScreen';

/**
 * In-app camera scan of a desk badge, for the person sitting at the desk.
 *
 * Captures the token and nothing more: once a badge is read it hands over to SeatScanScreen,
 * the same confirm-identity → details → explicit CHECK IN flow a phone camera reaches through
 * the URL. Scanning has not performed a check-in since that behaviour was removed, and this
 * component must not reintroduce it - one scan, one screen, one deliberate button press.
 *
 * The desk QR already worked from a phone's own camera app: it encodes
 * `<origin>/?scan=<token>`, AuthGate picks the token out of the URL, signs the visitor in if
 * they are not already, and SeatScanScreen posts it. That path is untouched and remains the one
 * that needs no app open at all.
 *
 * This exists for the case that path cannot serve: the user already has the app open. Sending
 * them out to the camera app so it can reopen the app they are looking at is absurd, and on a
 * desktop there is no camera app to leave to. Same endpoint, same result - only the way the token
 * is captured differs.
 *
 * Distinct from ReceptionSeatScanModal, which decodes the seat first and then asks WHICH
 * collaborator is being checked in. That question only makes sense for a receptionist acting on
 * someone else's behalf, and the endpoint behind it is restricted to roles allowed to do so. Here
 * there is no question to ask: the server takes the user from the JWT and looks for a reservation
 * matching that user AND that desk, so the scan either belongs to you or it does not.
 */

interface SelfSeatScanModalProps {
  onClose: () => void;
  /** Fired after a successful check-in or check-out so the host can refresh its data. */
  onDone: () => void;
}

/** The QR encodes a URL; a scanner reading it raw should still work. */
function extractSeatToken(rawText: string): string {
  try {
    const url = new URL(rawText);
    const token = url.searchParams.get('scan');
    if (token) return token;
  } catch {
    // Not a URL - assume the scanned text is the token itself.
  }
  return rawText.trim();
}

const SCANNER_ELEMENT_ID = 'self-seat-qr-reader';

type Phase = { name: 'scanning' } | { name: 'resolved'; token: string };

export const SelfSeatScanModal: React.FC<SelfSeatScanModalProps> = ({ onClose, onDone }) => {
  const [phase, setPhase] = useState<Phase>({ name: 'scanning' });
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    if (phase.name !== 'scanning') return;

    const scanner = new Html5QrcodeScanner(SCANNER_ELEMENT_ID, { fps: 10, qrbox: 240 }, false);
    scannerRef.current = scanner;

    scanner.render(
      (decodedText) => {
        // Stop the camera before moving on, not after: leaving it running keeps the torch on and
        // the frame callback firing, and a second decode of the same badge would open the flow
        // twice over the first.
        scanner.clear().catch(() => {});
        setPhase({ name: 'resolved', token: extractSeatToken(decodedText) });
      },
      () => {
        // Per-frame "no QR in view" callbacks - not errors, and not worth surfacing.
      }
    );

    return () => {
      scannerRef.current?.clear().catch(() => {});
    };
  }, [phase.name, onDone]);

  // Escape closes, and the page behind stops scrolling - same contract as the other dialogs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  // Once a badge is read, the explicit flow takes over full-screen: identity, reservation
  // details, and a button the user has to press. Rendered here rather than duplicated so the
  // in-app scan and the phone-camera scan cannot drift apart.
  if (phase.name === 'resolved') {
    return (
      <SeatScanScreen
        seatToken={phase.token}
        onDone={() => {
          onDone();
          onClose();
        }}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-900/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Scanner le QR code du poste"
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <ScanLine className="w-4 h-4 text-[#008751] shrink-0" />
            <h3 className="text-sm font-bold text-slate-900 truncate">Scanner le QR du poste</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-500">
            Placez le QR code collé sur le poste devant la caméra. Votre réservation s'affichera
            ensuite, et le check-in ne sera enregistré que lorsque vous appuierez sur le bouton.
          </p>
          <div id={SCANNER_ELEMENT_ID} className="rounded-xl overflow-hidden" />
          <p className="text-[11px] text-slate-400">
            Si la caméra ne démarre pas, autorisez son accès dans le navigateur - ou scannez le QR
            avec l'appareil photo du téléphone, ce qui ouvre directement la même page.
          </p>
        </div>
      </div>
    </div>
  );
};
