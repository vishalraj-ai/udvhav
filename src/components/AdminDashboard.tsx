import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  AccidentHotspotRecord,
  AuditLogRecord,
  ComplaintRecord,
  DepartmentWorkOrderRecord,
  EmergencyIncidentRecord,
  EmergencyRuleRecord,
  HealthIntegrationStatus,
  InspectionReportRecord,
  IssueTaxonomyRecord,
  MunicipalOfficeRecord,
  ResolutionRecord,
  SeverityLevel,
  UserProfile,
  UserRole,
} from '../types/civic';
import {
  HOTSPOTS_CSV_TEMPLATE,
  MUNICIPAL_DEPARTMENTS,
  OFFICES_CSV_TEMPLATE,
} from '../data/municipalDefaults';
import {
  adminUpdateUser,
  deleteReferenceDoc,
  importAccidentHotspotsCsv,
  importOfficesCsv,
  saveEmergencyRule,
  saveTaxonomyItem,
  seedStandardTaxonomyAndRules,
} from '../services/civicService';
import { TwinTrustMap } from './TwinTrustMap';

interface AdminDashboardProps {
  profile: UserProfile;
  users: UserProfile[];
  complaints: ComplaintRecord[];
  offices: MunicipalOfficeRecord[];
  hotspots: AccidentHotspotRecord[];
  taxonomy: IssueTaxonomyRecord[];
  emergencyRules: EmergencyRuleRecord[];
  emergencyIncidents: EmergencyIncidentRecord[];
  inspectionReports: InspectionReportRecord[];
  workOrders: DepartmentWorkOrderRecord[];
  resolutions: ResolutionRecord[];
  auditLogs: AuditLogRecord[];
  healthStatus: HealthIntegrationStatus | null;
}

type AdminTab = 'analytics' | 'users' | 'geo_offices' | 'hotspots' | 'taxonomy_rules' | 'audit';

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function AdminDashboard({
  profile,
  users,
  complaints,
  offices,
  hotspots,
  taxonomy,
  emergencyRules,
  emergencyIncidents,
  inspectionReports,
  workOrders,
  resolutions,
  auditLogs,
  healthStatus,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('analytics');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // CSV Import state
  const [officesCsv, setOfficesCsv] = useState('');
  const [hotspotsCsv, setHotspotsCsv] = useState('');

  // New Taxonomy form
  const [taxCode, setTaxCode] = useState('');
  const [taxDomain, setTaxDomain] = useState('Roads & Mobility');
  const [taxCategory, setTaxCategory] = useState('');
  const [taxSubcategory, setTaxSubcategory] = useState('');
  const [taxDepartment, setTaxDepartment] = useState(MUNICIPAL_DEPARTMENTS[0]);
  const [taxSeverity, setTaxSeverity] = useState<SeverityLevel>('Medium');
  const [taxEmergency, setTaxEmergency] = useState(false);
  const [taxSla, setTaxSla] = useState('48');

  // New Emergency Rule form
  const [ruleCode, setRuleCode] = useState('');
  const [ruleName, setRuleName] = useState('');
  const [ruleKeywords, setRuleKeywords] = useState('');
  const [ruleTaxCodes, setRuleTaxCodes] = useState('');
  const [ruleSeverity, setRuleSeverity] = useState<'Critical' | 'High'>('Critical');
  const [ruleAckMin, setRuleAckMin] = useState('15');

  // Audit filter
  const [auditFilter, setAuditFilter] = useState('');

  const departmentBreakdown = useMemo(() => {
    const counts = new Map<string, { total: number; critical: number; resolved: number }>();
    complaints.forEach((c) => {
      const dept = c.primaryDepartment || 'Unassigned';
      const cur = counts.get(dept) || { total: 0, critical: 0, resolved: 0 };
      cur.total++;
      if (c.severity === 'Critical' || c.isEmergency) cur.critical++;
      if (c.status === 'resolved' || c.status === 'closed') cur.resolved++;
      counts.set(dept, cur);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [complaints]);

  const filteredAuditLogs = useMemo(() => {
    if (!auditFilter.trim()) return auditLogs;
    const q = auditFilter.toLowerCase();
    return auditLogs.filter(
      (l) =>
        l.action.toLowerCase().includes(q) ||
        l.summary.toLowerCase().includes(q) ||
        l.actorRole.toLowerCase().includes(q) ||
        l.entityType.toLowerCase().includes(q)
    );
  }, [auditLogs, auditFilter]);

  const handleSeedStandards = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await seedStandardTaxonomyAndRules(profile.uid);
      setMessage({
        type: 'success',
        text: `Loaded ${result.taxonomyCount} standardized canonical issue codes and ${result.ruleCount} deterministic EmergencyGuard rules into Firestore.`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to initialize starter catalog.' });
    } finally {
      setBusy(false);
    }
  };

  const handleImportOffices = async () => {
    if (!officesCsv.trim()) {
      setMessage({ type: 'error', text: 'Paste or upload a valid municipal offices CSV first.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const count = await importOfficesCsv(officesCsv, profile.uid, profile.displayName);
      setOfficesCsv('');
      setMessage({ type: 'success', text: `Imported ${count} municipal office & ward boundary record(s).` });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'CSV import failed.' });
    } finally {
      setBusy(false);
    }
  };

  const handleImportHotspots = async () => {
    if (!hotspotsCsv.trim()) {
      setMessage({ type: 'error', text: 'Paste or upload a valid accident hotspots CSV first.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const count = await importAccidentHotspotsCsv(hotspotsCsv, profile.uid);
      setHotspotsCsv('');
      setMessage({ type: 'success', text: `Imported ${count} verified historical accident hotspot record(s).` });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Hotspots CSV import failed.' });
    } finally {
      setBusy(false);
    }
  };

  const handleCsvFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = () => {
      setter(String(reader.result || ''));
    };
    reader.readAsText(file);
  };

  const handleUserRoleChange = async (user: UserProfile, nextRole: UserRole, nextDept: string, nextWard: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await adminUpdateUser(
        user.uid,
        {
          displayName: user.displayName,
          role: nextRole,
          language: user.language,
          department: nextDept,
          wardId: nextWard,
          phone: user.phone,
          onDuty: user.onDuty,
        },
        profile.uid
      );
      setMessage({ type: 'success', text: `Updated ${user.displayName} to role=${nextRole}.` });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update user.' });
    } finally {
      setBusy(false);
    }
  };

  const handleAddTaxonomy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taxCode.trim() || !taxCategory.trim() || !taxSubcategory.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await saveTaxonomyItem(
        {
          code: taxCode.trim().toUpperCase(),
          domain: taxDomain.trim(),
          category: taxCategory.trim(),
          subcategory: taxSubcategory.trim(),
          department: taxDepartment,
          defaultSeverity: taxSeverity,
          emergencyTrigger: taxEmergency,
          slaHours: Number(taxSla) || 48,
          active: true,
        },
        profile.uid
      );
      setTaxCode('');
      setTaxCategory('');
      setTaxSubcategory('');
      setMessage({ type: 'success', text: `Taxonomy code ${taxCode.toUpperCase()} saved.` });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save taxonomy item.' });
    } finally {
      setBusy(false);
    }
  };

  const handleAddEmergencyRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleCode.trim() || !ruleName.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await saveEmergencyRule(
        {
          ruleCode: ruleCode.trim().toUpperCase(),
          name: ruleName.trim(),
          keywords: ruleKeywords
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean),
          taxonomyCodes: ruleTaxCodes
            .split(',')
            .map((c) => c.trim().toUpperCase())
            .filter(Boolean),
          severity: ruleSeverity,
          ackWindowMinutes: Number(ruleAckMin) || 15,
          active: true,
        },
        profile.uid
      );
      setRuleCode('');
      setRuleName('');
      setRuleKeywords('');
      setRuleTaxCodes('');
      setMessage({ type: 'success', text: `Deterministic EmergencyGuard rule ${ruleCode.toUpperCase()} saved.` });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save emergency rule.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          {(
            [
              { id: 'analytics', label: 'Analytics & Integrations' },
              { id: 'users', label: `Users & Roles (${users.length})` },
              { id: 'geo_offices', label: `Wards & Offices CSV (${offices.length})` },
              { id: 'hotspots', label: `Accident Hotspots CSV (${hotspots.length})` },
              { id: 'taxonomy_rules', label: `Taxonomy & Rules (${taxonomy.length})` },
              { id: 'audit', label: `Audit Logs (${auditLogs.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setMessage(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === tab.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleSeedStandards()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md whitespace-nowrap"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
          Initialize Standard Taxonomy & Emergency Rules
        </button>
      </div>

      {message && (
        <div
          className={`text-xs rounded-md p-3 border flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {message.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
          {message.text}
        </div>
      )}

      {/* TAB 1: PERFORMANCE ANALYTICS & INTEGRATION READINESS */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-500">Total Complaints</div>
              <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
                {complaints.length}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-500">Critical Incidents</div>
              <div className="text-2xl font-semibold text-red-700 font-mono tabular-nums mt-1">
                {emergencyIncidents.length}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-500">MFIR Reports</div>
              <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
                {inspectionReports.length}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-500">Work Orders</div>
              <div className="text-2xl font-semibold text-blue-700 font-mono tabular-nums mt-1">
                {workOrders.length}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-500">Verified Resolutions</div>
              <div className="text-2xl font-semibold text-emerald-700 font-mono tabular-nums mt-1">
                {resolutions.length}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <section className="xl:col-span-6 bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-sm font-semibold text-slate-900">Department Workload & Resolution Performance</h2>
              </div>
              {departmentBreakdown.length === 0 ? (
                <div className="p-8 text-sm text-slate-500">
                  No complaints logged yet. Live departmental throughput will appear here once citizens submit reports.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="py-2.5 px-4">Department</th>
                      <th className="py-2.5 px-4 text-right">Total</th>
                      <th className="py-2.5 px-4 text-right">Critical</th>
                      <th className="py-2.5 px-4 text-right">Resolved</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {departmentBreakdown.map(([dept, stats]) => (
                      <tr key={dept}>
                        <td className="py-3 px-4 font-medium text-slate-900">{dept}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{stats.total}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-red-700">{stats.critical}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700">
                          {stats.resolved}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="xl:col-span-6 bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-sm font-semibold text-slate-900">Platform Integration & Dependency Audit</h2>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {healthStatus ? (
                  Object.entries(healthStatus.integrations).map(([key, info]) => (
                    <div key={key} className="p-4 flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-900">{key}</div>
                        {'note' in info && info.note && <div className="text-slate-600">{info.note}</div>}
                        {'model' in info && info.model && (
                          <div className="text-slate-500 font-mono">Model: {info.model} · Mode: {info.mode}</div>
                        )}
                        {'projectId' in info && info.projectId && (
                          <div className="text-slate-500 font-mono">Project: {info.projectId}</div>
                        )}
                      </div>
                      <span
                        className={`font-semibold whitespace-nowrap ${
                          info.configured ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {info.configured ? 'Connected' : 'External Setup Required'}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-slate-500">Loading integration health status...</div>
                )}
              </div>
            </section>
          </div>

          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">TwinTrust Municipal Operations Map</h2>
            <TwinTrustMap
              centerLat={offices[0]?.latitude ?? 28.6139}
              centerLng={offices[0]?.longitude ?? 77.209}
              offices={offices}
              hotspots={hotspots}
              complaints={complaints}
              heightClass="h-80"
            />
          </section>
        </div>
      )}

      {/* TAB 2: USERS & ROLES */}
      {activeTab === 'users' && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Role-Based Access Directory</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Firestore rules enforce role immutability for self-updates. Only Administrators can assign Inspector, Municipal Officer, or Admin roles.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-2.5 px-4">User & Email</th>
                  <th className="py-2.5 px-4">UID</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4">Department</th>
                  <th className="py-2.5 px-4">Ward</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.uid}>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{u.displayName}</div>
                      <div className="text-slate-500">{u.email}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">{u.uid.slice(0, 12)}…</td>
                    <td className="py-3 px-4">
                      <select
                        disabled={busy}
                        value={u.role}
                        onChange={(e) =>
                          void handleUserRoleChange(u, e.target.value as UserRole, u.department, u.wardId)
                        }
                        className="border border-slate-300 rounded px-2 py-1 bg-white text-slate-900"
                      >
                        <option value="citizen">Citizen</option>
                        <option value="inspector">Inspector</option>
                        <option value="officer">Municipal Officer</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        disabled={busy}
                        value={u.department || ''}
                        onChange={(e) => void handleUserRoleChange(u, u.role, e.target.value, u.wardId)}
                        className="border border-slate-300 rounded px-2 py-1 bg-white text-slate-900"
                      >
                        <option value="">Unassigned</option>
                        <option value="Municipal Administration">Municipal Administration</option>
                        {MUNICIPAL_DEPARTMENTS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 font-mono">{u.wardId || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 3: WARDS & OFFICES CSV IMPORT */}
      {activeTab === 'geo_offices' && (
        <div className="space-y-6">
          <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Import Municipal Office Directory & Ward Boundaries (CSV)</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  TwinTrust routes complaints strictly using imported ward boundaries and office coordinates. Never relies on invented city data.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadTextFile('civicai_municipal_offices_template.csv', OFFICES_CSV_TEMPLATE)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md"
                >
                  <Download className="w-3.5 h-3.5" /> Download CSV Template
                </button>
                <button
                  type="button"
                  onClick={() => setOfficesCsv(OFFICES_CSV_TEMPLATE)}
                  className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md"
                >
                  Load Template into Editor
                </button>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md cursor-pointer">
                  <Upload className="w-3.5 h-3.5" /> Upload CSV File
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => handleCsvFileSelect(e, setOfficesCsv)}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <textarea
              rows={5}
              value={officesCsv}
              onChange={(e) => setOfficesCsv(e.target.value)}
              placeholder="officeCode,officeName,department,wardId,wardName,address,latitude,longitude,minLat,maxLat,minLng,maxLng,contactPhone"
              className="w-full font-mono text-xs border border-slate-300 rounded-md p-3"
            />

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleImportOffices()}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md"
            >
              Import Municipal Offices to Firestore
            </button>
          </section>

          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">Imported Municipal Offices ({offices.length})</h3>
            </div>
            {offices.length === 0 ? (
              <div className="p-8 text-sm text-slate-500">
                No municipal offices imported yet. Upload an official CSV or load the sample template above to activate ward jurisdiction routing.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="py-2.5 px-4">Code & Office</th>
                      <th className="py-2.5 px-4">Ward & Department</th>
                      <th className="py-2.5 px-4">Coordinates</th>
                      <th className="py-2.5 px-4">Assigned Officer / Inspector</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {offices.map((o) => (
                      <tr key={o.id}>
                        <td className="py-3 px-4">
                          <div className="font-mono font-semibold text-slate-900">{o.officeCode}</div>
                          <div className="text-slate-600">{o.officeName}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-800">{o.wardName} ({o.wardId})</div>
                          <div className="text-slate-500">{o.department}</div>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                          {o.latitude.toFixed(4)}, {o.longitude.toFixed(4)}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          Officer: {o.primaryOfficerName || 'Unassigned'} · Insp: {o.inspectorName || 'Unassigned'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => void deleteReferenceDoc('municipal_offices', o.id, profile.uid)}
                            className="p-1 text-slate-400 hover:text-red-600"
                            aria-label="Delete office"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 4: ACCIDENT HOTSPOTS CSV IMPORT */}
      {activeTab === 'hotspots' && (
        <div className="space-y-6">
          <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Import Verified Historical Accident Records (CSV)</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Used by TwinTrust to flag proximity to verified traffic accident blackspots during complaint triage.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadTextFile('civicai_accident_hotspots_template.csv', HOTSPOTS_CSV_TEMPLATE)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md"
                >
                  <Download className="w-3.5 h-3.5" /> Download CSV Template
                </button>
                <button
                  type="button"
                  onClick={() => setHotspotsCsv(HOTSPOTS_CSV_TEMPLATE)}
                  className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md"
                >
                  Load Template into Editor
                </button>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md cursor-pointer">
                  <Upload className="w-3.5 h-3.5" /> Upload CSV File
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => handleCsvFileSelect(e, setHotspotsCsv)}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <textarea
              rows={5}
              value={hotspotsCsv}
              onChange={(e) => setHotspotsCsv(e.target.value)}
              placeholder="recordCode,locationName,roadName,wardId,latitude,longitude,incidentCount,fatalities,injuries,sourceDataset,verifiedDate"
              className="w-full font-mono text-xs border border-slate-300 rounded-md p-3"
            />

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleImportHotspots()}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md"
            >
              Import Accident Hotspots to Firestore
            </button>
          </section>

          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">Verified Accident Hotspots ({hotspots.length})</h3>
            </div>
            {hotspots.length === 0 ? (
              <div className="p-8 text-sm text-slate-500">No historical accident records imported yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="py-2.5 px-4">Code & Location</th>
                      <th className="py-2.5 px-4">Coordinates</th>
                      <th className="py-2.5 px-4 text-right">Incidents / Fatalities</th>
                      <th className="py-2.5 px-4">Source Dataset</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {hotspots.map((h) => (
                      <tr key={h.id}>
                        <td className="py-3 px-4">
                          <div className="font-mono font-semibold text-slate-900">{h.recordCode}</div>
                          <div className="text-slate-700">{h.locationName} ({h.roadName})</div>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                          {h.latitude.toFixed(4)}, {h.longitude.toFixed(4)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-red-700">
                          {h.incidentCount} / {h.fatalities}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{h.sourceDataset}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => void deleteReferenceDoc('accident_hotspots', h.id, profile.uid)}
                            className="p-1 text-slate-400 hover:text-red-600"
                            aria-label="Delete hotspot"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 5: TAXONOMY & EMERGENCY RULES */}
      {activeTab === 'taxonomy_rules' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          {/* Taxonomy Manager */}
          <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">Hierarchical Issue Taxonomy ({taxonomy.length})</h2>
            <form onSubmit={handleAddTaxonomy} className="grid grid-cols-2 gap-3 text-xs">
              <input
                type="text"
                required
                placeholder="Code (e.g. RDS-POT-002)"
                value={taxCode}
                onChange={(e) => setTaxCode(e.target.value)}
                className="border border-slate-300 rounded px-2.5 py-2 font-mono"
              />
              <input
                type="text"
                required
                placeholder="Domain"
                value={taxDomain}
                onChange={(e) => setTaxDomain(e.target.value)}
                className="border border-slate-300 rounded px-2.5 py-2"
              />
              <input
                type="text"
                required
                placeholder="Category"
                value={taxCategory}
                onChange={(e) => setTaxCategory(e.target.value)}
                className="border border-slate-300 rounded px-2.5 py-2"
              />
              <input
                type="text"
                required
                placeholder="Subcategory"
                value={taxSubcategory}
                onChange={(e) => setTaxSubcategory(e.target.value)}
                className="border border-slate-300 rounded px-2.5 py-2"
              />
              <select
                value={taxDepartment}
                onChange={(e) => setTaxDepartment(e.target.value)}
                className="border border-slate-300 rounded px-2.5 py-2 bg-white"
              >
                {MUNICIPAL_DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <select
                  value={taxSeverity}
                  onChange={(e) => setTaxSeverity(e.target.value as SeverityLevel)}
                  className="flex-1 border border-slate-300 rounded px-2 py-2 bg-white"
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={taxSla}
                  onChange={(e) => setTaxSla(e.target.value)}
                  className="w-16 border border-slate-300 rounded px-2 py-2 font-mono"
                  title="SLA Hours"
                />
              </div>
              <label className="col-span-2 flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={taxEmergency}
                  onChange={(e) => setTaxEmergency(e.target.checked)}
                />
                Triggers EmergencyGuard escalation automatically
              </label>
              <button
                type="submit"
                disabled={busy}
                className="col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 font-medium text-white bg-blue-700 hover:bg-blue-800 rounded"
              >
                <Plus className="w-3.5 h-3.5" /> Add Canonical Issue Code
              </button>
            </form>

            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto text-xs border-t border-slate-200 pt-2">
              {taxonomy.map((t) => (
                <div key={t.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-mono font-semibold text-blue-700">
                      {t.code} <span className="font-sans font-normal text-slate-800">· {t.domain} / {t.subcategory}</span>
                    </div>
                    <div className="text-slate-500">
                      {t.department} · {t.defaultSeverity} · SLA {t.slaHours}h
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteReferenceDoc('issue_taxonomy', t.id, profile.uid)}
                    className="p-1 text-slate-400 hover:text-red-600"
                    aria-label="Delete taxonomy code"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Deterministic EmergencyGuard Rules Manager */}
          <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Deterministic EmergencyGuard Rules ({emergencyRules.length})
            </h2>
            <form onSubmit={handleAddEmergencyRule} className="grid grid-cols-2 gap-3 text-xs">
              <input
                type="text"
                required
                placeholder="Rule Code (e.g. EMG-BRIDGE-01)"
                value={ruleCode}
                onChange={(e) => setRuleCode(e.target.value)}
                className="border border-slate-300 rounded px-2.5 py-2 font-mono"
              />
              <input
                type="text"
                required
                placeholder="Rule Name"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                className="border border-slate-300 rounded px-2.5 py-2"
              />
              <input
                type="text"
                placeholder="Keywords (comma separated)"
                value={ruleKeywords}
                onChange={(e) => setRuleKeywords(e.target.value)}
                className="col-span-2 border border-slate-300 rounded px-2.5 py-2"
              />
              <input
                type="text"
                placeholder="Taxonomy Codes (comma separated)"
                value={ruleTaxCodes}
                onChange={(e) => setRuleTaxCodes(e.target.value)}
                className="border border-slate-300 rounded px-2.5 py-2 font-mono"
              />
              <div className="flex items-center gap-2">
                <select
                  value={ruleSeverity}
                  onChange={(e) => setRuleSeverity(e.target.value as 'Critical' | 'High')}
                  className="flex-1 border border-slate-300 rounded px-2 py-2 bg-white"
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={ruleAckMin}
                  onChange={(e) => setRuleAckMin(e.target.value)}
                  className="w-16 border border-slate-300 rounded px-2 py-2 font-mono"
                  title="Ack SLA Minutes"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 font-medium text-white bg-red-700 hover:bg-red-800 rounded"
              >
                <Plus className="w-3.5 h-3.5" /> Add EmergencyGuard Rule
              </button>
            </form>

            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto text-xs border-t border-slate-200 pt-2">
              {emergencyRules.map((r) => (
                <div key={r.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-mono font-semibold text-red-700">
                      {r.ruleCode} <span className="font-sans font-normal text-slate-900">· {r.name}</span>
                    </div>
                    <div className="text-slate-500">
                      {r.severity} · Ack SLA: {r.ackWindowMinutes}m · Keywords: {r.keywords.slice(0, 4).join(', ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteReferenceDoc('emergency_rules', r.id, profile.uid)}
                    className="p-1 text-slate-400 hover:text-red-600"
                    aria-label="Delete rule"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 6: IMMUTABLE AUDIT LOGS */}
      {activeTab === 'audit' && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Immutable Municipal Audit History</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Append-only log enforced by Firestore rules (updates and deletions strictly denied for all roles).
              </p>
            </div>
            <input
              type="text"
              value={auditFilter}
              onChange={(e) => setAuditFilter(e.target.value)}
              placeholder="Filter action, role, entity..."
              className="text-xs border border-slate-300 rounded-md px-3 py-1.5 bg-slate-50"
            />
          </div>
          <div className="overflow-x-auto max-h-[560px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4">Action</th>
                  <th className="py-2.5 px-4">Entity</th>
                  <th className="py-2.5 px-4">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAuditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString() : 'Pending'}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-700">{log.actorRole}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-900">{log.action}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-500">{log.entityType}</td>
                    <td className="py-2.5 px-4 text-slate-700">{log.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
