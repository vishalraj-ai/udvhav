import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Hammer,
  Loader2,
  PhoneCall,
  ShieldAlert,
} from 'lucide-react';
import type {
  ComplaintRecord,
  DepartmentWorkOrderRecord,
  EmergencyIncidentRecord,
  InspectionReportRecord,
  OfficerApprovalRecord,
  ResolutionRecord,
  SeverityLevel,
  UserProfile,
} from '../types/civic';
import { MUNICIPAL_DEPARTMENTS } from '../data/municipalDefaults';
import {
  acknowledgeEmergencyIncident,
  escalateEmergencyToBackup,
  issueDepartmentWorkOrder,
  resolveEmergencyIncident,
  submitOfficerDecision,
  updateWorkOrderStatus,
  verifyResolutionAndClose,
} from '../services/civicService';

interface OfficerPortalProps {
  profile: UserProfile;
  complaints: ComplaintRecord[];
  emergencyIncidents: EmergencyIncidentRecord[];
  inspectionReports: InspectionReportRecord[];
  approvals: OfficerApprovalRecord[];
  workOrders: DepartmentWorkOrderRecord[];
  resolutions: ResolutionRecord[];
}

type OfficerTab = 'emergencies' | 'mfir' | 'work_orders' | 'resolutions';

export function OfficerPortal({
  profile,
  complaints,
  emergencyIncidents,
  inspectionReports,
  approvals,
  workOrders,
  resolutions,
}: OfficerPortalProps) {
  const [activeTab, setActiveTab] = useState<OfficerTab>('emergencies');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // MFIR Decision form state
  const [selectedReportId, setSelectedReportId] = useState<string>('');
  const [decision, setDecision] = useState<OfficerApprovalRecord['decision']>('approved');
  const [decisionDept, setDecisionDept] = useState<string>(MUNICIPAL_DEPARTMENTS[0]);
  const [decisionRemarks, setDecisionRemarks] = useState<string>('');

  // Work Order form state
  const [woComplaintId, setWoComplaintId] = useState<string>('');
  const [woDept, setWoDept] = useState<string>(MUNICIPAL_DEPARTMENTS[0]);
  const [woPriority, setWoPriority] = useState<SeverityLevel>('High');
  const [woCrew, setWoCrew] = useState<string>('');
  const [woScope, setWoScope] = useState<string>('');
  const [woTargetDate, setWoTargetDate] = useState<string>(() => {
    const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });

  // Resolution form state
  const [resComplaintId, setResComplaintId] = useState<string>('');
  const [resWorkOrderId, setResWorkOrderId] = useState<string>('');
  const [resSummary, setResSummary] = useState<string>('');

  // Tick every 15s for live EmergencyGuard acknowledgement countdown
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const complaintById = useMemo(() => {
    const map = new Map<string, ComplaintRecord>();
    complaints.forEach((c) => map.set(c.id, c));
    return map;
  }, [complaints]);

  const openEmergencies = useMemo(
    () => emergencyIncidents.filter((e) => e.status !== 'resolved'),
    [emergencyIncidents]
  );

  const pendingReports = useMemo(
    () => inspectionReports.filter((r) => r.status === 'submitted'),
    [inspectionReports]
  );

  const workOrderEligibleComplaints = useMemo(
    () =>
      complaints.filter(
        (c) =>
          c.status === 'officer_approved' ||
          c.status === 'emergency_escalated' ||
          c.status === 'inspected_mfir'
      ),
    [complaints]
  );

  const resolutionEligibleComplaints = useMemo(
    () =>
      complaints.filter(
        (c) =>
          c.status === 'work_order_issued' ||
          c.status === 'officer_approved' ||
          c.status === 'emergency_escalated'
      ),
    [complaints]
  );

  const handleAcknowledge = async (inc: EmergencyIncidentRecord) => {
    setBusyId(inc.id);
    setFeedback(null);
    try {
      await acknowledgeEmergencyIncident(inc, profile);
      setFeedback({ type: 'success', text: `Critical Incident ${inc.id} acknowledged and logged.` });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Acknowledgement failed.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleEscalate = async (inc: EmergencyIncidentRecord) => {
    setBusyId(inc.id);
    setFeedback(null);
    try {
      await escalateEmergencyToBackup(inc, profile);
      setFeedback({ type: 'success', text: `Incident ${inc.id} escalated to backup municipal officer.` });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Escalation failed.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleResolveEmergency = async (inc: EmergencyIncidentRecord) => {
    setBusyId(inc.id);
    setFeedback(null);
    try {
      await resolveEmergencyIncident(inc, profile);
      setFeedback({ type: 'success', text: `Emergency Incident ${inc.id} marked resolved.` });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to resolve emergency.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const report = inspectionReports.find((r) => r.id === selectedReportId) || pendingReports[0];
    if (!report) return;
    const complaint = complaintById.get(report.complaintId);
    if (!complaint) {
      setFeedback({ type: 'error', text: 'Linked complaint record not found.' });
      return;
    }
    if (decisionRemarks.trim().length < 2) {
      setFeedback({ type: 'error', text: 'Enter officer approval or revision remarks.' });
      return;
    }

    setBusyId(report.id);
    setFeedback(null);
    try {
      await submitOfficerDecision({
        complaint,
        report,
        officer: profile,
        decision,
        remarks: decisionRemarks.trim(),
        assignedDepartment: decisionDept,
      });
      setDecisionRemarks('');
      setFeedback({
        type: 'success',
        text: `Officer decision (${decision}) recorded for ${complaint.complaintCode}.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to submit decision.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = woComplaintId || workOrderEligibleComplaints[0]?.id;
    const complaint = targetId ? complaintById.get(targetId) : null;
    if (!complaint) {
      setFeedback({ type: 'error', text: 'Select a complaint eligible for a work order.' });
      return;
    }
    if (woScope.trim().length < 5) {
      setFeedback({ type: 'error', text: 'Provide scope of maintenance work (minimum 5 characters).' });
      return;
    }

    setBusyId('create-wo');
    setFeedback(null);
    try {
      const woId = await issueDepartmentWorkOrder({
        complaint,
        officer: profile,
        department: woDept,
        priority: woPriority,
        scopeOfWork: woScope.trim(),
        contractorOrCrew: woCrew.trim() || 'Municipal Maintenance Division',
        targetDate: woTargetDate,
      });
      setWoScope('');
      setWoCrew('');
      setFeedback({ type: 'success', text: `Maintenance Work Order (${woId}) issued for ${complaint.complaintCode}.` });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to issue work order.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleUpdateWoStatus = async (wo: DepartmentWorkOrderRecord, status: DepartmentWorkOrderRecord['status']) => {
    setBusyId(wo.id);
    setFeedback(null);
    try {
      await updateWorkOrderStatus(wo.id, status, profile);
      setFeedback({ type: 'success', text: `Work order ${wo.workOrderCode} moved to ${status}.` });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update work order.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleVerifyResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = resComplaintId || resolutionEligibleComplaints[0]?.id;
    const complaint = targetId ? complaintById.get(targetId) : null;
    if (!complaint) {
      setFeedback({ type: 'error', text: 'Select a complaint to verify and resolve.' });
      return;
    }
    if (resSummary.trim().length < 5) {
      setFeedback({ type: 'error', text: 'Provide a clear resolution verification summary.' });
      return;
    }

    setBusyId('verify-res');
    setFeedback(null);
    try {
      await verifyResolutionAndClose({
        complaint,
        workOrderId: resWorkOrderId,
        officer: profile,
        resolutionSummary: resSummary.trim(),
      });
      setResSummary('');
      setFeedback({
        type: 'success',
        text: `Resolution verified for ${complaint.complaintCode}. Citizen notified in real time.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to verify resolution.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Open Critical Emergencies</div>
          <div className="text-2xl font-semibold text-red-700 font-mono tabular-nums mt-1">
            {openEmergencies.length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Pending MFIR Approvals</div>
          <div className="text-2xl font-semibold text-amber-700 font-mono tabular-nums mt-1">
            {pendingReports.length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Active Work Orders</div>
          <div className="text-2xl font-semibold text-blue-700 font-mono tabular-nums mt-1">
            {workOrders.filter((w) => w.status !== 'verified').length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Verified Resolutions</div>
          <div className="text-2xl font-semibold text-emerald-700 font-mono tabular-nums mt-1">
            {resolutions.length}
          </div>
        </div>
      </div>

      {/* Officer Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit">
        {(
          [
            { id: 'emergencies', label: `Emergency Inbox (${openEmergencies.length})` },
            { id: 'mfir', label: `MFIR Approvals (${pendingReports.length})` },
            { id: 'work_orders', label: `Work Orders (${workOrders.length})` },
            { id: 'resolutions', label: `Resolution Verification (${resolutions.length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              setFeedback(null);
            }}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === tab.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {feedback && (
        <div
          className={`text-xs rounded-md p-3 border flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          {feedback.text}
        </div>
      )}

      {/* TAB 1: EMERGENCYGUARD INBOX */}
      {activeTab === 'emergencies' && (
        <section className="bg-white border border-slate-200 rounded-lg">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">EmergencyGuard Critical Incident Inbox</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Critical threats to life bypass MFIR waiting and route immediately to on-duty officers with acknowledgement SLA tracking and backup escalation.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-red-700">
              <PhoneCall className="w-4 h-4" />
              <span>Emergency Services India: 112 (Manual Call — Not Auto-Dispatched)</span>
            </div>
          </div>

          {emergencyIncidents.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No EmergencyGuard incidents logged. Critical complaints automatically appear here immediately upon submission.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {emergencyIncidents.map((inc) => {
                const deadlineMs = inc.acknowledgementDeadline ? Date.parse(inc.acknowledgementDeadline) : 0;
                const remainingMin = deadlineMs ? Math.ceil((deadlineMs - nowMs) / 60000) : null;
                const overdue = remainingMin !== null && remainingMin <= 0 && inc.status === 'open';
                const linkedComplaint = complaintById.get(inc.complaintId);

                return (
                  <div key={inc.id} className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-1.5 max-w-3xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                        <span className="text-sm font-semibold text-slate-900">{inc.title}</span>
                        <span className="text-xs font-mono text-red-700">· {inc.severity}</span>
                        <span className="text-xs text-slate-500">· Status: {inc.status.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="text-xs text-slate-600">
                        Trigger: {inc.triggerSource.replace(/_/g, ' ')}
                        {inc.matchedRuleIds.length > 0 ? ` · Rules: ${inc.matchedRuleIds.join(', ')}` : ''}
                        {linkedComplaint ? ` · Location: ${linkedComplaint.roadName} (${linkedComplaint.wardName})` : ''}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
                        {inc.status === 'open' && remainingMin !== null && (
                          <span className={overdue ? 'text-red-700 font-semibold' : 'text-amber-700'}>
                            <Clock className="w-3.5 h-3.5 inline mr-1" />
                            {overdue
                              ? `SLA OVERDUE by ${Math.abs(remainingMin)} min — Escalate to Backup`
                              : `Ack SLA: ${remainingMin} min remaining`}
                          </span>
                        )}
                        {inc.acknowledgedAt && (
                          <span className="text-emerald-700">
                            Acknowledged at {new Date(inc.acknowledgedAt).toLocaleTimeString()}
                          </span>
                        )}
                        {inc.escalatedAt && (
                          <span className="text-amber-700">
                            Escalated to backup at {new Date(inc.escalatedAt).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {inc.status === 'open' && (
                        <button
                          type="button"
                          disabled={busyId === inc.id}
                          onClick={() => void handleAcknowledge(inc)}
                          className="px-3.5 py-2 text-xs font-medium text-white bg-red-700 hover:bg-red-800 disabled:opacity-60 rounded-md whitespace-nowrap"
                        >
                          Acknowledge Incident
                        </button>
                      )}
                      {(inc.status === 'open' || inc.status === 'acknowledged') && (
                        <button
                          type="button"
                          disabled={busyId === inc.id}
                          onClick={() => void handleEscalate(inc)}
                          className="px-3.5 py-2 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-md whitespace-nowrap"
                        >
                          Escalate to Backup
                        </button>
                      )}
                      {inc.status !== 'resolved' && (
                        <button
                          type="button"
                          disabled={busyId === inc.id}
                          onClick={() => void handleResolveEmergency(inc)}
                          className="px-3.5 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md whitespace-nowrap"
                        >
                          Mark Resolved
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: MFIR APPROVALS */}
      {activeTab === 'mfir' && (
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">Submitted Field Inspection Reports (MFIR)</h2>
            </div>
            {inspectionReports.length === 0 ? (
              <div className="p-8 text-sm text-slate-500">No Municipal Field Inspection Reports submitted yet.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {inspectionReports.map((r) => {
                  const cmp = complaintById.get(r.complaintId);
                  const active = (selectedReportId || pendingReports[0]?.id) === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setSelectedReportId(r.id);
                        setDecisionDept(r.recommendedDepartment || MUNICIPAL_DEPARTMENTS[0]);
                      }}
                      className={`w-full text-left p-5 space-y-1.5 transition-colors ${
                        active ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-900">
                          {cmp?.complaintCode || r.complaintId} · MFIR
                        </span>
                        <span className="text-xs font-medium text-slate-600">{r.status.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="text-xs text-slate-700">
                        Inspector {r.inspectorName} · {r.physicalVerification.replace(/_/g, ' ')} · Priority:{' '}
                        <strong>{r.finalPriority}</strong> · Est. ₹{r.estimatedCostInr.toLocaleString('en-IN')}
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2">{r.siteNotes}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="xl:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-semibold text-slate-900">Record Officer Approval Decision</h3>
              <ClipboardCheck className="w-4 h-4 text-blue-700" />
            </div>

            {pendingReports.length === 0 && !selectedReportId ? (
              <p className="text-xs text-slate-500">All submitted MFIRs have been reviewed.</p>
            ) : (
              <form onSubmit={handleDecisionSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">Decision</label>
                  <select
                    value={decision}
                    onChange={(e) => setDecision(e.target.value as OfficerApprovalRecord['decision'])}
                    className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white"
                  >
                    <option value="approved">Approve MFIR for Work Order</option>
                    <option value="revision_requested">Request Inspector Revision</option>
                    <option value="rejected">Reject / Unsubstantiated</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">Assigned Department</label>
                  <select
                    value={decisionDept}
                    onChange={(e) => setDecisionDept(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white"
                  >
                    {MUNICIPAL_DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">Officer Remarks</label>
                  <textarea
                    rows={3}
                    required
                    value={decisionRemarks}
                    onChange={(e) => setDecisionRemarks(e.target.value)}
                    placeholder="Record approval authorization, budget clearance note, or revision instructions..."
                    className="w-full text-sm border border-slate-300 rounded-md px-3 py-2"
                  />
                </div>

                <button
                  type="submit"
                  disabled={Boolean(busyId)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md"
                >
                  {busyId ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Submit Officer Decision
                </button>
              </form>
            )}

            {approvals.length > 0 && (
              <div className="border-t border-slate-200 pt-4 space-y-2">
                <div className="text-xs font-semibold text-slate-900">Recent Approval History ({approvals.length})</div>
                <div className="space-y-2 max-h-48 overflow-y-auto text-xs">
                  {approvals.slice(0, 8).map((a) => (
                    <div key={a.id} className="text-slate-600">
                      <span className="font-medium text-slate-900">{a.decision.replace(/_/g, ' ')}</span> ·{' '}
                      {a.assignedDepartment} · {a.remarks}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 3: WORK ORDERS */}
      {activeTab === 'work_orders' && (
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-semibold text-slate-900">Issue Department Maintenance Work Order</h3>
              <Hammer className="w-4 h-4 text-blue-700" />
            </div>

            <form onSubmit={handleCreateWorkOrder} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Complaint Case</label>
                <select
                  value={woComplaintId || workOrderEligibleComplaints[0]?.id || ''}
                  onChange={(e) => setWoComplaintId(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white"
                >
                  {workOrderEligibleComplaints.length === 0 ? (
                    <option value="">No officer-approved or emergency cases available</option>
                  ) : (
                    workOrderEligibleComplaints.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.complaintCode} — {c.primaryDepartment} ({c.severity})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">Department</label>
                  <select
                    value={woDept}
                    onChange={(e) => setWoDept(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white"
                  >
                    {MUNICIPAL_DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">Priority</label>
                  <select
                    value={woPriority}
                    onChange={(e) => setWoPriority(e.target.value as SeverityLevel)}
                    className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white"
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">Assigned Crew / Contractor</label>
                  <input
                    type="text"
                    value={woCrew}
                    onChange={(e) => setWoCrew(e.target.value)}
                    placeholder="Zone 1 Road Repair Squad"
                    className="w-full text-sm border border-slate-300 rounded-md px-3 py-2"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">Target Completion Date</label>
                  <input
                    type="date"
                    value={woTargetDate}
                    onChange={(e) => setWoTargetDate(e.target.value)}
                    className="w-full text-sm font-mono border border-slate-300 rounded-md px-3 py-2"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Scope of Work</label>
                <textarea
                  rows={3}
                  required
                  value={woScope}
                  onChange={(e) => setWoScope(e.target.value)}
                  placeholder="Specify repair materials, barricading, safety compliance, and completion deliverables..."
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2"
                />
              </div>

              <button
                type="submit"
                disabled={busyId === 'create-wo' || workOrderEligibleComplaints.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-md"
              >
                Issue Maintenance Work Order
              </button>
            </form>
          </div>

          <div className="xl:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">Department Work Orders Register</h3>
            </div>
            {workOrders.length === 0 ? (
              <div className="p-8 text-sm text-slate-500">No work orders issued yet.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {workOrders.map((wo) => (
                  <div key={wo.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 text-xs">
                      <div className="font-mono font-semibold text-slate-900">
                        {wo.workOrderCode} · {wo.priority} · {wo.status.replace(/_/g, ' ')}
                      </div>
                      <div className="text-slate-700">
                        {wo.department} · Crew: {wo.contractorOrCrew} · Target: {wo.targetDate}
                      </div>
                      <div className="text-slate-500">{wo.scopeOfWork}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {wo.status === 'issued' && (
                        <button
                          type="button"
                          disabled={busyId === wo.id}
                          onClick={() => void handleUpdateWoStatus(wo, 'in_progress')}
                          className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded"
                        >
                          Start Work
                        </button>
                      )}
                      {wo.status === 'in_progress' && (
                        <button
                          type="button"
                          disabled={busyId === wo.id}
                          onClick={() => void handleUpdateWoStatus(wo, 'completed')}
                          className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded"
                        >
                          Mark Completed
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 4: RESOLUTION VERIFICATION */}
      {activeTab === 'resolutions' && (
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-3">
              Verify Resolution & Notify Citizen
            </h3>
            <form onSubmit={handleVerifyResolution} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Complaint to Resolve</label>
                <select
                  value={resComplaintId || resolutionEligibleComplaints[0]?.id || ''}
                  onChange={(e) => setResComplaintId(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white"
                >
                  {resolutionEligibleComplaints.length === 0 ? (
                    <option value="">No complaints ready for resolution verification</option>
                  ) : (
                    resolutionEligibleComplaints.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.complaintCode} — {c.primaryDepartment} ({c.status.replace(/_/g, ' ')})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Linked Work Order (Optional)</label>
                <select
                  value={resWorkOrderId}
                  onChange={(e) => setResWorkOrderId(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white"
                >
                  <option value="">None / Direct Resolution</option>
                  {workOrders.map((wo) => (
                    <option key={wo.id} value={wo.id}>
                      {wo.workOrderCode} ({wo.status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">Resolution Verification Summary</label>
                <textarea
                  rows={3}
                  required
                  value={resSummary}
                  onChange={(e) => setResSummary(e.target.value)}
                  placeholder="Confirm repair quality, site clearance, and final safety inspection..."
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2"
                />
              </div>

              <button
                type="submit"
                disabled={busyId === 'verify-res' || resolutionEligibleComplaints.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-md"
              >
                Verify Resolution & Close Case
              </button>
            </form>
          </div>

          <div className="xl:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">Verified Resolution Archive ({resolutions.length})</h3>
            </div>
            {resolutions.length === 0 ? (
              <div className="p-8 text-sm text-slate-500">No resolutions verified yet.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {resolutions.map((res) => {
                  const cmp = complaintById.get(res.complaintId);
                  return (
                    <div key={res.id} className="p-5 space-y-1 text-xs">
                      <div className="font-mono font-semibold text-emerald-800">
                        {cmp?.complaintCode || res.complaintId} · Verified by {res.officerName}
                      </div>
                      <p className="text-slate-700">{res.resolutionSummary}</p>
                      <div className="text-slate-500 font-mono">
                        Resolved: {new Date(res.resolvedAt).toLocaleString()} · Citizen Notified:{' '}
                        {res.citizenNotified ? 'Yes' : 'No'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
