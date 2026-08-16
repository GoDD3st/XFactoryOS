import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Download, QrCode } from 'lucide-react';
import { Workstation } from '@/frontend/src/types';
import { apiFetchSeatQrToken } from '@/services/api/checkinoutApi';

interface SeatQRModalProps {
  workstation: Workstation;
  onClose: () => void;
}

export const SeatQRModal: React.FC<SeatQRModalProps> = ({ workstation, onClose }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetchSeatQrToken(workstation.id)
      .then((token) => {
        const scanUrl = `${window.location.origin}/?scan=${encodeURIComponent(token)}`;
        return QRCode.toDataURL(scanUrl, { width: 320, margin: 2 });
      })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [workstation.id]);

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <QrCode className="w-4 h-4 text-teal-600" />
            Badge QR - {workstation.code}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-500">
          À imprimer et afficher sur le poste. Les collaborateurs le scannent avec leur téléphone pour faire leur check-in / check-out.
        </p>

        {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}

        {!dataUrl && !error && (
          <div className="h-64 flex items-center justify-center text-xs text-slate-400">Génération du QR code...</div>
        )}

        {dataUrl && (
          <div className="flex flex-col items-center gap-3">
            <img src={dataUrl} alt={`QR code poste ${workstation.code}`} className="w-64 h-64 border border-slate-200 rounded-xl" />
            <a
              href={dataUrl}
              download={`badge-${workstation.code}.png`}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Télécharger le badge
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
