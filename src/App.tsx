import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  Bell,
  Building2,
  ClipboardCheck,
  LayoutDashboard,
  Loader2,
  LogOut,
  PhoneCall,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import { auth, BOOTSTRAPPED_ADMIN_EMAIL, googleProvider } from './firebase';
import type {
  AccidentHotspotRecord,
  AiAnalysisRecord,
  AuditLogRecord,
  ClassifiedIssueRecord,
  ComplaintRecord,
  DepartmentWorkOrderRecord,
  EmergencyIncidentRecord,
  EmergencyRuleRecord,
  EvidenceRecord,
  HealthIntegrationStatus,
  InspectionReportRecord,
  InspectorAssignmentRecord,
  IssueTaxonomyRecord,
  MunicipalOfficeRecord,
  NotificationRecord,
  OfficerApprovalRecord,
  ResolutionRecord,
  SupportedLanguage,
  UserProfile,
} from './types/civic';
import { SUPPORTED_LANGUAGES, UI_TRANSLATIONS } from './i18n/translations';
import {
  ensureUserProfile,
  fetchHealthStatus,
  subscribeAllUsersAdmin,
  subscribeAuditLogs,
  subscribeComplaintScopedCollection,
  subscribeComplaintsForRole,
  subscribeNotifications,
  subscribeReferenceCollection,
} from './services/civicService';
import { CitizenPortal } from './components/CitizenPortal';
import { InspectorPortal } from './components/InspectorPortal';
import { OfficerPortal } from './components/OfficerPortal';
import { AdminDashboard } from './components/AdminDashboard';
import { NotificationDrawer } from './components/NotificationDrawer';

type PortalView = 'citizen' | 'inspector' | 'officer' | 'admin';

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [language, setLanguage] = useState<SupportedLanguage>('en');
  const [portalView, setPortalView] = useState<PortalView>('citizen');
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Real-time Firestore collections state
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [classifiedIssues, setClassifiedIssues] = useState<ClassifiedIssueRecord[]>([]);
  const [aiAnalyses, setAiAnalyses] = useState<AiAnalysisRecord[]>([]);
  const [evidenceList, setEvidenceList] = useState<EvidenceRecord[]>([]);
  const [assignments, setAssignments] = useState<InspectorAssignmentRecord[]>([]);
  const [inspectionReports, setInspectionReports] = useState<InspectionReportRecord[]>([]);
  const [emergencyIncidents, setEmergencyIncidents] = useState<EmergencyIncidentRecord[]>([]);
  const [approvals, setApprovals] = useState<OfficerApprovalRecord[]>([]);
  const [workOrders, setWorkOrders] = useState<DepartmentWorkOrderRecord[]>([]);
  const [resolutions, setResolutions] = useState<ResolutionRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);

  // Reference data collections
  const [taxonomy, setTaxonomy] = useState<IssueTaxonomyRecord[]>([]);
  const [offices, setOffices] = useState<MunicipalOfficeRecord[]>([]);
  const [hotspots, setHotspots] = useState<AccidentHotspotRecord[]>([]);
  const [emergencyRules, setEmergencyRules] = useState<EmergencyRuleRecord[]>([]);

  // Server integration health
  const [healthStatus, setHealthStatus] = useState<HealthIntegrationStatus | null>(null);

  const isBootstrappedAdmin = Boolean(
    firebaseUser?.emailVerified &&
      firebaseUser?.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
  );

  // 1. Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const loaded = await ensureUserProfile(language);
          setProfile(loaded);
          setLanguage(loaded.language || 'en');
          if (loaded.role === 'admin') setPortalView('admin');
          else if (loaded.role === 'officer') setPortalView('officer');
          else if (loaded.role === 'inspector') setPortalView('inspector');
          else setPortalView('citizen');
        } catch (err) {
          setAuthError(err instanceof Error ? err.message : 'Failed to load user profile.');
        }
      } else {
        setProfile(null);
      }
      setAuthReady(true);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Fetch server health status once
  useEffect(() => {
    fetchHealthStatus()
      .then(setHealthStatus)
      .catch(() => setHealthStatus(null));
  }, []);

  // 3. Attach Firestore real-time listeners strictly after Auth + Profile are ready
  useEffect(() => {
    if (!authReady || !firebaseUser || !profile) return;

    const unsubs = [
      subscribeReferenceCollection<IssueTaxonomyRecord>('issue_taxonomy', setTaxonomy),
      subscribeReferenceCollection<MunicipalOfficeRecord>('municipal_offices', setOffices),
      subscribeReferenceCollection<AccidentHotspotRecord>('accident_hotspots', setHotspots),
      subscribeReferenceCollection<EmergencyRuleRecord>('emergency_rules', setEmergencyRules),
      subscribeNotifications(profile.uid, setNotifications),
      subscribeComplaintsForRole(profile, isBootstrappedAdmin, setComplaints),
      subscribeComplaintScopedCollection<ClassifiedIssueRecord>(
        'classified_issues',
        profile,
        isBootstrappedAdmin,
        setClassifiedIssues
      ),
      subscribeComplaintScopedCollection<AiAnalysisRecord>(
        'ai_analysis',
        profile,
        isBootstrappedAdmin,
        setAiAnalyses
      ),
      subscribeComplaintScopedCollection<EvidenceRecord>(
        'evidence',
        profile,
        isBootstrappedAdmin,
        setEvidenceList
      ),
      subscribeComplaintScopedCollection<InspectorAssignmentRecord>(
        'inspector_assignments',
        profile,
        isBootstrappedAdmin,
        setAssignments
      ),
      subscribeComplaintScopedCollection<InspectionReportRecord>(
        'inspection_reports',
        profile,
        isBootstrappedAdmin,
        setInspectionReports
      ),
      subscribeComplaintScopedCollection<EmergencyIncidentRecord>(
        'emergency_incidents',
        profile,
        isBootstrappedAdmin,
        setEmergencyIncidents
      ),
      subscribeComplaintScopedCollection<OfficerApprovalRecord>(
        'officer_approvals',
        profile,
        isBootstrappedAdmin,
        setApprovals
      ),
      subscribeComplaintScopedCollection<DepartmentWorkOrderRecord>(
        'department_work_orders',
        profile,
        isBootstrappedAdmin,
        setWorkOrders
      ),
      subscribeComplaintScopedCollection<ResolutionRecord>(
        'resolution_records',
        profile,
        isBootstrappedAdmin,
        setResolutions
      ),
      subscribeAuditLogs(profile, isBootstrappedAdmin, setAuditLogs),
    ];

    if (isBootstrappedAdmin) {
      unsubs.push(subscribeAllUsersAdmin(setUsers));
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, firebaseUser, profile, isBootstrappedAdmin]);

  const unreadNotifications = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const openEmergencyCount = useMemo(
    () => emergencyIncidents.filter((e) => e.status !== 'resolved').length,
    [emergencyIncidents]
  );

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setProfile(null);
    setDrawerOpen(false);
  };

  // Authorized navigation tabs per RBAC role
  const allowedPortals = useMemo((): Array<{ id: PortalView; label: string; icon: typeof Building2 }> => {
    if (!profile) return [];
    const items: Array<{ id: PortalView; label: string; icon: typeof Building2 }> = [
      { id: 'citizen', label: 'Citizen Portal', icon: Building2 },
    ];
    if (profile.role === 'inspector' || profile.role === 'admin') {
      items.push({ id: 'inspector', label: 'Inspector Portal', icon: ClipboardCheck });
    }
    if (profile.role === 'officer' || profile.role === 'admin') {
      items.push({ id: 'officer', label: 'Officer Portal', icon: ShieldAlert });
    }
    if (profile.role === 'admin') {
      items.push({ id: 'admin', label: 'Administrator', icon: LayoutDashboard });
    }
    return items;
  }, [profile]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2.5 text-sm text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin text-blue-700" />
          Initializing CivicAI Municipal Platform...
        </div>
      </div>
    );
  }

  // ── Unauthenticated Regional-Language Sign-In Gate ─────────────────────────
  if (!firebaseUser || !profile) {
    const t = UI_TRANSLATIONS[language] || UI_TRANSLATIONS.en;
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Clean 3-Zone Top Bar */}
        <header className="bg-white border-b border-slate-200 px-6 lg:px-10 py-4 flex items-center justify-between gap-8">
          <span className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0">
            CivicAI
          </span>
          <div className="hidden md:flex items-center gap-6 text-sm text-slate-600">
            <span className="whitespace-nowrap">Citizen Grievance</span>
            <span className="whitespace-nowrap">Field Inspection</span>
            <span className="whitespace-nowrap">EmergencyGuard</span>
            <span className="whitespace-nowrap">TwinTrust GIS</span>
          </div>
          <button
            type="button"
            disabled={signingIn}
            onClick={() => void handleGoogleSignIn()}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            {signingIn ? 'Signing in...' : t.signInGoogle}
          </button>
        </header>

        {/* Main 2-Column Editorial Hero */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-6 lg:px-10 py-10 lg:py-14 flex flex-col justify-center gap-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <p className="text-xs font-medium text-blue-700">
                  Municipal Governance · Gemini Multimodal AI · OpenStreetMap TwinTrust
                </p>
                <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 leading-tight max-w-xl">
                  {t.signInTitle}
                </h1>
                <p className="text-base text-slate-600 leading-relaxed max-w-xl">{t.signInSubtitle}</p>
              </div>

              {/* Regional Language Picker & Google Sign-In */}
              <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4 max-w-lg">
                <div className="space-y-1.5">
                  <label htmlFor="login-lang" className="block text-xs font-medium text-slate-700">
                    {t.selectLanguage}
                  </label>
                  <select
                    id="login-lang"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.nativeLabel} — {l.englishLabel}
                      </option>
                    ))}
                  </select>
                </div>

                {authError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2.5">{authError}</div>
                )}

                <button
                  type="button"
                  disabled={signingIn}
                  onClick={() => void handleGoogleSignIn()}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md transition-colors"
                >
                  {signingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                  {t.signInGoogle}
                </button>

                <p className="text-xs text-slate-500 leading-relaxed">
                  Role-based authentication assigns Citizens, Field Inspectors, Municipal Officers, and Administrators strictly via verified Firebase identities and Firestore security rules.
                </p>
              </div>

              {/* India Emergency 112 Guidance */}
              <div className="flex items-start gap-3 text-xs text-slate-600 max-w-xl">
                <PhoneCall className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-red-700">{t.emergencyBannerTitle}: </strong>
                  {t.emergencyBannerBody}
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[340px] rounded-lg overflow-hidden border border-slate-200 bg-slate-200">
                <img
                  src="/src/assets/images/civicai_urban_aerial_1795247692408.jpg"
                  alt="Modern Indian municipal civic square and arterial roadway"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* 4-Column Platform Capabilities Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 border-t border-slate-200 pt-8 text-xs">
            <div className="space-y-1">
              <div className="font-semibold text-slate-900">01. Gemini Multimodal Triage</div>
              <p className="text-slate-600 leading-relaxed">
                Regional language translation, photo inspection, and multi-issue canonical taxonomy classification.
              </p>
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-slate-900">02. ImageGuard Verification</div>
              <p className="text-slate-600 leading-relaxed">
                SHA-256 hashing, duplicate checks, EXIF GPS analysis, and advisory flags for human inspector review.
              </p>
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-slate-900">03. TwinTrust OpenStreetMap</div>
              <p className="text-slate-600 leading-relaxed">
                GPS-to-road matching, imported ward boundaries, office routing, and verified historical accident proximity.
              </p>
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-slate-900">04. EmergencyGuard Escalation</div>
              <p className="text-slate-600 leading-relaxed">
                Deterministic life-safety rules plus Gemini detection routing Critical incidents straight to on-duty officers.
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Authenticated Role-Based Municipal Workspace ───────────────────────────
  const activePortalTitle =
    portalView === 'citizen'
      ? 'Citizen Grievance Portal'
      : portalView === 'inspector'
      ? 'Field Inspector Portal & MFIR'
      : portalView === 'officer'
      ? 'Municipal Officer Operations'
      : 'Platform Administration & Governance';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Structural Municipal Sidebar */}
      <aside className="lg:w-64 bg-slate-900 text-slate-200 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="text-lg font-bold tracking-tight text-white font-display">CivicAI</div>
          <div className="text-xs text-slate-400 mt-0.5">Municipal Operations Platform</div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {allowedPortals.map((item) => {
            const Icon = item.icon;
            const active = portalView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPortalView(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  active ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.id === 'officer' && openEmergencyCount > 0 && (
                  <span className="font-mono text-xs font-semibold text-red-400 tabular-nums">
                    {openEmergencyCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2 text-xs">
          <div className="font-medium text-white truncate">{profile.displayName}</div>
          <div className="text-slate-400 truncate">{profile.email}</div>
          <div className="text-slate-400">
            Role: <span className="text-slate-200 capitalize">{profile.role}</span>
            {profile.department ? ` · ${profile.department}` : ''}
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Workspace Header (Breadcrumb + Notification Action) */}
        <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="min-w-0">
            <div className="text-xs text-slate-500">CivicAI / {profile.role.toUpperCase()}</div>
            <h1 className="text-base font-semibold text-slate-900 truncate">{activePortalTitle}</h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors whitespace-nowrap"
            >
              <Bell className="w-3.5 h-3.5" />
              Notifications
              <span className="font-mono tabular-nums font-semibold text-blue-700">({unreadNotifications})</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {portalView === 'citizen' && (
            <CitizenPortal
              profile={profile}
              language={language}
              onLanguageChange={setLanguage}
              complaints={complaints}
              classifiedIssues={classifiedIssues}
              aiAnalyses={aiAnalyses}
              evidenceList={evidenceList}
              inspectionReports={inspectionReports}
              workOrders={workOrders}
              resolutions={resolutions}
              offices={offices}
              hotspots={hotspots}
              taxonomy={taxonomy}
              emergencyRules={emergencyRules}
            />
          )}

          {portalView === 'inspector' && (profile.role === 'inspector' || profile.role === 'admin') && (
            <InspectorPortal
              profile={profile}
              complaints={complaints}
              assignments={assignments}
              classifiedIssues={classifiedIssues}
              aiAnalyses={aiAnalyses}
              evidenceList={evidenceList}
              inspectionReports={inspectionReports}
              offices={offices}
              hotspots={hotspots}
            />
          )}

          {portalView === 'officer' && (profile.role === 'officer' || profile.role === 'admin') && (
            <OfficerPortal
              profile={profile}
              complaints={complaints}
              emergencyIncidents={emergencyIncidents}
              inspectionReports={inspectionReports}
              approvals={approvals}
              workOrders={workOrders}
              resolutions={resolutions}
            />
          )}

          {portalView === 'admin' && profile.role === 'admin' && (
            <AdminDashboard
              profile={profile}
              users={users}
              complaints={complaints}
              offices={offices}
              hotspots={hotspots}
              taxonomy={taxonomy}
              emergencyRules={emergencyRules}
              emergencyIncidents={emergencyIncidents}
              inspectionReports={inspectionReports}
              workOrders={workOrders}
              resolutions={resolutions}
              auditLogs={auditLogs}
              healthStatus={healthStatus}
            />
          )}
        </main>
      </div>

      <NotificationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        notifications={notifications}
      />
    </div>
  );
}
