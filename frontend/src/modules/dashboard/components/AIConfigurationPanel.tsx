import React, { useEffect, useState } from 'react';
import { Bot, ShieldCheck, AlertCircle, CheckCircle, RefreshCw, History, Globe } from 'lucide-react';
import {
  apiFetchAIProviders,
  apiFetchAIConfig,
  apiFetchAIModels,
  apiTestAIConfig,
  apiActivateAIConfig,
  apiFetchAIConfigHistory,
  AIProviderOption,
  AIModelOption,
  AIConfigMetadata,
  AIConfigHistoryEntry,
} from '@/services/api/aiConfigApi';

/**
 * Global AI Configuration (§4, §22).
 *
 * The credential lives in local component state only long enough to be submitted, and is cleared
 * the moment activation succeeds. It is never written to localStorage, never placed in a URL, and
 * never returned by any endpoint - the panel can display a "...1a2b" hint but never the key.
 */

const STATUS_LABELS: Record<string, { label: string; tone: string; dot: string }> = {
  CONNECTED: { label: 'Connecté', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  VALIDATING: { label: 'Validation en cours', tone: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  INVALID_CREDENTIALS: { label: 'Identifiants invalides', tone: 'text-rose-700 bg-rose-50 border-rose-200', dot: 'bg-rose-500' },
  PROVIDER_UNAVAILABLE: { label: 'Provider indisponible', tone: 'text-rose-700 bg-rose-50 border-rose-200', dot: 'bg-rose-500' },
  MODEL_UNAVAILABLE: { label: 'Modèle indisponible', tone: 'text-rose-700 bg-rose-50 border-rose-200', dot: 'bg-rose-500' },
  NOT_CONFIGURED: { label: 'Non configuré', tone: 'text-slate-600 bg-slate-50 border-slate-200', dot: 'bg-slate-400' },
};

/** Normalises an activation failure into the shape the error panel renders. */
function errorFromActivation(err: any): {
  title: string;
  message: string;
  technicalDetail?: string;
  suggestions?: string[];
  unchangedNotice?: string;
} {
  return {
    title: ERROR_TITLES[err?.kind] || "Échec de l'activation",
    message: err?.message || "La configuration n'a pas pu être activée.",
    technicalDetail: err?.technicalDetail,
    suggestions: err?.suggestions,
    unchangedNotice: err?.unchangedNotice,
  };
}

const ERROR_TITLES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Identifiant API invalide',
  QUOTA_EXCEEDED: 'Quota IA dépassé',
  RATE_LIMITED: 'Limite de débit atteinte',
  MODEL_UNAVAILABLE: 'Modèle indisponible',
  MODEL_NOT_SUPPORTED: 'Modèle non supporté',
  PROVIDER_UNAVAILABLE: 'Fournisseur IA indisponible',
  NETWORK_ERROR: 'Erreur réseau',
  TIMEOUT: 'Délai dépassé',
};

const AVAILABILITY_BADGES: Record<string, { label: string; cls: string }> = {
  COMPATIBLE: { label:'Compatible', cls:'bg-emerald-100 text-emerald-800 border-emerald-200'},
  UNSUPPORTED: { label:'Non supporté', cls:'bg-slate-200 text-slate-700 border-slate-300'},
  UNAVAILABLE: { label:'Indisponible', cls:'bg-amber-100 text-amber-800 border-amber-200'},
};

const CAPABILITY_LABELS: Record<string, string> = {
  supportsTextGeneration: 'Génération de texte',
  supportsStructuredOutput: 'Sortie structurée',
  supportsToolCalling: 'Appel d’outils',
  supportsLongContext: 'Contexte long',
};

/**
 * `embedded` drops the panel's own card chrome and header so it can sit inside the Settings
 * accordion, which already supplies the title, icon and collapse control.
 */
export const AIConfigurationPanel: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const [providers, setProviders] = useState<AIProviderOption[]>([]);
  const [config, setConfig] = useState<AIConfigMetadata | null>(null);
  const [history, setHistory] = useState<AIConfigHistoryEntry[]>([]);

  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [models, setModels] = useState<AIModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  /** Models the vendor listed but refused to serve for this account, learned at activation. */
  const [rejectedModels, setRejectedModels] = useState<string[]>([]);

  const [loadingModels, setLoadingModels] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<{
    title: string;
    message: string;
    technicalDetail?: string;
    suggestions?: string[];
    unchangedNotice?: string;
  } | null>(null);
  const [showTechnicalDetail, setShowTechnicalDetail] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Activation is gated on a successful test of THIS exact provider/model pair (§9). Changing
  // either clears it, so an admin can never activate a combination that was never tested.
  const [testing, setTesting] = useState(false);
  const [testedOk, setTestedOk] = useState<{ provider: string; model: string } | null>(null);
  // Distinct from `error` (an action failed) - this means the panel could not read its own state,
  // so nothing below it should be trusted or presented as a diagnosis.
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [p, c, h] = await Promise.all([
        apiFetchAIProviders(),
        apiFetchAIConfig(),
        apiFetchAIConfigHistory(),
      ]);
      setProviders(p);
      setConfig(c);
      setHistory(h);
      setLoadError(null);
      if (c?.provider && !selectedProvider) setSelectedProvider(c.provider);
    } catch (err: any) {
      setConfig(null);
      setLoadError(err?.message || 'La configuration IA est momentanément illisible.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const fetchModels = async () => {
    if (!selectedProvider) return;
    setLoadingModels(true);
    setError(null);
    setModels([]);
    try {
      const list = await apiFetchAIModels(selectedProvider, apiKey || undefined);
      setModels(list);
      // Preselect the active model when re-listing the provider already in use.
      if (config?.provider === selectedProvider && config.model && list.some((m) => m.id === config.model)) {
        setSelectedModel(config.model);
      }
    } catch (err: any) {
      setError(err?.message || 'Impossible de récupérer les modèles.');
    } finally {
      setLoadingModels(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setError(null);
    setSuccess(null);
    setTestedOk(null);
    setShowTechnicalDetail(false);
    try {
      const result = await apiTestAIConfig({
        provider: selectedProvider,
        model: selectedModel,
        apiKey: apiKey || undefined,
      });

      if (result.ok) {
        setTestedOk({ provider: selectedProvider, model: selectedModel });
      } else {
        setError({
          title: result.title || 'Échec de la validation',
          message: result.message || 'La configuration n’a pas pu être validée.',
          technicalDetail: result.technicalDetail,
          suggestions: result.suggestions,
        });
        if (result.kind === 'MODEL_UNAVAILABLE' || result.kind === 'QUOTA_EXCEEDED') {
          setRejectedModels((prev) => (prev.includes(selectedModel) ? prev : [...prev, selectedModel]));
        }
      }
    } catch (err: any) {
      setError({ title: 'Test impossible', message: err?.message || 'Le test a échoué.' });
    } finally {
      setTesting(false);
    }
  };

  const activate = async () => {
    // Captured outside the try so the catch can still name it after selectedModel is cleared.
    const attemptedModel = selectedModel;
    setActivating(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await apiActivateAIConfig({
        provider: selectedProvider,
        model: selectedModel,
        apiKey: apiKey || undefined,
      });
      setConfig(updated);
      // Drop the plaintext key from memory as soon as it is no longer needed.
      setApiKey('');
      setSuccess('Configuration IA activée pour toute la plateforme.');
      setHistory(await apiFetchAIConfigHistory());
    } catch (err: any) {
      setError(errorFromActivation(err));
      // A model the vendor lists but refuses to serve can only be detected by trying it. Mark it
      // so the admin can see at a glance which entries are dead rather than retrying blindly.
      if (err?.kind === 'MODEL_UNAVAILABLE' || err?.kind === 'QUOTA_EXCEEDED' || err?.kind === 'MODEL_NOT_SUPPORTED') {
        setRejectedModels((prev) => (prev.includes(attemptedModel) ? prev : [...prev, attemptedModel]));
        setTestedOk(null);
      }
    } finally {
      setActivating(false);
      setConfirming(false);
    }
  };

  const status = STATUS_LABELS[config?.status || 'NOT_CONFIGURED'] || STATUS_LABELS.NOT_CONFIGURED;
  const chosenModel = models.find((m) => m.id === selectedModel);
  const selectionUsable =
    !!selectedProvider && !!selectedModel && !!chosenModel?.compatible && !rejectedModels.includes(selectedModel);

  const canTest = selectionUsable && !testing && !activating && !loadError;

  /** True only when the CURRENT provider/model pair is the one that passed the test. */
  const isTested = !!testedOk && testedOk.provider === selectedProvider && testedOk.model === selectedModel;

  // Blocked while the panel cannot read the current configuration, and until the exact pair has
  // been tested: activation replaces a platform-wide setting, and confirming that without knowing
  // what is being replaced - or whether the replacement works - is what §8 exists to prevent.
  const canActivate = selectionUsable && isTested && !activating && !testing && !loadError;

  return (
    <div
      className={
        embedded
          ? 'space-y-5 pt-4'
          : 'p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5'
      }
    >
      {!embedded && (
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Configuration IA Globale</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Cette configuration s'applique à l'assistant XFactory AI sur toute la plateforme
            </p>
          </div>
        </div>
      )}

      {/* Platform-wide warning - this is not a per-user preference. */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
        <Globe className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-900 leading-relaxed">
          <strong>Configuration système globale.</strong> Le provider et le modèle sélectionnés ici sont utilisés par
          toutes les capacités IA (recommandations, prévisions, détection d'anomalies, rapports, optimisation des
          clusters) et pour tous les utilisateurs, selon leurs permissions RBAC.
        </p>
      </div>

      {/* The panel could not read its own state. Shown INSTEAD of any diagnosis about the
          configuration, because with no data loaded every field below is just a default. */}
      {loadError && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-[11px] text-rose-900 leading-relaxed">
            <p className="font-bold">Configuration IA illisible</p>
            <p>{loadError}</p>
          </div>
        </div>
      )}

      {/* Only asserted when the server actually reported it - never inferred from a failed load. */}
      {!loadError && config && !config.credentialStorageAvailable && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-rose-900 leading-relaxed">
            <code className="font-mono">AI_CREDENTIAL_SECRET</code> n'est pas défini côté serveur. Les credentials ne
            peuvent pas être chiffrés au repos, donc aucune configuration ne peut être enregistrée tant que cette
            variable n'est pas configurée (32 caractères minimum).
          </p>
        </div>
      )}

      {/* Current state */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Provider</p>
          <p className="text-xs font-bold text-slate-800">{config?.providerName || ''}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Modèle</p>
          <p className="text-xs font-bold text-slate-800 font-mono">{config?.model || ''}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Statut</p>
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold ${status.tone}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Dernière validation</p>
          <p className="text-xs font-medium text-slate-700">
            {config?.lastValidatedAt ? new Date(config.lastValidatedAt).toLocaleString('fr-FR') : ''}
          </p>
        </div>
      </div>

      {(config?.configuredBy || config?.credentialHint) && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
          {config.configuredBy && (
            <span>
              Configuré par <strong className="text-slate-700">{config.configuredBy}</strong>
            </span>
          )}
          {config.credentialHint && (
            <span>
              Credential <code className="font-mono text-slate-700">...{config.credentialHint}</code>
            </span>
          )}
        </div>
      )}

      {/* Nothing configured yet. The provider account belongs to the customer, so this is an
          action for their Super Admin - not something the platform can supply a default for. */}
      {!loadError && config && !config.configured && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <Bot className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-700 leading-relaxed">
            Aucun fournisseur IA n'est configuré. L'assistant XFactory AI reste indisponible tant qu'un Admin ou
            Super Admin n'a pas enregistré un provider, une clé API de l'organisation et un modèle ci-dessous.
            Le compte et la facturation du fournisseur sont à la charge de l'organisation.
          </p>
        </div>
      )}

      <div className="border-t border-slate-100 pt-4 space-y-4">
        <p className="text-xs font-bold text-slate-700">Modifier la configuration</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Provider IA</label>
            <select
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value);
                setModels([]);
                setSelectedModel('');
                setError(null);
              }}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              <option value="">Sélectionner un provider...</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Clé API
              {config?.provider === selectedProvider && config?.configured && (
                <span className="font-normal text-slate-400"> - laisser vide pour conserver l'actuelle</span>
              )}
            </label>
            <input
              type="password"
              value={apiKey}
              autoComplete="off"
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Saisir la clé API du provider"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
            <p className="text-[10px] text-slate-400">
              Chiffrée au repos côté serveur. Jamais renvoyée par l'API, jamais journalisée.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchModels}
          disabled={!selectedProvider || loadingModels}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition-all"
        >
          {loadingModels ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span>Récupérer les modèles disponibles</span>
        </button>

        {models.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Modèles disponibles ({models.length})</label>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {models.map((m) => {
                const rejected = rejectedModels.includes(m.id);
                const selectable = m.compatible && !rejected;
                return (
                <button
                  key={m.id}
                  type="button"
                  disabled={!selectable}
                  onClick={() => setSelectedModel(m.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    selectedModel === m.id
                      ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200'
                      : rejected
                      ? 'bg-rose-50 border-rose-200 opacity-70 cursor-not-allowed'
                      : m.compatible
                      ? 'bg-white border-slate-200 hover:border-slate-300'
                      : 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 font-mono">{m.id}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(() => {
                        const key = rejected ? 'UNAVAILABLE' : m.availability || (m.compatible ? 'COMPATIBLE' : 'UNSUPPORTED');
                        const badge = AVAILABILITY_BADGES[key];
                        return badge ? (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${badge.cls}`}>
                            {badge.label}
                          </span>
                        ) : null;
                      })()}
                      {selectedModel === m.id && <CheckCircle className="w-4 h-4 text-emerald-600" />}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-slate-500">
                    {m.contextWindow && <span>Contexte : {m.contextWindow.toLocaleString('fr-FR')} tokens</span>}
                    {Object.entries(m.capabilities)
                      .filter(([, v]) => v)
                      .map(([k]) => (
                        <span key={k}>{CAPABILITY_LABELS[k] || k}</span>
                      ))}
                  </div>
                  {rejected && (
                    <p className="text-[10px] text-rose-600 font-semibold mt-1">
                      Refusé par le fournisseur pour ce compte - indisponible malgré son apparition dans la liste.
                    </p>
                  )}
                  {!rejected && !m.compatible && (
                    <p className="text-[10px] text-rose-600 font-semibold mt-1">
                      {m.incompatibilityReason || 'Ce modèle n’est pas compatible avec toutes les capacités XFactory AI.'}
                    </p>
                  )}
                </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400">
              La liste provient du fournisseur. Un modèle peut y figurer sans être accessible à votre compte - ce
              n'est détectable qu'à l'activation, qui effectue un appel de test réel.
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-[11px] text-rose-900 space-y-1.5 min-w-0 flex-1">
              <p className="font-bold">{error.title}</p>
              <p>{error.message}</p>
              {error.unchangedNotice && <p className="font-semibold">{error.unchangedNotice}</p>}

              {!!error.suggestions?.length && (
                <p>
                  Modèles compatibles suggérés :{' '}
                  <span className="font-mono font-bold">{error.suggestions.join(', ')}</span>
                </p>
              )}

              {/* The vendor's raw text is kept but collapsed: useful for debugging, useless as a
                  primary message, and never the thing an admin should have to read first. */}
              {error.technicalDetail && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowTechnicalDetail((v) => !v)}
                    className="text-[10px] font-bold underline text-rose-700 hover:text-rose-900"
                  >
                    {showTechnicalDetail ? 'Masquer' : 'Afficher'} le détail technique
                  </button>
                  {showTechnicalDetail && (
                    <pre className="mt-1 p-2 rounded-lg bg-rose-100/70 text-[10px] text-rose-900 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                      {error.technicalDetail}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-emerald-900">{success}</p>
          </div>
        )}

        {isTested && !confirming && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-emerald-900">
              <strong>Configuration validée.</strong> {selectedProvider} / {selectedModel} - la clé, la disponibilité
              du modèle et une génération de test ont réussi. Vous pouvez l'activer pour toute la plateforme.
            </p>
          </div>
        )}

        {!confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Test first: nothing is written and the active configuration is untouched. */}
            <button
              type="button"
              onClick={runTest}
              disabled={!canTest}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition-all"
            >
              {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>{testing ? 'Test en cours...' : 'Tester la configuration'}</span>
            </button>

            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!canActivate}
              title={!isTested ? 'Testez la configuration avant de l’activer' : undefined}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#008751] hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-md transition-all"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Activer globalement</span>
            </button>
          </div>
        ) : (
          // Explicit confirmation: this replaces the model used by the entire platform.
          <div className="p-4 rounded-xl bg-slate-900 text-white space-y-3">
            <p className="text-xs font-bold">Confirmer le changement de configuration IA globale</p>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Vous êtes sur le point de changer la configuration IA globale. Cela changera le modèle utilisé par
              l'ensemble de la plateforme XFactory. La configuration actuelle ne sera remplacée que si les
              identifiants sont validés avec succès.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={activate}
                disabled={activating}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl"
              >
                {activating ? 'Validation...' : 'Confirmer et activer'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-4 py-2 text-slate-300 hover:text-white font-bold text-xs"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2 mb-2">
            <History className="w-3.5 h-3.5 text-slate-400" />
            <p className="text-xs font-bold text-slate-700">Historique de configuration</p>
          </div>
          <div className="space-y-1">
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] text-slate-600 py-1 border-b border-slate-50 last:border-0">
                <span className="font-mono">
                  {h.provider} / {h.model}
                </span>
                <span className="text-slate-400">
                  {h.configuredBy || 'système'} · {new Date(h.createdAt).toLocaleString('fr-FR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
