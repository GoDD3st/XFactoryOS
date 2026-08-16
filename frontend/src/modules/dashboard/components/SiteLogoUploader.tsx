import React, { useRef, useState } from 'react';
import { Image as ImageIcon, Upload, Trash2, ShieldCheck, AlertCircle, Check } from 'lucide-react';
import { apiUploadSiteLogo, apiClearSiteLogo } from '@/services/api/settingsApi';

/**
 * Site logo upload.
 *
 * The checks here are convenience only - they stop obvious mistakes before a network round-trip.
 * Everything that matters is re-validated server-side in services/settings/logoValidation.ts,
 * because a client-side check is trivially bypassed by calling the endpoint directly.
 */

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 512 * 1024;

interface Props {
  currentLogo: string | null;
  onChanged: (logo: string | null) => void;
}

export const SiteLogoUploader: React.FC<Props> = ({ currentLogo, onChanged }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setSuccess(null);

    if (!ACCEPTED.includes(file.type)) {
      setError(
        file.type === 'image/svg+xml'
          ? "Le format SVG n'est pas accepté : il peut contenir du code exécutable. Utilisez PNG, JPEG ou WebP."
          : `Format non accepté (${file.type || 'inconnu'}). Formats autorisés : PNG, JPEG, WebP.`
      );
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Image trop volumineuse (${Math.round(file.size / 1024)} Ko). Maximum 512 Ko.`);
      return;
    }

    setBusy(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
        reader.readAsDataURL(file);
      });

      // The server returns the NORMALISED data URI it actually stored, rebuilt from the sniffed
      // type - display that rather than what we read locally.
      const result = await apiUploadSiteLogo(dataUrl);
      onChanged(result.logo);
      setSuccess(
        `Logo enregistré (${result.meta?.format}, ${result.meta?.width}×${result.meta?.height}, ${Math.round(
          (result.meta?.bytes || 0) / 1024
        )} Ko).`
      );
    } catch (err: any) {
      setError(err?.message || "Échec de l'envoi du logo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await apiClearSiteLogo();
      onChanged(null);
      setSuccess('Logo supprimé - le sigle XF est rétabli.');
    } catch (err: any) {
      setError(err?.message || 'Échec de la suppression du logo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <label className="text-xs font-bold text-slate-700 block">Logo du Site</label>

      <div className="flex items-center gap-4 p-3 rounded-xl border border-slate-200 bg-slate-50/60">
        <div className="w-14 h-14 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
          {currentLogo ? (
            <img src={currentLogo} alt="Logo actuel" className="w-full h-full object-contain" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-[#008751] flex items-center justify-center">
              <span className="text-amber-300 font-extrabold text-sm tracking-tighter">XF</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            PNG, JPEG ou WebP · 512 Ko maximum · 2048×2048 px maximum. Sans logo, le sigle XF est
            utilisé.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold text-[11px] rounded-lg transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              {busy ? 'Envoi...' : 'Choisir une image'}
            </button>
            {currentLogo && (
              <button
                type="button"
                disabled={busy}
                onClick={clear}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-rose-50 border border-slate-200 text-rose-600 font-bold text-[11px] rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Supprimer
              </button>
            )}
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      <div className="flex items-start gap-2 text-[10px] text-slate-500 leading-relaxed">
        <ShieldCheck className="w-3.5 h-3.5 text-[#008751] shrink-0 mt-0.5" />
        <span>
          Chaque image est contrôlée côté serveur avant enregistrement : correspondance entre le
          type déclaré et le contenu réel, détection de code exécutable embarqué (script, HTML,
          exécutable), limites de taille et de dimensions. Le SVG est refusé. Ce contrôle ne
          remplace pas un antivirus.
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200">
          <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-rose-900">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-emerald-900">{success}</p>
        </div>
      )}
    </div>
  );
};
