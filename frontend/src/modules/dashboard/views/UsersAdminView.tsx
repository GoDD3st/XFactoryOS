import React, { useState } from 'react';
import { UserProfile, UserRole } from '@/frontend/src/types';
import { Users, UserPlus, Shield, Search } from 'lucide-react';

const INITIAL_USERS: UserProfile[] = [
  { id: 'usr-1', email: 'y.elamrani@ocpgroup.ma', full_name: 'Youssef El Amrani', department: 'Digital Factory', role: 'collaborator', status: 'active' },
  { id: 'usr-2', email: 'f.benali@ocpgroup.ma', full_name: 'Fatima-Zahra Benali', department: 'GCI Governance', role: 'gci_manager', status: 'active' },
  { id: 'usr-3', email: 'k.mansouri@ocpgroup.ma', full_name: 'Karim Mansouri', department: 'Facility Management', role: 'building_manager', status: 'active' },
  { id: 'usr-4', email: 'a.tazi@ocpgroup.ma', full_name: 'Amina Tazi', department: 'Security & Access', role: 'security_guard', status: 'active' },
  { id: 'usr-5', email: 'director.safi@ocpgroup.ma', full_name: 'Directeur Site Safi', department: 'Direction Générale', role: 'director', status: 'active' },
];

export const UsersAdminView: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>(INITIAL_USERS);
  const [search, setSearch] = useState('');

  const filtered = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.department.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Gestion des Comptes & Utilisateurs</h2>
          <p className="text-xs text-slate-500 mt-0.5">Administration des profils, départements et statuts des collaborateurs Safi</p>
        </div>

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
      </div>

      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
              <th className="py-2.5 px-3">Nom Complet</th>
              <th className="py-2.5 px-3">Email OCP</th>
              <th className="py-2.5 px-3">Département</th>
              <th className="py-2.5 px-3">Rôle</th>
              <th className="py-2.5 px-3">Statut</th>
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
                  <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-emerald-100 text-emerald-800">
                    {u.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
