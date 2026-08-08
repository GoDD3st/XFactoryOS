import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole } from '@/frontend/src/types';
import { apiFetchUsers, apiCreateUser, apiSetUserStatus, apiUpdateUser, apiResetUserPassword } from '@/services/api/userApi';
import { Search, UserPlus, X, Power, KeyRound, Pencil, RefreshCw, Filter } from 'lucide-react';

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
            Le mot de passe est régénéré et haché par Supabase Auth (bcrypt) — il n'est jamais stocké en clair et n'est affiché qu'une seule fois ici.
          </p>
        </div>
      </div>
    </div>
  );
};

export const UsersAdminView: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [showCreate, setShowCreate] = useState(false);
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
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Gestion des Comptes & Utilisateurs Supabase</h2>
          <p className="text-xs text-slate-500 mt-0.5">Données chargées en temps réel depuis la table `users` de Supabase</p>
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
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#008751] hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-amber-300" />
            <span>Nouvel Utilisateur</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-3 rounded-xl bg-red-50 text-red-800 border border-red-200 text-xs">{actionError}</div>
      )}

      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-xs text-slate-400">Chargement des utilisateurs depuis Supabase...</div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                <th className="py-2.5 px-3">Nom Complet</th>
                <th className="py-2.5 px-3">Email OCP</th>
                <th className="py-2.5 px-3">Département</th>
                <th className="py-2.5 px-3">Rôle</th>
                <th className="py-2.5 px-3">Statut</th>
                <th className="py-2.5 px-3 text-right">Action</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={loadUsers} />
      )}
      {editingUser && (
        <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSaved={loadUsers} />
      )}
    </div>
  );
};
