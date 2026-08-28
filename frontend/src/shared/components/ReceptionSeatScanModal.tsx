import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X, ScanLine, UserCheck, LogOut, AlertCircle } from 'lucide-react';
import { Reservation } from '@/frontend/src/types';
import {
  apiDecodeSeatToken,
  apiCheckInForReservation,
  apiCheckOutForReservation,
} from '@/services/api/checkinoutApi';

interface ReceptionSeatScanModalProps {
  todaysReservations: Reservation[];
  onClose: () => void;
  onDone: () => void;
}

function extractSeatToken(rawText: string): string {
  try {
    const url = new URL(rawText);
    const token = url.searchParams.get('scan');
    if (token) return token;
  } catch {
    // Not a URL - assume the raw scanned text is the token itself.
  }
  return rawText.trim();
}

const SCANNER_ELEMENT_ID = 'reception-seat-qr-reader';

export const ReceptionSeatScanModal: React.FC<ReceptionSeatScanModalProps> = ({
  todaysReservations,
  onClose,
  onDone,
}) => {
  const [seatToken, setSeatToken] = useState<string | null>(null);
  const [workstationCode, setWorkstationCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    if (seatToken) return; // scanner only needed until a code is decoded

    const scanner = new Html5QrcodeScanner(SCANNER_ELEMENT_ID, { fps: 10, qrbox: 240 }, false);
    scannerRef.current = scanner;

    scanner.render(
      (decodedText) => {
        const token = extractSeatToken(decodedText);
        scanner.clear().catch(() => {});
        setError(null);
        apiDecodeSeatToken(token)
          .then(({ workstationCode: code }) => {
            setSeatToken(token);
            setWorkstationCode(code);
          })
          .catch((err: Error) => setError(err.message));
      },
      () => {
        // ignore per-frame "no QR found" callbacks
      }
    );

    return () => {
      scannerRef.current?.clear().catch(() => {});
    };
  }, [seatToken]);

  const seatReservations = workstationCode
    ? todaysReservations.filter(
        (r) => r.workstation_code === workstationCode && (r.status === 'confirmée' || r.status === 'check-in')
      )
    : [];

  const selectedReservation = seatReservations.find((r) => r.user_id === selectedUserId);

  const handleConfirm = async () => {
    if (!seatToken || !selectedReservation) return;
    setSubmitting(true);
    setError(null);
    try {
      // Routed through the dedicated on-behalf endpoints rather than a scan that guesses the
      // action from the current status. Both are role-gated server-side and record the staff
      // member as the actor with the collaborator as the subject, so the audit trail never
      // claims the collaborator did this themselves.
      if (selectedReservation.status === 'check-in') {
        await apiCheckOutForReservation(selectedReservation.id);
      } else {
        await apiCheckInForReservation(selectedReservation.id);
      }
      onDone();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-teal-600" />
            Scanner le badge du poste
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!seatToken && <div id={SCANNER_ELEMENT_ID} className="w-full" />}

        {seatToken && workstationCode && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Poste détecté : <strong className="text-slate-900">{workstationCode}</strong>
            </p>

            {seatReservations.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                Aucune réservation aujourd'hui sur ce poste.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {seatReservations.map((r) => (
                  <label
                    key={r.id}
                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer text-xs ${
                      selectedUserId === r.user_id ? 'border-teal-500 bg-teal-50' : 'border-slate-200'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="reception-scan-user"
                        checked={selectedUserId === r.user_id}
                        onChange={() => setSelectedUserId(r.user_id)}
                      />
                      <span className="font-bold text-slate-800">{r.user_name}</span>
                    </span>
                    <span className="text-[10px] font-bold text-slate-500">
                      {r.status === 'check-in' ? 'Check-out' : 'Check-in'}
                    </span>
                  </label>
                ))}
              </div>
            )}

            <button
              onClick={handleConfirm}
              disabled={!selectedReservation || submitting}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#008751] hover:bg-[#005f38] disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all"
            >
              {selectedReservation?.status === 'check-in' ? (
                <LogOut className="w-3.5 h-3.5" />
              ) : (
                <UserCheck className="w-3.5 h-3.5" />
              )}
              {submitting
                ? 'Traitement...'
                : selectedReservation?.status === 'check-in'
                ? 'Valider le check-out'
                : "Valider l'entrée"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
