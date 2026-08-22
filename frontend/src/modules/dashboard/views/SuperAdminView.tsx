import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Users,
  Lock,
  Wrench,
  AlertTriangle,
  Settings,
  BarChart3,
  UserX,
  History,
} from 'lucide-react';
import { DigitalTwin } from '../../../shared/components/DigitalTwin';
import { ReservationsTable } from '../../../shared/components/ReservationsTable';
import { SiteTelemetrySummary } from '@/services/telemetry/telemetryService';
import { apiFetchOccupancy } from '@/services/api/telemetryApi';
import { apiFetchUsers } from '@/services/api/userApi';
import { apiFetchRoles } from '@/services/api/rolesApi';
import { apiFetchAuditLogs } from '@/services/api/auditApi';
import { SettingsService } from '@/services/settings/settingsService';
import { UserProfile, RoleWithCount, AuditLogEntry, SystemSettings } from '@/frontend/src/types';
import { useAuth } from '../../auth/context/AuthContext';

export const SuperAdminView: React.FC = () => {
  const { currentUser } = useAuth();
  const [telemetry, setTelemetry] = useState<SiteTelemetrySummary | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<RoleWithCount[]>([]);
  const [roleChangesToday, setRoleChangesToday] = useState(0);
  const [settings, setSettings] = useState<SystemSettings>(SettingsService.getSettings() as SystemSettings);

  useEffect(() => {
    apiFetchOccupancy().then(setTelemetry);
    apiFetchUsers().then(setUsers);
    apiFetchRoles().then(setRoles);
    apiFetchAuditLogs(true).then(({ data }) => {
      const today = new Date().toISOString().split('T')[0];
      const changesToday = data.filter((l: AuditLogEntry) => l.action === 'ROLE_CHANGE' && l.timestamp.startsWith(today));
      setRoleChangesToday(changesToday.length);
    });
    Promise.resolve(SettingsService.getSettings()).then((s) => setSettings(s as SystemSettings));
  }, []);

  const activeUsers = users.filter((u) => u.status === 'active').length;
  const disabledUsers = users.filter((u) => u.status !== 'active').length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-6 border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded bg-violet-500/20 text-violet-300 font-bold text-xs">
              Rôle : Super Administrator
            </span>
          </div>
          <h1 className="text-xl font-bold mt-2">
            Bienvenue {currentUser.full_name}
          </h1>
        </div>
      </div>

      {/* Governance KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Utilisateurs</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{users.length}</div>
          <p className="text-[11px] text-slate-500">{activeUsers} actifs</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Rôles</span>
            <Lock className="w-4 h-4 text-violet-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{roles.length}</div>
          <p className="text-[11px] text-slate-500">{roles.reduce((s, r) => s + r.user_count, 0)} assignations</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Postes Configurés</span>
            <Wrench className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{telemetry?.totalCapacity ?? ''}</div>
          <p className="text-[11px] text-slate-500">{telemetry?.clusters.length ?? 0} clusters</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Occupation Live</span>
            <BarChart3 className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{telemetry?.overallOccupancyRate ?? ''}%</div>
          <p className="text-[11px] text-slate-500">{telemetry?.activeOccupancy ?? 0} postes occupés/réservés</p>
        </div>
      </div>

      {/* Governance / Config Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <History className="w-4 h-4 text-violet-600" />
            <span>Activité RBAC & Sécurité</span>
          </h3>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="text-lg font-black text-slate-900">{roleChangesToday}</div>
              <div className="text-[10px] text-slate-400">Modifications RBAC aujourd'hui</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="text-lg font-black text-slate-900 flex items-center justify-center gap-1">
                <UserX className="w-3.5 h-3.5 text-rose-500" />
                {disabledUsers}
              </div>
              <div className="text-[10px] text-slate-400">Comptes désactivés</div>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-600" />
            <span>Paramètres en vigueur</span>
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="text-[10px] text-slate-400">Durée max sans approbation</div>
              <div className="font-bold text-slate-800">{settings.maxReservationDaysWithoutApproval} jours</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="text-[10px] text-slate-400">Délai No-Show</div>
              <div className="font-bold text-slate-800">{settings.noShowDelayMinutes} min</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="text-[10px] text-slate-400">Horaires</div>
              <div className="font-bold text-slate-800">{settings.workingHoursStart} - {settings.workingHoursEnd}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="text-[10px] text-slate-400">Week-end</div>
              <div className="font-bold text-slate-800">{settings.allowWeekendBooking ? 'Autorisé' : 'Bloqué'}</div>
            </div>
          </div>
        </div>
      </div>

      {telemetry && telemetry.clusters.some((c) => c.maintenanceDesks > 0) && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {telemetry.clusters.reduce((s, c) => s + c.maintenanceDesks, 0)} poste(s) en maintenance sur{' '}
            {telemetry.clusters.filter((c) => c.maintenanceDesks > 0).length} cluster(s).
          </span>
        </div>
      )}

      <DigitalTwin readOnly />
      <ReservationsTable />
    </div>
  );
};
