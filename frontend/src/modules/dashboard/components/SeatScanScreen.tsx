import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, LogIn, LogOut } from 'lucide-react';
import { apiScanSeat } from '@/services/api/checkinoutApi';

interface SeatScanScreenProps {
  seatToken: string;
  onDone: () => void;
}

type ScanState =
  | { phase: 'loading' }
  | { phase: 'success'; action: 'check-in' | 'check-out'; workstation_code: string }
  | { phase: 'error'; message: string };

/**
 * Full-screen result shown right after AuthGate detects a pending seat-badge scan
 * (see AuthGate.tsx). The QR printed on a desk just opens this site with `?scan=<token>`
 * scanning it is the entire "check-in" action from the collaborator's side.
 */
export const SeatScanScreen: React.FC<SeatScanScreenProps> = ({ seatToken, onDone }) => {
  const [state, setState] = useState<ScanState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiScanSeat(seatToken)
      .then((result) => {
        if (!cancelled) setState({ phase: 'success', ...result });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ phase: 'error', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [seatToken]);

  return (
    <div className="min-h-dvh bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center space-y-4">
        {state.phase === 'loading' && (
          <>
            <div className="w-10 h-10 mx-auto border-2 border-slate-300 border-t-emerald-600 rounded-full animate-spin" />
            <p className="text-sm font-bold text-slate-700">Validation du badge en cours...</p>
          </>
        )}

        {state.phase === 'success' && (
          <>
            {state.action === 'check-in' ? (
              <LogIn className="w-12 h-12 mx-auto text-emerald-600" />
            ) : (
              <LogOut className="w-12 h-12 mx-auto text-slate-700" />
            )}
            <CheckCircle2 className="w-5 h-5 mx-auto text-emerald-500" />
            <h2 className="text-base font-black text-slate-900">
              {state.action === 'check-in' ? 'Check-in confirmé' : 'Check-out confirmé'}
            </h2>
            <p className="text-xs text-slate-500">Poste {state.workstation_code}</p>
          </>
        )}

        {state.phase === 'error' && (
          <>
            <XCircle className="w-12 h-12 mx-auto text-red-500" />
            <h2 className="text-base font-black text-slate-900">Échec du scan</h2>
            <p className="text-xs text-slate-500">{state.message}</p>
          </>
        )}

        {state.phase !== 'loading' && (
          <button
            onClick={onDone}
            className="w-full mt-2 px-4 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold rounded-xl transition-all"
          >
            Continuer
          </button>
        )}
      </div>
    </div>
  );
};
