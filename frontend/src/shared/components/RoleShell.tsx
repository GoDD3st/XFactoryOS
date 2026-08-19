import React, { useState, useEffect } from 'react';
import {
  UserRole,
  RoleConfig,
  UserNotification,
  SystemSettings
} from '../../types';
import { apiFetchNotifications, apiMarkNotificationRead } from '@/services/api/notificationApi';
// Settings come from the service (API-backed), not the repository: importing a database
// repository into a browser component pulls the server-side data layer - and its Supabase admin
// client wiring - into the client bundle.
import { SettingsService } from '@/services/settings/settingsService';
import { useAuth, ROLE_CONFIGS } from '../../modules/auth/context/AuthContext';
import { EndUserDashboard } from '../../modules/dashboard/components/EndUserDashboard';
import { ReceptionView } from '../../modules/dashboard/views/ReceptionView';
import { BuildingView } from '../../modules/dashboard/views/BuildingView';
import { GCIView } from '../../modules/dashboard/views/GCIView';
import { ClusterAuthorizationsView } from '../../modules/dashboard/views/ClusterAuthorizationsView';
import { LateCheckInRequestsView } from '../../modules/dashboard/views/LateCheckInRequestsView';
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
import { NotificationsView } from '../../modules/dashboard/views/NotificationsView';
import { AIAssistantDrawer } from '../../modules/dashboard/components/AIAssistantDrawer';
import { ReservationRulesDrawer } from '../../modules/dashboard/components/ReservationRulesDrawer';
import { UserProfileDrawer } from '../../modules/dashboard/components/UserProfileDrawer';
import { ForcePasswordChange } from '../../modules/auth/components/ForcePasswordChange';
import { apiGetPasswordStatus } from '@/services/api/userApi';

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
  Scale,
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
  History,
  KeyRound, CalendarPlus
} from 'lucide-react';

// RBAC Tab definitions per role (SRS Section 13 Matrix)
type TabKey = 'home' | 'digital-twin' | 'reserve' | 'reservations' | 'calendar' | 'waiting-list' | 'dashboard-exec' | 'workstations' | 'clusters' | 'users' | 'roles' | 'settings' | 'audit' | 'approvals' | 'cluster-auth' | 'late-checkin' | 'notifications';

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
  // SRS §13 matrix, Receptionist column: C on "Réserver poste standard", U on both own and
  // others' reservations - and X on Dashboard exécutif, Analytics, Audit logs, Utilisateurs,
  // Rôles, Paramètres and Administration technique. Front-office only: today's arrivals,
  // check-in, and the seat map. The Audit tab was removed because the policy table gives this
  // role no audit_logs read, so the endpoint answered 403 and the tab was dead.
  receptionist: [
    { key: 'home', label: 'Réception', icon: <Layers className="w-3.5 h-3.5" /> },
    { key: 'reserve', label: 'Réserver', icon: <CalendarPlus className="w-3.5 h-3.5" /> },
    { key: 'reservations', label: 'Réservations', icon: <Calendar className="w-3.5 h-3.5" /> },
    { key: 'calendar', label: 'Calendrier', icon: <Clock className="w-3.5 h-3.5" /> },
    { key: 'waiting-list', label: 'Liste d\'Attente', icon: <ListOrdered className="w-3.5 h-3.5" /> },
  ],
  building_manager: [
    { key: 'home', label: 'Bâtiment', icon: <Building className="w-3.5 h-3.5" /> },
    { key: 'reserve', label: 'Réserver', icon: <CalendarPlus className="w-3.5 h-3.5" /> },
    { key: 'dashboard-exec', label: 'Dashboard', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: 'reservations', label: 'Mes Réservations', icon: <Calendar className="w-3.5 h-3.5" /> },
    { key: 'calendar', label: 'Calendrier', icon: <Clock className="w-3.5 h-3.5" /> },
    // BR-09 names Building Manager alongside GCI Manager as an authorizer of management clusters.
    { key: 'cluster-auth', label: 'Autorisations', icon: <KeyRound className="w-3.5 h-3.5" /> },
    { key: 'workstations', label: 'Postes', icon: <Wrench className="w-3.5 h-3.5" /> },
    { key: 'clusters', label: 'Clusters', icon: <Layers className="w-3.5 h-3.5" /> },
    { key: 'late-checkin', label: 'Check-in tardif', icon: <Clock className="w-3.5 h-3.5" /> },
    { key: 'users', label: 'Utilisateurs', icon: <Users className="w-3.5 h-3.5" /> },
    { key: 'audit', label: 'Audit', icon: <FileText className="w-3.5 h-3.5" /> },
  ],
  // SRS §13 matrix, GCI Manager column: R dashboard/analytics/audit, C+U reservations (incl.
  // others'), A on "Autoriser cluster management", RU postes/clusters, R users. Roles and
  // Administration technique are X - they must stay absent from this menu.
  gci_manager: [
    { key: 'home', label: 'GCI', icon: <Shield className="w-3.5 h-3.5" /> },
    { key: 'reserve', label: 'Réserver', icon: <CalendarPlus className="w-3.5 h-3.5" /> },
    { key: 'dashboard-exec', label: 'Dashboard', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: 'cluster-auth', label: 'Autorisations', icon: <KeyRound className="w-3.5 h-3.5" /> },
    { key: 'clusters', label: 'Clusters', icon: <Layers className="w-3.5 h-3.5" /> },
    { key: 'workstations', label: 'Postes', icon: <Wrench className="w-3.5 h-3.5" /> },
    { key: 'reservations', label: 'Réservations', icon: <Calendar className="w-3.5 h-3.5" /> },
    { key: 'calendar', label: 'Calendrier', icon: <Clock className="w-3.5 h-3.5" /> },
    { key: 'users', label: 'Utilisateurs', icon: <Users className="w-3.5 h-3.5" /> },
    { key: 'audit', label: 'Audit', icon: <FileText className="w-3.5 h-3.5" /> },
  ],
  // SRS §13 matrix, Executive Assistant column: A on "Approuver longue durée" (its whole
  // mandate), R on Dashboard exécutif and Analytics, C on "Réserver poste standard", U on its
  // OWN reservation only - and X on modifier réservation d'autrui, Autoriser cluster management,
  // Utilisateurs, Rôles, Paramètres, Audit logs and Administration technique.
  // The "Clusters VIP" tab was removed: that screen mutates clusters (VIP flag, members,
  // extension seats) and this role is read-only on the seat referential.
  executive_assistant: [
    { key: 'home', label: 'Approbations', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    { key: 'reserve', label: 'Réserver', icon: <CalendarPlus className="w-3.5 h-3.5" /> },
    { key: 'dashboard-exec', label: 'Dashboard', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: 'approvals', label: 'Longue Durée', icon: <Clock className="w-3.5 h-3.5" /> },
    { key: 'reservations', label: 'Mes Réservations', icon: <Calendar className="w-3.5 h-3.5" /> },
  ],
  // SRS §13 matrix, Director column: A on "Approuver longue durée", R on Dashboard exécutif,
  // C on "Réserver poste standard", U on its OWN reservation only - and X on modifier
  // réservation d'autrui, Autoriser cluster management, Utilisateurs, Rôles, Paramètres and
  // Administration technique. Functionally near-identical to Executive Assistant.
  // "Clusters VIP" removed: that screen mutates clusters and this role is read-only on the seat
  // referential. "Audit" removed on a deliberate override - see audit.routes.ts.
  director: [
    { key: 'home', label: 'Direction', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { key: 'reserve', label: 'Réserver', icon: <CalendarPlus className="w-3.5 h-3.5" /> },
    { key: 'dashboard-exec', label: 'Dashboard', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: 'approvals', label: 'Approbations', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    { key: 'reservations', label: 'Mes Réservations', icon: <Calendar className="w-3.5 h-3.5" /> },
  ],
  // SRS §13 matrix, Administrator column: CRUD postes/clusters/utilisateurs/paramètres,
  // C+U reservations (incl. others'), R roles/audit/analytics. "Administration technique" is X - 
  // it stays absent (that is IT Admin's mandate).
  admin: [
    { key: 'home', label: 'Admin', icon: <Settings className="w-3.5 h-3.5" /> },
    { key: 'reserve', label: 'Réserver', icon: <CalendarPlus className="w-3.5 h-3.5" /> },
    { key: 'dashboard-exec', label: 'Dashboard', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: 'workstations', label: 'Postes', icon: <Wrench className="w-3.5 h-3.5" /> },
    { key: 'clusters', label: 'Clusters', icon: <Layers className="w-3.5 h-3.5" /> },
    { key: 'users', label: 'Utilisateurs', icon: <Users className="w-3.5 h-3.5" /> },
    { key: 'reservations', label: 'Réservations', icon: <Calendar className="w-3.5 h-3.5" /> },
    { key: 'late-checkin', label: 'Check-in tardif', icon: <Clock className="w-3.5 h-3.5" /> },
    { key: 'calendar', label: 'Calendrier', icon: <Clock className="w-3.5 h-3.5" /> },
    { key: 'roles', label: 'Rôles', icon: <Lock className="w-3.5 h-3.5" /> },
    { key: 'settings', label: 'Paramètres', icon: <Settings className="w-3.5 h-3.5" /> },
    { key: 'audit', label: 'Audit', icon: <FileText className="w-3.5 h-3.5" /> },
  ],
  super_admin: [
    { key: 'home', label: 'Console', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    { key: 'reserve', label: 'Réserver', icon: <CalendarPlus className="w-3.5 h-3.5" /> },
    { key: 'dashboard-exec', label: 'Dashboard', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: 'reservations', label: 'Réservations', icon: <Calendar className="w-3.5 h-3.5" /> },
    { key: 'late-checkin', label: 'Check-in tardif', icon: <Clock className="w-3.5 h-3.5" /> },
    { key: 'workstations', label: 'Postes', icon: <Wrench className="w-3.5 h-3.5" /> },
    { key: 'clusters', label: 'Clusters', icon: <Layers className="w-3.5 h-3.5" /> },
    { key: 'users', label: 'Utilisateurs', icon: <Users className="w-3.5 h-3.5" /> },
    { key: 'roles', label: 'RBAC', icon: <Lock className="w-3.5 h-3.5" /> },
    { key: 'settings', label: 'Paramètres', icon: <Settings className="w-3.5 h-3.5" /> },
    { key: 'audit', label: 'Audit', icon: <FileText className="w-3.5 h-3.5" /> },
  ],
  // SRS §13 matrix, IT Admin column: CRUD on "Administration technique" (its whole mandate) and
  // R on everything else - postes, clusters, utilisateurs, rôles, paramètres, audit, analytics.
  // The "Postes" tab was removed because WorkstationsAdminView is a management screen whose write
  // actions 403 for this role (manage_workstations is R here), and "Dashboard" because the
  // executive KPI view is the business roles' surface, not technical operations.
  // "Utilisateurs" stays: UsersAdminView is genuinely read-only outside Admin/Super Admin, which
  // is exactly the R the matrix grants - useful for application support.
  it_admin: [
    { key: 'home', label: 'IT Admin', icon: <Wrench className="w-3.5 h-3.5" /> },
    { key: 'reserve', label: 'Réserver', icon: <CalendarPlus className="w-3.5 h-3.5" /> },
    { key: 'users', label: 'Utilisateurs', icon: <Users className="w-3.5 h-3.5" /> },
    { key: 'audit', label: 'Audit', icon: <FileText className="w-3.5 h-3.5" /> },
  ],
  // SRS §13 matrix, Security column: R on analytics/audit, and X on "Réserver poste standard" -
  // a guard supervises the floor, it does not occupy a desk on it. Confirmed as intended rather
  // than an oversight, so there is no "Réserver" tab here and reservations.routes.ts leaves the role
  // out of RESERVE_FALLBACK_ROLES; changing it means amending the SRS, not patching this list.
  security_guard: [
    { key: 'home', label: 'Sécurité', icon: <Shield className="w-3.5 h-3.5" /> },
    { key: 'audit', label: 'Audit', icon: <FileText className="w-3.5 h-3.5" /> },
  ],
};

export const RoleShell: React.FC = () => {
  const { currentRole, currentUser, roleConfig, switchRole, canView8Postes, isDemoMode, signOut, sessionIdleWarning, idleSecondsLeft, extendSession } = useAuth();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [siteLogo, setSiteLogo] = useState<string | null>(null);
  // Null while unknown: the gate must not flash on screen before the answer arrives.
  const [mustChangePassword, setMustChangePassword] = useState<boolean | null>(null);
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);

  // Mirrors the server-side role policy (services/ai/aiRolePolicy.ts). The backend is the control - 
  // /api/ai/ask 403s for these roles regardless - this only decides which button to render.
  const AI_DISABLED_ROLES: UserRole[] = ['collaborator', 'security_guard'];
  const canUseAssistant = !AI_DISABLED_ROLES.includes(currentRole);
  const roleMenuRef = React.useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [siteName, setSiteName] = useState<string>(
    (SettingsService.getSettings() as SystemSettings).siteName
  );

  // Reset tab when role changes
  React.useEffect(() => {
    setActiveTab('home');
  }, [currentRole]);

  // Close the role menu on an outside click or Escape - the usual expectations for a menu that
  // opens on click rather than hover. Listeners are only attached while it is open.
  useEffect(() => {
    if (!isRoleMenuOpen) return;

    const onPointerDown = (e: MouseEvent) => {
      if (roleMenuRef.current && !roleMenuRef.current.contains(e.target as Node)) {
        setIsRoleMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsRoleMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isRoleMenuOpen]);

  // Settings §28.12 "Nom du site"previously saved but never read anywhere in the UI, so
  // changing it had no visible effect at all. Now drives the header title and the browser tab.
  useEffect(() => {
    // Two-stage on purpose. SettingsService.getSettings() returns the localStorage cache
    // synchronously for a fast first paint, then refreshes that cache in the background - so a
    // newly added field (the logo) is absent from the cached copy on the first render and the
    // background refresh never notifies us. Paint from cache, then read the live value, exactly
    // as settingsService's own comment recommends for callers that need it fresh.
    const applyBranding = (s: SystemSettings) => {
      setSiteName(s.siteName);
      setSiteLogo(s.siteLogoDataUrl || null);
    };

    const refresh = () => {
      applyBranding(SettingsService.getSettings() as SystemSettings);
      Promise.resolve(SettingsService.getSettings()).then(applyBranding).catch(() => {});
    };

    refresh();
    window.addEventListener('xfactory_settings_changed', refresh);
    return () => window.removeEventListener('xfactory_settings_changed', refresh);
  }, []);

  // Forced password rotation. Asked once per mount; a failure resolves to "not required" inside
  // the API client rather than gating the whole platform on a status lookup.
  useEffect(() => {
    let cancelled = false;
    apiGetPasswordStatus()
      .then((s) => !cancelled && setMustChangePassword(s.mustChangePassword))
      .catch(() => !cancelled && setMustChangePassword(false));
    return () => {
      cancelled = true;
    };
  }, [currentUser.id]);

  useEffect(() => {
    if (siteName) document.title = siteName;
  }, [siteName]);

  const loadNotifications = () => {
    apiFetchNotifications().then(setNotifications).catch(() => {});
  };

  useEffect(() => {
    loadNotifications();
    window.addEventListener('xfactory_notifications_changed', loadNotifications);
    const interval = setInterval(loadNotifications, 60000);
    return () => {
      window.removeEventListener('xfactory_notifications_changed', loadNotifications);
      clearInterval(interval);
    };
  }, [currentUser.id]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleOpenNotifications = () => {
    setIsNotificationsOpen((open) => !open);
  };

  /**
   * Opens a notification on the dedicated screen and marks it read.
   *
   * The dropdown truncates the body, so clicking used to acknowledge a notification the user had
   * not actually been able to read. Navigating to the tab is what makes "opened" meaningful.
   */
  const handleOpenNotification = (n: UserNotification) => {
    if (!n.read) apiMarkNotificationRead(n.id).then(loadNotifications);
    setActiveTab('notifications');
    setIsNotificationsOpen(false);
  };

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
      case 'reserve':
        // Same two-path booking workspace the collaborator gets: Digital Twin first, form below.
        // Every role here is also a person who books a desk, so the surface is identical rather
        // than a reduced copy that would drift from it.
        return <EndUserDashboard />;
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
      case 'notifications':
        return <NotificationsView />;
      case 'audit':
        return <AuditLogsView />;
      case 'approvals':
        return <ApprovalsView />;
      case 'cluster-auth':
        return <ClusterAuthorizationsView />;
      case 'late-checkin':
        return <LateCheckInRequestsView />;
      default:
        return renderHomeView();
    }
  };

  const tabs = ROLE_TABS[currentRole] || ROLE_TABS.collaborator;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased">
      {/* FR-04 idle session expiration warning */}
      {sessionIdleWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Session inactive</h3>
              <p className="text-xs text-slate-500 mt-1">
                Vous allez être déconnecté dans <strong className="text-amber-700">{idleSecondsLeft}s</strong> pour cause d'inactivité.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={signOut}
                className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200"
              >
                Se déconnecter
              </button>
              <button
                onClick={extendSession}
                className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#008751] hover:bg-[#007043] text-white shadow-md"
              >
                Rester connecté
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Enterprise Header Bar - Professional Polish Design Theme */}
      <header className="sticky top-0 z-40 h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 shrink-0 shadow-sm">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-4">
          
          {/* App Logo & Title */}
          <div className="flex items-center space-x-3 shrink-0">
            {/* Site mark: the uploaded logo when one is configured, otherwise the XF initials.
                Falling back rather than showing a broken image keeps the header intact on a fresh
                install, and if the stored data URI ever fails to decode. */}
            {siteLogo ? (
              <img
                src={siteLogo}
                alt={siteName}
                className="w-8 h-8 rounded-lg object-contain bg-white ring-1 ring-slate-200 shadow-sm"
                onError={() => setSiteLogo(null)}
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-[#008751] flex items-center justify-center font-black text-white text-base shadow-sm ring-1 ring-amber-400/40">
                <span className="text-amber-300 font-extrabold text-sm tracking-tighter">XF</span>
              </div>
            )}
            <div className="flex items-center space-x-3">
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-lg font-black tracking-tight uppercase text-slate-800 underline underline-offset-4 decoration-[#008751]">
                    {siteName}
                  </h1>
                </div>
              </div>
              <div className="hidden sm:block h-4 w-[1px] bg-slate-300" />
              <span className="hidden sm:inline-block text-xs font-bold text-slate-500 uppercase tracking-widest">
                Site Safi
              </span>
            </div>
          </div>

          {/* Center / Right: QA Testing 10-Role Switcher (demo mode only) */}
          <div className="flex items-center space-x-3">
            {isDemoMode ? (
              <div className="relative" ref={roleMenuRef}>
              {/* Click-to-open, not hover: the menu sits below the trigger with a gap, so moving
                  the pointer down to pick a role left the hover area and closed it before any
                  option could be reached. */}
              <button
                type="button"
                onClick={() => setIsRoleMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={isRoleMenuOpen}
                className={`flex items-center rounded-full px-3.5 py-1.5 gap-2 border transition-all cursor-pointer text-slate-700 ${
                  isRoleMenuOpen
                    ? 'bg-slate-200/80 border-slate-300'
                    : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200'
                }`}
              >
                <Shield className="w-4 h-4 text-emerald-600" />
                <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700">
                  <span className="text-[10px] font-bold text-slate-400 uppercase hidden md:inline">Role Switcher:</span>
                  <span className="font-bold text-slate-800">{roleConfig.label}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${roleConfig.badgeColor}`}>
                    {roleConfig.route}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isRoleMenuOpen ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>

              {/* Dropdown Menu for instant role switching */}
              {isRoleMenuOpen && (
              <div role="menu" className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
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
                        role="menuitem"
                        onClick={() => {
                          switchRole(roleKey);
                          setIsRoleMenuOpen(false);
                        }}
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
              )}
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

            {/* Collaborators get the reservation rules instead of the AI assistant: Module 1 does
                not open the assistant to them (per-request cost), and the rules are deterministic
                so they need no model to answer. Every other role keeps the assistant. */}
            {canUseAssistant ? (
              <button
                onClick={() => setIsAIOpen(true)}
                className="p-2 rounded-xl bg-[#008751] hover:bg-emerald-600 text-white transition-colors shadow-sm"
                title="XFactory AI Assistant"
              >
                <Bot className="w-4 h-4 text-amber-300" />
              </button>
            ) : (
              <button
                onClick={() => setIsRulesOpen(true)}
                className="p-2 rounded-xl bg-[#008751] hover:bg-emerald-600 text-white transition-colors shadow-sm"
                title="Règles de réservation"
              >
                <Scale className="w-4 h-4 text-amber-300" />
              </button>
            )}

            {/* Notifications Button */}
            <div className="relative">
              <button
                onClick={handleOpenNotifications}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 transition-colors relative"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <>
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" />
                  </>
                )}
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 z-50 text-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-bold text-slate-800">Notifications</span>
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-bold border border-emerald-200">
                      {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="space-y-2 text-slate-600 max-h-80 overflow-y-auto">
                    {notifications.length === 0 && (
                      <p className="text-center text-slate-400 py-4">Aucune notification.</p>
                    )}
                    {notifications.map((n) => (
                      <button
                        key={n.id}
                        // Opens the full notification rather than only marking it seen: the body
                        // is truncated here, and it is often where the actual information is.
                        onClick={() => handleOpenNotification(n)}
                        className={`w-full text-left p-2 rounded-xl border transition-colors ${
                          n.read ? 'bg-white border-slate-100' : 'bg-emerald-50/60 border-emerald-200'
                        }`}
                      >
                        <p className="font-semibold text-slate-900">{n.title}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-[9px] text-slate-400 mt-1">{new Date(n.created_at).toLocaleString('fr-FR')}</p>
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      setActiveTab('notifications');
                      setIsNotificationsOpen(false);
                    }}
                    className="w-full text-center text-[11px] font-bold text-[#008751] hover:text-emerald-700 py-1.5 border-t border-slate-100"
                  >
                    Voir toutes les notifications
                  </button>
                </div>
              )}
            </div>

            {/* User Profile Capsule - opens the profile panel. */}
            <button
              type="button"
              onClick={() => setIsProfileOpen(true)}
              title="Mon profil"
              className="hidden sm:flex items-center space-x-2.5 border-l pl-4 border-slate-200 hover:opacity-80 transition-opacity"
            >
              <div className="text-right text-xs">
                <div className="font-bold text-slate-800 leading-none">{currentUser.full_name}</div>
                <div className="text-[10px] text-slate-400 leading-none mt-1">{currentUser.department}</div>
              </div>
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                {currentUser.full_name.charAt(0)}
              </div>
            </button>

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

      {/* Footer - site identity only.
          Previously carried "PostgreSQL DB: Connected" and a "v4.0.1 Enterprise" build badge on
          every role's screen. Both were hardcoded strings: the first would have claimed a healthy
          database while Postgres was down, and the version contradicted the repository. Neither
          is a collaborator's, receptionist's, director's or approver's concern - real platform
          health is probed by /api/health and shown in the IT Administrator console. */}
      <footer className="h-8 bg-[#005A36] text-white flex items-center justify-between px-6 shrink-0 text-[10px]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="font-bold uppercase tracking-wider text-amber-100">{siteName}</span>
        </div>
        <span className="text-emerald-200 font-mono tracking-widest hidden md:inline">SFI-XFACTORY</span>
      </footer>

      {/* AI Assistant Drawer (SRS 28.14) - only mounted for roles that may use it. */}
      {canUseAssistant && (
        <AIAssistantDrawer isOpen={isAIOpen} onClose={() => setIsAIOpen(false)} userRole={currentRole} userId={currentUser.id} />
      )}

      {/* Reservation rules reference, shown to roles without the assistant. */}
      <ReservationRulesDrawer isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} />

      {/* Profile panel, opened from the identity capsule in the header. */}
      <UserProfileDrawer isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />

      {/* Full-screen gate while the account is on an admin-issued temporary password. Rendered
          last so it sits above every other surface, and has no dismiss path. */}
      {mustChangePassword === true && (
        <ForcePasswordChange
          userName={currentUser.full_name}
          onDone={() => setMustChangePassword(false)}
        />
      )}
    </div>
  );
};
