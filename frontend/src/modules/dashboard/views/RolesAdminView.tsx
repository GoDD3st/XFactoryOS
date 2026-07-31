import React from 'react';
import { Shield, Check, X, Lock } from 'lucide-react';

export const RolesAdminView: React.FC = () => {
  const rbacData = [
    { feature: "Dashboard exécutif", roles: { super_admin: 'R', admin: 'R', building_manager: 'R', gci_manager: 'R', receptionist: 'X', executive_assistant: 'R', director: 'R', collaborator: 'X', visitor: 'X', it_admin: 'R', security_guard: 'X' } },
    { feature: "Réserver poste standard", roles: { super_admin: 'C', admin: 'C', building_manager: 'C', gci_manager: 'C', receptionist: 'C', executive_assistant: 'C', director: 'C', collaborator: 'C', visitor: 'X', it_admin: 'C', security_guard: 'X' } },
    { feature: "Modifier sa réservation", roles: { super_admin: 'U', admin: 'U', building_manager: 'U', gci_manager: 'U', receptionist: 'U', executive_assistant: 'U', director: 'U', collaborator: 'U', visitor: 'X', it_admin: 'U', security_guard: 'X' } },
    { feature: "Modifier réservation d'autrui", roles: { super_admin: 'U', admin: 'U', building_manager: 'U', gci_manager: 'U', receptionist: 'U', executive_assistant: 'X', director: 'X', collaborator: 'X', visitor: 'X', it_admin: 'X', security_guard: 'X' } },
    { feature: "Approuver longue durée", roles: { super_admin: 'A', admin: 'A', building_manager: 'X', gci_manager: 'X', receptionist: 'X', executive_assistant: 'A', director: 'A', collaborator: 'X', visitor: 'X', it_admin: 'X', security_guard: 'X' } },
    { feature: "Autoriser cluster management", roles: { super_admin: 'A', admin: 'A', building_manager: 'A', gci_manager: 'A', receptionist: 'X', executive_assistant: 'X', director: 'X', collaborator: 'X', visitor: 'X', it_admin: 'X', security_guard: 'X' } },
    { feature: "Gérer postes", roles: { super_admin: 'CRUD', admin: 'CRUD', building_manager: 'RU', gci_manager: 'RU', receptionist: 'R', executive_assistant: 'R', director: 'R', collaborator: 'R', visitor: 'X', it_admin: 'R', security_guard: 'R' } },
    { feature: "Gérer clusters", roles: { super_admin: 'CRUD', admin: 'CRUD', building_manager: 'RU', gci_manager: 'RU', receptionist: 'R', executive_assistant: 'R', director: 'R', collaborator: 'R', visitor: 'X', it_admin: 'R', security_guard: 'R' } },
    { feature: "Gérer utilisateurs", roles: { super_admin: 'CRUD', admin: 'CRUD', building_manager: 'R', gci_manager: 'R', receptionist: 'X', executive_assistant: 'X', director: 'X', collaborator: 'X', visitor: 'X', it_admin: 'R', security_guard: 'X' } },
    { feature: "Gérer rôles & RBAC", roles: { super_admin: 'CRUD', admin: 'R', building_manager: 'X', gci_manager: 'X', receptionist: 'X', executive_assistant: 'X', director: 'X', collaborator: 'X', visitor: 'X', it_admin: 'R', security_guard: 'X' } },
    { feature: "Paramètres réservation", roles: { super_admin: 'CRUD', admin: 'CRUD', building_manager: 'R', gci_manager: 'R', receptionist: 'X', executive_assistant: 'X', director: 'X', collaborator: 'X', visitor: 'X', it_admin: 'R', security_guard: 'X' } },
    { feature: "Audit logs", roles: { super_admin: 'R', admin: 'R', building_manager: 'R', gci_manager: 'R', receptionist: 'X', executive_assistant: 'X', director: 'R', collaborator: 'X', visitor: 'X', it_admin: 'R', security_guard: 'R' } },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Matrice des Rôles & Permissions RBAC</h2>
          <p className="text-xs text-slate-500 mt-0.5">Conforme à la matrice de gouvernance officielle SRS Section 13 (11 Rôles)</p>
        </div>
        <span className="px-3 py-1 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-full border border-indigo-200">
          RBAC Strict Active
        </span>
      </div>

      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-left text-[11px] border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[9px]">
              <th className="py-2.5 px-2 bg-slate-50">Fonction / Domaine</th>
              <th className="py-2.5 px-2 text-center">Super Admin</th>
              <th className="py-2.5 px-2 text-center">Admin</th>
              <th className="py-2.5 px-2 text-center">Bldg Mgr</th>
              <th className="py-2.5 px-2 text-center">GCI Mgr</th>
              <th className="py-2.5 px-2 text-center">Récept.</th>
              <th className="py-2.5 px-2 text-center">Exec. Assist</th>
              <th className="py-2.5 px-2 text-center">Directeur</th>
              <th className="py-2.5 px-2 text-center">Collab.</th>
              <th className="py-2.5 px-2 text-center">IT Admin</th>
              <th className="py-2.5 px-2 text-center">Sécurité</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rbacData.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-2.5 px-2 font-bold text-slate-800 bg-slate-50/50">{row.feature}</td>
                {Object.entries(row.roles)
                  .filter(([key]) => key !== 'visitor')
                  .map(([role, val], rIdx) => (
                    <td key={rIdx} className="py-2.5 px-2 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-mono text-[9px] font-bold ${
                          val === 'X'
                            ? 'bg-slate-100 text-slate-400'
                            : val.includes('CRUD') || val === 'A'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-indigo-50 text-indigo-700'
                        }`}
                      >
                        {val}
                      </span>
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
