import React, { useEffect, useState } from 'react';
import {
  Shield,
  Check,
  X,
  Lock,
  Users,
  Plus,
  Trash2,
  Info,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { RoleWithCount, RolePermissionRow, PermissionCell } from '@/frontend/src/types';
import {
  apiFetchRoles,
  apiFetchPermissionsMatrix,
  apiCreateRole,
  apiUpdateRolePermission,
  apiDeleteRole,
} from '@/services/api/rolesApi';
import { useAuth } from '../../auth/context/AuthContext';

const DOMAIN_LABELS: Record<string, string> = {
  reservations: 'Réservations',
  gouvernance: 'Gouvernance',
  referentiels: 'Référentiels',
  administration: 'Administration',
  technique: 'Technique',
};

const FLAG_COLUMNS: { key: keyof Pick<PermissionCell, 'can_read' | 'can_create' | 'can_update' | 'can_delete' | 'can_approve'>; label: string }[] = [
  { key: 'can_read', label: 'R' },
  { key: 'can_create', label: 'C' },
  { key: 'can_update', label: 'U' },
  { key: 'can_delete', label: 'D' },
  { key: 'can_approve', label: 'A' },
];

const CreateRoleModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      await apiCreateRole(code.trim().toUpperCase(), name.trim(), description.trim());
      onCreated();
      onClose();
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
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <Plus className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Créer un rôle</h3>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Code (ex: FACILITY_LEAD)</label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Nom</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          {error && <div className="p-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-[11px]">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs"
          >
            {submitting ? 'Création…' : 'Créer le rôle'}
          </button>
        </form>
      </div>
    </div>
  );
};

const DeleteRoleModal: React.FC<{ role: RoleWithCount; onClose: () => void; onDeleted: () => void }> = ({
  role,
  onClose,
  onDeleted,
}) => {
  const [masterKey, setMasterKey] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      await apiDeleteRole(role.id, masterKey);
      onDeleted();
      onClose();
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
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Supprimer "{role.name}"</h3>
            <p className="text-[10px] text-slate-400">Action irréversible — clé de suppression requise</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            required
            autoFocus
            placeholder="Clé de suppression"
            value={masterKey}
            onChange={(e) => setMasterKey(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-rose-200"
          />
          {error && (
            <div className="p-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-[11px] flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs"
          >
            {submitting ? 'Suppression…' : 'Confirmer la suppression'}
          </button>
        </form>
      </div>
    </div>
  );
};

export const RolesAdminView: React.FC = () => {
  const { currentRole } = useAuth();
  const canEdit = currentRole === 'super_admin';

  const [roles, setRoles] = useState<RoleWithCount[]>([]);
  const [matrix, setMatrix] = useState<RolePermissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingRole, setDeletingRole] = useState<RoleWithCount | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pendingCellKey, setPendingCellKey] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [r, m] = await Promise.all([apiFetchRoles(), apiFetchPermissionsMatrix()]);
      setRoles(r);
      setMatrix(m);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const toggleFlag = async (roleId: string, cell: PermissionCell, flagKey: (typeof FLAG_COLUMNS)[number]['key']) => {
    if (!canEdit) return;
    const cellKey = `${roleId}-${cell.permission_id}-${flagKey}`;
    setPendingCellKey(cellKey);
    const nextValue = !cell[flagKey];
    try {
      await apiUpdateRolePermission(roleId, cell.permission_id, { [flagKey]: nextValue });
      setMatrix((prev) =>
        prev.map((row) =>
          row.role_id !== roleId
            ? row
            : {
                ...row,
                permissions: row.permissions.map((p) =>
                  p.permission_id !== cell.permission_id ? p : { ...p, [flagKey]: nextValue }
                ),
              }
        )
      );
      setActionMessage(`Permission "${cell.description || cell.permission_code}" mise à jour.`);
    } catch (err: any) {
      alert(err.message || 'Échec de la mise à jour.');
    } finally {
      setPendingCellKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Rôles & Permissions</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {roles.length} rôles · {roles.reduce((s, r) => s + r.user_count, 0)} utilisateurs assignés
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Créer un rôle</span>
          </button>
        )}
      </div>

      <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-[11px] flex items-start gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Cette politique est <strong>appliquée en temps réel</strong> : décocher une case retire immédiatement
          l'accès aux routes correspondantes, sans redémarrage. Chaque changement est journalisé dans l'Audit.
          <br />
          La lecture et la modification de « Gérer rôles &amp; permissions » pour le Super Administrateur ne peuvent
          pas être retirées — ce serait un verrouillage définitif de cet écran.
        </span>
      </div>

      {actionMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            {actionMessage}
          </span>
          <button onClick={() => setActionMessage(null)} className="text-emerald-700 hover:text-emerald-900 text-xs font-bold ml-3">
            Fermer
          </button>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-400">Chargement des rôles…</div>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => {
            const isExpanded = expandedRoleId === role.id;
            const roleMatrix = matrix.find((m) => m.role_id === role.id);
            const canDelete = canEdit && !role.is_critical && role.user_count === 0;

            return (
              <div key={role.id} className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedRoleId(isExpanded ? null : role.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${role.is_critical ? 'bg-amber-50 text-amber-700' : 'bg-indigo-50 text-indigo-600'}`}>
                      {role.is_critical ? <Lock className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-800">{role.name}</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{role.code}</span>
                        {role.is_critical && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">CRITIQUE</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">{role.description || 'Aucune description'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-xs font-bold text-slate-600">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {role.user_count}
                    </span>
                    {canDelete && (
                      <span
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingRole(role);
                        }}
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"
                        title="Supprimer ce rôle"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </span>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>

                {isExpanded && roleMatrix && (
                  <div className="border-t border-slate-100 p-4 overflow-x-auto">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[9px]">
                          <th className="py-2 px-2">Domaine</th>
                          <th className="py-2 px-2">Permission</th>
                          {FLAG_COLUMNS.map((f) => (
                            <th key={f.key} className="py-2 px-2 text-center">{f.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {roleMatrix.permissions.map((cell) => (
                          <tr key={cell.permission_id} className="hover:bg-slate-50/80">
                            <td className="py-2 px-2 text-slate-400 font-semibold">{DOMAIN_LABELS[cell.domain] || cell.domain}</td>
                            <td className="py-2 px-2 font-bold text-slate-800">{cell.description || cell.permission_code}</td>
                            {FLAG_COLUMNS.map((f) => {
                              const active = cell[f.key];
                              const cellKey = `${role.id}-${cell.permission_id}-${f.key}`;
                              const isPending = pendingCellKey === cellKey;
                              return (
                                <td key={f.key} className="py-2 px-2 text-center">
                                  <button
                                    disabled={!canEdit || isPending}
                                    onClick={() => toggleFlag(role.id, cell, f.key)}
                                    className={`w-6 h-6 rounded-lg inline-flex items-center justify-center transition-all ${
                                      active ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-300'
                                    } ${canEdit ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} ${isPending ? 'opacity-40' : ''}`}
                                  >
                                    {active ? <Check className="w-3.5 h-3.5" /> : <X className="w-3 h-3" />}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <CreateRoleModal onClose={() => setShowCreate(false)} onCreated={loadAll} />}
      {deletingRole && (
        <DeleteRoleModal role={deletingRole} onClose={() => setDeletingRole(null)} onDeleted={loadAll} />
      )}
    </div>
  );
};
