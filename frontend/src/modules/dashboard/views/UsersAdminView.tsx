import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole } from '@/frontend/src/types';
import {
  apiFetchUsers,
  apiCreateUser,
  apiSetUserStatus,
  apiUpdateUser,
  apiResetUserPassword,
  apiBulkImportUsers,
  ImportReport,
} from '@/services/api/userApi';
import { useAuth } from '../../auth/context/AuthContext';
import { Search, UserPlus, X, Power, KeyRound, Pencil, RefreshCw, Filter, Upload } from 'lucide-react';

// SRS §13 "Gérer utilisateurs": CRUD is Admin/Super Admin only — Building Manager, GCI Manager,
// and IT Admin have R (read-only), matching the server-side gate already enforced on
// POST/PATCH/reset-password in backend/routes/users.routes.ts (GET already allows all four).
const USER_MANAGEMENT_ROLES: UserRole[] = ['admin', 'super_admin'];

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'collaborator', label: 'Employee / Collaborator' },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'building_manager', label: 'Building Manager' },
  { value: 'gci_manager', label: 'GCI Manager' },
  { value: 'executive_assistant', label: 'Executive Assistant' },
  { value: 'director', label: 'Director' },
  { value: 'admin', label: 'Administrator' },
  { value: 'super_admin', label: 'Super Administrator' },
  { value: 'it_admin', label: 'IT Administrator' },
  { value: 'security_guard', label: 'Security' },
];

const CreateUserModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState<UserRole>('collaborator');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      const result = await apiCreateUser({ email, full_name: fullName, department, role });
      setCreated({ email, tempPassword: result.tempPassword });
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4 relative">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <UserPlus className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Nouvel Utilisateur</h3>
        </div>

        {created ? (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              Compte créé pour <strong>{created.email}</strong>. Communiquez ce mot de passe temporaire — il ne sera plus affiché.
            </div>
            <div className="p-3 rounded-xl bg-slate-900 text-emerald-300 font-mono text-sm text-center flex items-center justify-center gap-2">
              <KeyRound className="w-4 h-4" /> {created.tempPassword}
            </div>
            <button onClick={onClose} className="w-full px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs">
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Email (@ocpgroup.ma)</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom.nom@ocpgroup.ma"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Nom complet</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Département</label>
              <input
                type="text"
                required
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Rôle</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {error && <div className="p-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-[11px]">{error}</div>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full px-4 py-2.5 rounded-xl bg-[#008751] hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs"
            >
              {submitting ? 'Création…' : 'Créer le compte'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

const EditUserModal: React.FC<{ user: UserProfile; onClose: () => void; onSaved: () => void }> = ({ user, onClose, onSaved }) => {
  const [fullName, setFullName] = useState(user.full_name);
  const [department, setDepartment] = useState(user.department);
  const [role, setRole] = useState<UserRole>(user.role);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      await apiUpdateUser(user.id, { full_name: fullName, department, role });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    setError(undefined);
    setResetting(true);
    try {
      const result = await apiResetUserPassword(user.id);
      setNewPassword(result.tempPassword);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4 relative">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
            <Pencil className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Modifier Utilisateur</h3>
            <p className="text-[10px] text-slate-400 font-mono">{user.email}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Nom complet</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Département</label>
            <input
              type="text"
              required
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Rôle</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {error && <div className="p-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-[11px]">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-2.5 rounded-xl bg-[#008751] hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs"
          >
            {submitting ? 'Enregistrement…' : 'Enregistrer les modifications'}
          </button>
        </form>

        <div className="pt-3 border-t border-slate-100 space-y-2">
          <label className="text-xs font-bold text-slate-700 block">Mot de passe</label>
          {newPassword ? (
            <div className="p-3 rounded-xl bg-slate-900 text-emerald-300 font-mono text-sm text-center flex items-center justify-center gap-2">
              <KeyRound className="w-4 h-4" /> {newPassword}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={resetting}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold text-xs"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {resetting ? 'Génération…' : 'Réinitialiser le mot de passe'}
            </button>
          )}
          <p className="text-[10px] text-slate-400">
            Le mot de passe est régénéré et stocké sous forme hachée — il n'est jamais conservé en clair et n'est affiché qu'une seule fois ici.
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * SRS §28.10 / FR-11 — "import massif d'utilisateurs".
 *
 * Always previews before writing: the same payload is sent once with dryRun:true (validates the
 * file against itself and against existing accounts, persists nothing) and only then, on explicit
 * confirmation, with dryRun:false.
 */
const EXPECTED_HEADERS = ['email', 'full_name', 'department', 'role'];

const ROLE_ALIASES: Record<string, UserRole> = {
  ...Object.fromEntries(ROLE_OPTIONS.map((o) => [o.value, o.value])),
  employee: 'collaborator',
  collaborateur: 'collaborator',
  security: 'security_guard',
  receptionniste: 'receptionist',
  directeur: 'director',
  administrator: 'admin',
  administrateur: 'admin',
} as Record<string, UserRole>;

interface ParsedRow {
  email: string;
  full_name: string;
  department: string;
  role: UserRole;
}

/** Minimal CSV parse: handles quoted fields and , or ; separators. */
function parseCsv(text: string): { rows: ParsedRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], errors: ['Le fichier est vide.'] };

  const separator = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if (ch === separator && !inQuotes) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };

  const header = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const missing = EXPECTED_HEADERS.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [`Colonnes manquantes dans l'en-tête : ${missing.join(', ')}. Attendu : ${EXPECTED_HEADERS.join(', ')}.`],
    };
  }

  const idx = Object.fromEntries(EXPECTED_HEADERS.map((h) => [h, header.indexOf(h)]));
  const rows: ParsedRow[] = [];

  lines.slice(1).forEach((line, i) => {
    const cells = splitLine(line);
    const rawRole = (cells[idx.role] || '').toLowerCase().replace(/\s+/g, '_');
    const role = ROLE_ALIASES[rawRole];
    if (!role) {
      errors.push(`Ligne ${i + 1} : rôle inconnu « ${cells[idx.role] || ''} ».`);
      return;
    }
    rows.push({
      email: cells[idx.email] || '',
      full_name: cells[idx.full_name] || '',
      department: cells[idx.department] || '',
      role,
    });
  });

  return { rows, errors };
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  ready: { label: 'À créer', className: 'bg-sky-100 text-sky-700' },
  created: { label: 'Créé', className: 'bg-emerald-100 text-emerald-700' },
  duplicate: { label: 'Doublon', className: 'bg-amber-100 text-amber-700' },
  exists: { label: 'Existe déjà', className: 'bg-slate-200 text-slate-600' },
  failed: { label: 'Échec', className: 'bg-rose-100 text-rose-700' },
};

const BulkImportModal: React.FC<{ onClose: () => void; onImported: () => void }> = ({ onClose, onImported }) => {
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleText = (text: string) => {
    setRawText(text);
    setReport(null);
    setError(undefined);
    const { rows, errors } = parseCsv(text);
    setParsed(rows);
    setParseErrors(errors);
  };

  const handleFile = async (file: File) => {
    handleText(await file.text());
  };

  const runPreview = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setReport(await apiBulkImportUsers(parsed, true));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await apiBulkImportUsers(parsed, false);
      setReport(result);
      onImported();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const csv = 'email,full_name,department,role\njane.doe@ocpgroup.ma,Jane Doe,Digital Factory,collaborator\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele_import_utilisateurs.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const createdRows = report?.rows.filter((r) => r.status === 'created' && r.tempPassword) || [];

  const downloadCredentials = () => {
    const csv =
      'email,full_name,mot_de_passe_temporaire\n' +
      createdRows.map((r) => `${r.email},"${r.full_name}",${r.tempPassword}`).join('\n') +
      '\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mots_de_passe_temporaires.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const isDone = report && !report.dryRun;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl p-6 space-y-4 relative max-h-[90vh] overflow-y-auto">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>

        <div>
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#008751]" />
            Import massif d'utilisateurs
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Fichier CSV avec l'en-tête <code className="bg-slate-100 px-1 rounded">email, full_name, department, role</code>.
            Séparateur <code className="bg-slate-100 px-1 rounded">,</code> ou <code className="bg-slate-100 px-1 rounded">;</code>. Maximum 200 lignes.
          </p>
        </div>

        {!isDone && (
          <>
            <div className="flex items-center gap-2">
              <label className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer">
                Choisir un fichier CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </label>
              <button onClick={downloadTemplate} className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">
                Télécharger un modèle
              </button>
            </div>

            <textarea
              rows={6}
              value={rawText}
              onChange={(e) => handleText(e.target.value)}
              placeholder={'email,full_name,department,role\njane.doe@ocpgroup.ma,Jane Doe,Digital Factory,collaborator'}
              className="w-full p-3 text-xs font-mono rounded-xl border border-slate-300 bg-slate-50 focus:ring-2 focus:ring-[#008751] outline-none"
            />
          </>
        )}

        {parseErrors.length > 0 && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
            {parseErrors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}

        {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">{error}</div>}

        {parsed.length > 0 && !report && (
          <p className="text-xs text-slate-600 font-semibold">{parsed.length} ligne(s) prête(s) à être vérifiée(s).</p>
        )}

        {report && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 text-[11px] font-bold">
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">{report.total} ligne(s)</span>
              {report.dryRun ? (
                <span className="px-2.5 py-1 rounded-lg bg-sky-100 text-sky-700">{report.ready} à créer</span>
              ) : (
                <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700">{report.created} créé(s)</span>
              )}
              <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700">{report.skipped} ignoré(s)</span>
              {report.failed > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700">{report.failed} en échec</span>
              )}
              {report.dryRun && (
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white">Aperçu — rien n'a été enregistré</span>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="text-left text-slate-500 uppercase text-[10px]">
                    <th className="py-1.5 px-2">Ligne</th>
                    <th className="py-1.5 px-2">Email</th>
                    <th className="py-1.5 px-2">Nom</th>
                    <th className="py-1.5 px-2">Rôle</th>
                    <th className="py-1.5 px-2">Statut</th>
                    <th className="py-1.5 px-2">Détail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.rows.map((r) => {
                    const s = STATUS_STYLES[r.status] || STATUS_STYLES.ready;
                    return (
                      <tr key={r.line}>
                        <td className="py-1.5 px-2 text-slate-400">{r.line}</td>
                        <td className="py-1.5 px-2 font-semibold text-slate-800">{r.email}</td>
                        <td className="py-1.5 px-2 text-slate-600">{r.full_name}</td>
                        <td className="py-1.5 px-2 text-slate-500">{r.role}</td>
                        <td className="py-1.5 px-2">
                          <span className={`px-1.5 py-0.5 rounded font-bold ${s.className}`}>{s.label}</span>
                        </td>
                        <td className="py-1.5 px-2 text-slate-500">{r.message || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {createdRows.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] space-y-2">
                <p className="font-bold">
                  {createdRows.length} mot(s) de passe temporaire(s) généré(s) — affichés une seule fois.
                </p>
                <p>
                  Ils ne sont pas conservés en clair. Téléchargez-les maintenant si vous
                  devez les transmettre, puis supprimez le fichier après distribution.
                </p>
                <button
                  onClick={downloadCredentials}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold"
                >
                  Télécharger les mots de passe
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl">
            {isDone ? 'Fermer' : 'Annuler'}
          </button>
          {!isDone && !report && (
            <button
              onClick={runPreview}
              disabled={busy || parsed.length === 0}
              className="px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
            >
              {busy ? 'Vérification…' : 'Vérifier le fichier'}
            </button>
          )}
          {!isDone && report?.dryRun && (
            <button
              onClick={runImport}
              disabled={busy || report.ready === 0}
              className="px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md bg-[#008751] hover:bg-[#00703f] disabled:opacity-50"
            >
              {busy ? 'Import…' : `Importer ${report.ready} utilisateur(s)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const UsersAdminView: React.FC = () => {
  const { currentRole } = useAuth();
  const canManageUsers = USER_MANAGEMENT_ROLES.includes(currentRole);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [actionError, setActionError] = useState<string | undefined>();

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await apiFetchUsers();
      setUsers(data);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filtered = users.filter(
    (u) =>
      (!roleFilter || u.role === roleFilter) &&
      (u.full_name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.department.toLowerCase().includes(search.toLowerCase()))
  );

  const handleToggleStatus = async (u: UserProfile) => {
    setActionError(undefined);
    const nextStatus = u.status === 'active' ? 'inactive' : 'active';
    try {
      await apiSetUserStatus(u.id, nextStatus);
      loadUsers();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Gestion des Comptes Utilisateurs</h2>
          <p className="text-xs text-slate-500 mt-0.5">Annuaire des comptes du site</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher utilisateur..."
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#008751]"
            />
          </div>
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as UserRole | '')}
              className="bg-transparent py-2 text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="">Tous les rôles</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={loadUsers}
            title="Actualiser"
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {canManageUsers && (
            <>
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Importer</span>
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#008751] hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
              >
                <UserPlus className="w-4 h-4 text-amber-300" />
                <span>Nouvel Utilisateur</span>
              </button>
            </>
          )}
        </div>
      </div>

      {actionError && (
        <div className="p-3 rounded-xl bg-red-50 text-red-800 border border-red-200 text-xs">{actionError}</div>
      )}

      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-xs text-slate-400">Chargement des utilisateurs...</div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                <th className="py-2.5 px-3">Nom Complet</th>
                <th className="py-2.5 px-3">Email</th>
                <th className="py-2.5 px-3">Département</th>
                <th className="py-2.5 px-3">Rôle</th>
                <th className="py-2.5 px-3">Statut</th>
                {canManageUsers && <th className="py-2.5 px-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-3 font-bold text-slate-800">{u.full_name}</td>
                  <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">{u.email}</td>
                  <td className="py-3 px-3 text-slate-600">{u.department}</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-700 uppercase">
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${u.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'}`}>
                      {u.status}
                    </span>
                  </td>
                  {canManageUsers && (
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setEditingUser(u)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200"
                        >
                          <Pencil className="w-3 h-3" />
                          Modifier
                        </button>
                        <button
                          onClick={() => handleToggleStatus(u)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                            u.status === 'active'
                              ? 'bg-red-50 text-red-600 hover:bg-red-100'
                              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          <Power className="w-3 h-3" />
                          {u.status === 'active' ? 'Désactiver' : 'Activer'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateUserModal
          // onCreated fires the moment the account is created, while the modal is still showing
          // the temp-password screen — the admin can't see the table refresh at that point. If
          // that background fetch has any hiccup (network blip, timing), the table stayed stale
          // until a full page reload, even though the account was created correctly (verified:
          // it's the list not reliably re-fetching, not a backend/data issue). Refreshing again
          // on close guarantees the table is current at the exact moment the admin can see it.
          onClose={() => {
            setShowCreate(false);
            loadUsers();
          }}
          onCreated={loadUsers}
        />
      )}
      {showImport && (
        // Same rationale as CreateUserModal above: refresh on close as well as on import, so the
        // table is current at the moment the admin can actually see it.
        <BulkImportModal
          onClose={() => {
            setShowImport(false);
            loadUsers();
          }}
          onImported={loadUsers}
        />
      )}
      {editingUser && (
        <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSaved={loadUsers} />
      )}
    </div>
  );
};
