import React, { useState } from 'react';
import {
  UserRole,
  RoleConfig
} from '../../types';
import { useAuth, ROLE_CONFIGS } from '../../modules/auth/context/AuthContext';
import { EndUserDashboard } from '../../modules/dashboard/components/EndUserDashboard';
import { ReceptionView } from '../../modules/dashboard/views/ReceptionView';
import { BuildingView } from '../../modules/dashboard/views/BuildingView';
import { GCIView } from '../../modules/dashboard/views/GCIView';
import { ApprovalsView } from '../../modules/dashboard/views/ApprovalsView';
import { DirectionView } from '../../modules/dashboard/views/DirectionView';
import { AdminView } from '../../modules/dashboard/views/AdminView';
import { SuperAdminView } from '../../modules/dashboard/views/SuperAdminView';
import { ITAdminView } from '../../modules/dashboard/views/ITAdminView';
import { SecurityView } from '../../modules/dashboard/views/SecurityView';

// New SRS Section 28 views
import { ExecutiveDashboard } from '../../modules/dashboard/views/ExecutiveDashboard';
import { MyReservationsView } from '../../modules/dashboard/views/MyReservationsView';
import { CalendarView } from '../../modules/dashboard/views/CalendarView';
import { WaitingListView } from '../../modules/dashboard/views/WaitingListView';
import { WorkstationsAdminView } from '../../modules/dashboard/views/WorkstationsAdminView';
import { ClustersAdminView } from '../../modules/dashboard/views/ClustersAdminView';
import { UsersAdminView } from '../../modules/dashboard/views/UsersAdminView';
import { RolesAdminView } from '../../modules/dashboard/views/RolesAdminView';
import { SettingsView } from '../../modules/dashboard/views/SettingsView';
import { AuditLogsView } from '../../modules/dashboard/views/AuditLogsView';
import { AIAssistantDrawer } from '../../modules/dashboard/components/AIAssistantDrawer';

import {
  Layers,
  ChevronDown,
  Bell,
  Sparkles,
  User,
  Shield,
  Building,
  CheckCircle2,
  ExternalLink,
  Bot,
  Calendar,
  Clock,
  BarChart3,
  Settings,
  ShieldCheck,
  FileText,
  Search,
  Users,
  Lock,
  Wrench,
  ListOrdered,
  History
} from 'lucide-react';

// RBAC Tab definitions per role (SRS Section 13 Matrix)
type TabKey = 'home' | 'digital-twin' | 'reservations' | 'calendar' | 'waiting-list' | 'dashboard-exec' | 'workstations' | 'clusters' | 'users' | 'roles' | 'settings' | 'audit' | 'approvals';

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
}

const ROLE_TABS: Record<UserRole, TabDef[]> = {
  collaborator: [
    { key: 'home', label: 'Digital Twin', icon: <Layers className="w-3.5 h-3.5" /> },
    { key: 'reservations', label: 'Mes Réservations', icon: <Calendar className="w-3.5 h-3.5" /> },
    { key: 'calendar', label: 'Calendrier', icon: <Clock className="w-3.5 h-3.5" /> },
    { key: 'waiting-list', label: 'Liste d\'Attente', icon: <ListOrdered className="w-3.5 h-3.5" /> },
  ],
  receptionist: [
    { key: 'home', label: 'Réception', icon: <Layers className="w-3.5 h-3.5" /> },
    { key: 'reservations', label: 'Réservations', icon: <Calendar className="w-3.5 h-3.5" /> },
    { key: 'calendar', label: 'Calendrier', icon: <Clock className="w-3.5 h-3.5" /> },
    { key: 'waiting-list', label: 'Liste d\'Attente', icon: <ListOrdered className="w-3.5 h-3.5" /> },
  ],
  building_manager: [
    { key: 'home', label: 'Bâtiment', icon: <Building className="w-3.5 h-3.5" /> },
    { key: 'dashboard-exec', label: 'Dashboard', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: 'workstations', label: 'Postes', icon: <Wrench className="w-3.5 h-3.5" /> },
    { key: 'clusters', label: 'Clusters', icon: <Layers className="w-3.5 h-3.5" /> },
    { key: 'audit', label: 'Audit', icon: <FileText className="w-3.5 h-3.5" /> },
  ],
  gci_manager: [
    { key: 'home', label: 'GCI', icon: <Shield className="w-3.5 h-3.5" /> },
    { key: 'dashboard-exec', label: 'Dashboard', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: 'clusters', label: 'Clusters', icon: <Layers className="w-3.5 h-3.5" /> },
    { key: 'workstations', label: 'Postes', icon: <Wrench className="w-3.5 h-3.5" /> },
    { key: 'audit', label: 'Audit', icon: <FileText className="w-3.5 h-3.5" /> },
  ],
  executive_assistant: [
    { key: 'home', label: 'Approbations', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    { key: 'dashboard-exec', label: 'Dashboard', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: 'reservations', label: 'Réservations', icon: <Calendar className="w-3.5 h-3.5" /> },
    { key: 'approvals', label: 'Longue Durée', icon: <Clock className="w-3.5 h-3.5" /> },
  ],
  director: [
    { key: 'home', label: 'Direction', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { key: 'dashboard-exec', label: 'Dashboard', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: 'approvals', label: 'Approbations', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    { key: 'audit', label: 'Audit', icon: <FileText className="w-3.5 h-3.5" /> },
  ],
  admin: [
    { key: 'home', label: 'Admin', icon: <Settings className="w-3.5 h-3.5" /> },
    { key: 'dashboard-exec', label: 'Dashboard', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: 'workstations', label: 'Postes', icon: <Wrench className="w-3.5 h-3.5" /> },
    { key: 'clusters', label: 'Clusters', icon: <Layers className="w-3.5 h-3.5" /> },
    { key: 'users', label: 'Utilisateurs', icon: <Users className="w-3.5 h-3.5" /> },
    { key: 'settings', label: 'Paramètres', icon: <Settings className="w-3.5 h-3.5" /> },
    { key: 'audit', label: 'Audit', icon: <FileText className="w-3.5 h-3.5" /> },
  ],
  super_admin: [
    { key: 'home', label: 'Console', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    { key: 'dashboard-exec', label: 'Dashboard', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: 'workstations', label: 'Postes', icon: <Wrench className="w-3.5 h-3.5" /> },
    { key: 'clusters', label: 'Clusters', icon: <Layers className="w-3.5 h-3.5" /> },
    { key: 'users', label: 'Utilisateurs', icon: <Users className="w-3.5 h-3.5" /> },
    { key: 'roles', label: 'RBAC', icon: <Lock className="w-3.5 h-3.5" /> },
    { key: 'settings', label: 'Paramètres', icon: <Settings className="w-3.5 h-3.5" /> },
    { key: 'audit', label: 'Audit', icon: <FileText className="w-3.5 h-3.5" /> },
  ],
  it_admin: [
    { key: 'home', label: 'IT Admin', icon: <Wrench className="w-3.5 h-3.5" /> },
    { key: 'dashboard-exec', label: 'Dashboard', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: 'workstations', label: 'Postes', icon: <Wrench className="w-3.5 h-3.5" /> },
    { key: 'users', label: 'Utilisateurs', icon: <Users className="w-3.5 h-3.5" /> },
    { key: 'audit', label: 'Audit', icon: <FileText className="w-3.5 h-3.5" /> },
  ],
  security_guard: [
    { key: 'home', label: 'Sécurité', icon: <Shield className="w-3.5 h-3.5" /> },
    { key: 'audit', label: 'Audit', icon: <FileText className="w-3.5 h-3.5" /> },
  ],
};

export const RoleShell: React.FC = () => {
  const { currentRole, currentUser, roleConfig, switchRole, canView8Postes, isDemoMode, signOut } = useAuth();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('home');

  // Reset tab when role changes
  React.useEffect(() => {
    setActiveTab('home');
  }, [currentRole]);

  const renderHomeView = () => {
    switch (currentRole) {
      case 'collaborator':
        return <EndUserDashboard />;
      case 'receptionist':
        return <ReceptionView />;
      case 'building_manager':
        return <BuildingView />;
      case 'gci_manager':
        return <GCIView />;
      case 'executive_assistant':
        return <ApprovalsView />;
      case 'director':
        return <DirectionView />;
      case 'admin':
        return <AdminView />;
      case 'super_admin':
        return <SuperAdminView />;
      case 'it_admin':
        return <ITAdminView />;
      case 'security_guard':
        return <SecurityView />;
      default:
        return <EndUserDashboard />;
    }
  };

  const renderActiveView = () => {
    switch (activeTab) {
      case 'home':
        return renderHomeView();
      case 'dashboard-exec':
        return <ExecutiveDashboard />;
      case 'reservations':
        return <MyReservationsView />;
      case 'calendar':
        return <CalendarView />;
      case 'waiting-list':
        return <WaitingListView />;
      case 'workstations':
        return <WorkstationsAdminView />;
      case 'clusters':
        return <ClustersAdminView />;
      case 'users':
        return <UsersAdminView />;
      case 'roles':
        return <RolesAdminView />;
      case 'settings':
        return <SettingsView />;
      case 'audit':
        return <AuditLogsView />;
      case 'approvals':
        return <ApprovalsView />;
      default:
        return renderHomeView();
    }
  };

  const tabs = ROLE_TABS[currentRole] || ROLE_TABS.collaborator;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased">
      {/* Top Enterprise Header Bar - Professional Polish Design Theme */}
      <header className="sticky top-0 z-40 h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 shrink-0 shadow-sm">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-4">
          
          {/* OCP SA Logo & App Title */}
          <div className="flex items-center space-x-3 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-[#008751] flex items-center justify-center font-black text-white text-base shadow-sm ring-1 ring-amber-400/40">
              <span className="text-amber-300 font-extrabold text-sm tracking-tighter">OCP</span>
            </div>
            <div className="flex items-center space-x-3">
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-lg font-black tracking-tight uppercase text-slate-800 underline underline-offset-4 decoration-[#008751]">
                    XFactory OS
                  </h1>
                  <span className="px-1.5 py-0.2 text-[9px] font-black bg-amber-100 text-amber-800 rounded border border-amber-300 uppercase">
                    GROUPE OCP
                  </span>
                </div>
              </div>
              <div className="hidden sm:block h-4 w-[1px] bg-slate-300" />
              <span className="hidden sm:inline-block text-xs font-bold text-slate-500 uppercase tracking-widest">
                OCP SA • Safi Site
              </span>
            </div>
          </div>

          {/* Center / Right: QA Testing 10-Role Switcher (demo mode only) */}
          <div className="flex items-center space-x-3">
            {isDemoMode ? (
              <div className="relative group">
              <div className="flex items-center bg-slate-100 hover:bg-slate-200/80 rounded-full px-3.5 py-1.5 gap-2 border border-slate-200 transition-all cursor-pointer text-slate-700">
                <Shield className="w-4 h-4 text-emerald-600" />
                <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700">
                  <span className="text-[10px] font-bold text-slate-400 uppercase hidden md:inline">Role Switcher:</span>
                  <span className="font-bold text-slate-800">{roleConfig.label}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${roleConfig.badgeColor}`}>
                    {roleConfig.route}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>

              {/* Dropdown Menu for instant role switching */}
              <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 hidden group-hover:block z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-2 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Sélectionner un profil de test (QA 10 Vues)
                </div>

                <div className="py-1 max-h-80 overflow-y-auto space-y-1">
                  {(Object.keys(ROLE_CONFIGS) as UserRole[]).map((roleKey) => {
                    const cfg = ROLE_CONFIGS[roleKey];
                    const isSelected = currentRole === roleKey;

                    return (
                      <button
                        key={roleKey}
                        onClick={() => switchRole(roleKey)}
                        className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-start justify-between ${
                          isSelected
                            ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold shadow-xs'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold">{cfg.label}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${cfg.badgeColor}`}>
                              {cfg.route}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 font-normal mt-0.5 line-clamp-1">
                            {cfg.description}
                          </p>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-100 rounded-full px-3.5 py-1.5 gap-2 border border-slate-200 text-slate-700">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${roleConfig.badgeColor}`}>
                    {roleConfig.label}
                  </span>
                </div>
                <button
                  onClick={() => signOut()}
                  className="text-[10px] font-bold text-slate-400 hover:text-red-600 uppercase tracking-wide px-2 py-1.5 rounded-lg hover:bg-red-50 transition-all"
                  title="Se déconnecter"
                >
                  Déconnexion
                </button>
              </div>
            )}

            {/* AI Assistant Button */}
            <button
              onClick={() => setIsAIOpen(true)}
              className="p-2 rounded-xl bg-[#008751] hover:bg-emerald-600 text-white transition-colors shadow-sm"
              title="XFactory AI Assistant"
            >
              <Bot className="w-4 h-4 text-amber-300" />
            </button>

            {/* Notifications Button */}
            <div className="relative">
              <button
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 transition-colors relative"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" />
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 z-50 text-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-bold text-slate-800">Notifications Système</span>
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-bold border border-emerald-200">OCP Safi</span>
                  </div>

                  <div className="space-y-2 text-slate-600">
                    <div className="p-2 bg-slate-50 rounded-xl border border-slate-200">
                      <p className="font-semibold text-slate-900">Digital Twin Synchronisé</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">56 postes actifs sur les 7 clusters OCP.</p>
                    </div>

                    <div className="p-2 bg-slate-50 rounded-xl border border-slate-200">
                      <p className="font-semibold text-slate-900">Supabase PostgreSQL</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Base connectée avec fallback local hybride.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Capsule */}
            <div className="hidden sm:flex items-center space-x-2.5 border-l pl-4 border-slate-200">
              <div className="text-right text-xs">
                <div className="font-bold text-slate-800 leading-none">{currentUser.full_name}</div>
                <div className="text-[10px] text-slate-400 leading-none mt-1">{currentUser.department}</div>
              </div>
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                {currentUser.full_name.charAt(0)}
              </div>
            </div>

          </div>
        </div>
      </header>

      {/* Tab Navigation Bar (SRS Section 28 - RBAC-filtered per role) */}
      <nav className="bg-white border-b border-slate-200 px-4 sm:px-6 shrink-0">
        <div className="max-w-7xl mx-auto w-full flex items-center space-x-1 overflow-x-auto py-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                activeTab === tab.key
                  ? 'bg-[#008751]/10 text-[#008751] font-bold border border-[#008751]/20'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Main Role View Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {renderActiveView()}
      </main>

      {/* Professional Polish Footer Status Bar - OCP SA Branded */}
      <footer className="h-8 bg-[#005A36] text-white flex items-center justify-between px-6 shrink-0 text-[10px]">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="font-bold uppercase tracking-wider text-amber-100">GROUPE OCP SA - Safi Site</span>
          </div>
          <div className="hidden sm:flex items-center gap-2 border-l border-emerald-700 pl-4">
            <span className="w-2 h-2 rounded-full bg-emerald-300" />
            <span className="font-medium uppercase tracking-wider text-emerald-100">PostgreSQL DB: Connected</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-emerald-200 font-mono tracking-widest hidden md:inline">SITE CODE: OCP-SFI-XFACTORY</span>
          <span className="bg-[#004227] text-amber-300 px-2 py-0.5 rounded font-bold uppercase tracking-tighter border border-amber-400/30">v4.0.1 OCP Enterprise</span>
        </div>
      </footer>

      {/* AI Assistant Drawer (SRS 28.14) */}
      <AIAssistantDrawer isOpen={isAIOpen} onClose={() => setIsAIOpen(false)} userRole={currentRole} />
    </div>
  );
};
