import React, { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, FileWarning, Loader2, ShieldAlert } from 'lucide-react';
import type {
  AccidentHotspotRecord,
  AiAnalysisRecord,
  ClassifiedIssueRecord,
  ComplaintRecord,
  EvidenceRecord,
  InspectionReportRecord,
  InspectorAssignmentRecord,
  MunicipalOfficeRecord,
  SeverityLevel,
  UserProfile,
} from '../types/civic';
import { MUNICIPAL_DEPARTMENTS } from '../data/municipalDefaults';
import { reviewEvidenceAsHuman, submitInspectionReportMfir } from '../services/civicService';
import { SecureEvidenceImage } from './SecureEvidenceImage';
import { TwinTrustMap } from './TwinTrustMap';

interface InspectorPortalProps {
  profile: UserProfile;
  complaints: ComplaintRecord[];
  assignments: InspectorAssignmentRecord[];
  classifiedIssues: ClassifiedIssueRecord[];
  aiAnalyses: AiAnalysisRecord[];
  evidenceList: EvidenceRecord[];
  inspectionReports: InspectionReportRecord[];
  offices: MunicipalOfficeRecord[];
  hotspots: AccidentHotspotRecord[];
}

export function InspectorPortal({
  profile,
  complaints,
  assignments,
  classifiedIssues,
  aiAnalyses,
  evidenceList,
  inspectionReports,
  offices,
  hotspots,
}: InspectorPortalProps) {
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<'all' | SeverityLevel>('all');

  // MFIR Form state
  const [physicalVerification, setPhysicalVerification] =
    useState<InspectionReportRecord['physicalVerification']>('verified_on_site');
  const [evidenceReviewOutcome, setEvidenceReviewOutcome] =
    useState<InspectionReportRecord['evidenceReviewOutcome']>('evidence_consistent');
  const [finalPriority, setFinalPriority] = useState<SeverityLevel>('Medium');
  const [recommendedDepartment, setRecommendedDepartment] = useState<string>(MUNICIPAL_DEPARTMENTS[0]);
  const [estimatedCostInr, setEstimatedCostInr] = useState<string>('15000');
  const [requiresWorkOrder, setRequiresWorkOrder] = useState<boolean>(true);
  const [siteNotes, setSiteNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const visibleComplaints = useMemo(() => {
    const base =
      profile.role === 'admin'
        ? complaints
        : complaints.filter((c) => c.assignedInspectorUid === profile.uid);
    return base.filter((c) => (priorityFilter === 'all' ? true : c.severity === priorityFilter));
  }, [complaints, profile.role, profile.uid, priorityFilter]);

  const activeComplaint = useMemo(
    () => visibleComplaints.find((c) => c.id === selectedComplaintId) || visibleComplaints[0] || null,
    [visibleComplaints, selectedComplaintId]
  );

  const activeAssignment = activeComplaint
    ? assignments.find((a) => a.complaintId === activeComplaint.id) || null
    : null;
  const activeAi = activeComplaint ? aiAnalyses.find((a) => a.complaintId === activeComplaint.id) || null : null;
  const activeIssues = activeComplaint
    ? classifiedIssues.filter((i) => i.complaintId === activeComplaint.id)
    : [];
  const activeEvidence = activeComplaint
    ? evidenceList.filter((e) => e.complaintId === activeComplaint.id)
    : [];
  const existingReports = activeComplaint
    ? inspectionReports.filter((r) => r.complaintId === activeComplaint.id)
    : [];

  const handleSelectCase = (c: ComplaintRecord) => {
    setSelectedComplaintId(c.id);
    setFinalPriority(c.severity);
    setRecommendedDepartment(c.primaryDepartment || MUNICIPAL_DEPARTMENTS[0]);
    setEvidenceReviewOutcome(
      c.evidenceCount === 0
        ? 'no_photo_submitted'
        : c.hasSuspiciousEvidence
        ? 'suspicious_needs_inquiry'
        : 'evidence_consistent'
    );
    setFeedback(null);
  };

  const handleEvidenceReview = async (evidenceId: string, verified: boolean) => {
    setReviewingId(evidenceId);
    setFeedback(null);
    try {
      await reviewEvidenceAsHuman({
        evidenceId,
        reviewStatus: verified ? 'verified_human' : 'flagged_unverified',
        suspiciousFlag: !verified,
        actorUid: profile.uid,
        actorRole: profile.role,
      });
      setFeedback({
        type: 'success',
        text: verified ? 'Evidence marked verified after human inspector review.' : 'Evidence flagged for municipal inquiry.',
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update evidence review.' });
    } finally {
      setReviewingId(null);
    }
  };

  const handleSubmitMfir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeComplaint) return;
    if (siteNotes.trim().length < 5) {
      setFeedback({ type: 'error', text: 'Enter professional site inspection remarks (at least 5 characters).' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const reportId = await submitInspectionReportMfir({
        complaint: activeComplaint,
        assignmentId: activeAssignment?.id || '',
        inspector: profile,
        physicalVerification,
        siteNotes: siteNotes.trim(),
        evidenceReviewOutcome,
        finalPriority,
        recommendedDepartment,
        estimatedCostInr: Number(estimatedCostInr) || 0,
        requiresWorkOrder,
      });
      setSiteNotes('');
      setFeedback({
        type: 'success',
        text: `Municipal Field Inspection Report (${reportId}) submitted to the Municipal Officer for approval.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to submit MFIR.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Header Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Assigned Cases</div>
          <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
            {visibleComplaints.length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Critical / Parallel Emergency</div>
          <div className="text-2xl font-semibold text-red-700 font-mono tabular-nums mt-1">
            {visibleComplaints.filter((c) => c.severity === 'Critical' || c.isEmergency).length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Flagged Evidence Cases</div>
          <div className="text-2xl font-semibold text-amber-700 font-mono tabular-nums mt-1">
            {visibleComplaints.filter((c) => c.hasSuspiciousEvidence).length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">MFIRs Submitted</div>
          <div className="text-2xl font-semibold text-emerald-700 font-mono tabular-nums mt-1">
            {inspectionReports.length}
          </div>
        </div>
      </div>

      {/* Main Split Queue + Evidence Dossier + MFIR Form */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Case Queue */}
        <section className="xl:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Field Inspection Queue</h2>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as 'all' | SeverityLevel)}
              className="text-xs bg-slate-50 border border-slate-300 rounded px-2 py-1 text-slate-700"
            >
              <option value="all">All Severities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          {visibleComplaints.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No cases are currently assigned to this inspector queue.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[760px] overflow-y-auto">
              {visibleComplaints.map((c) => {
                const isSelected = activeComplaint?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectCase(c)}
                    className={`w-full text-left p-4 transition-colors ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-900">{c.complaintCode}</span>
                      <span
                        className={`text-xs font-semibold ${
                          c.severity === 'Critical'
                            ? 'text-red-700'
                            : c.severity === 'High'
                            ? 'text-amber-700'
                            : 'text-slate-600'
                        }`}
                      >
                        {c.severity}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-slate-800 mt-1 truncate">{c.primaryDepartment}</div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">
                      {c.wardName} · {c.status.replace(/_/g, ' ')}
                    </div>
                    {c.hasSuspiciousEvidence && (
                      <div className="text-xs text-amber-700 mt-1">ImageGuard review required</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Full Dossier + MFIR Authoring */}
        <section className="xl:col-span-8 space-y-6">
          {!activeComplaint ? (
            <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500">
              Select a complaint from the Field Inspection Queue to inspect the full Citizen, Gemini AI, ImageGuard, and TwinTrust dossier.
            </div>
          ) : (
            <>
              {/* Citizen + Gemini Evidence Dossier */}
              <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-slate-900 font-mono">
                        {activeComplaint.complaintCode}
                      </h2>
                      {activeComplaint.isEmergency && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                          <ShieldAlert className="w-4 h-4" />
                          Critical Emergency Parallel Inspection
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Citizen: {activeComplaint.citizenName} · Ward: {activeComplaint.wardName} · Road:{' '}
                      {activeComplaint.roadName} · Landmark: {activeComplaint.landmark || 'None provided'}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-600 font-mono tabular-nums">
                    <div>Status: {activeComplaint.status.replace(/_/g, ' ')}</div>
                    <div>
                      GPS: {activeComplaint.latitude.toFixed(5)}, {activeComplaint.longitude.toFixed(5)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm">
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-slate-900">Original Citizen Report ({activeComplaint.language})</h3>
                    <p className="text-slate-800 leading-relaxed">{activeComplaint.rawText}</p>
                    {activeComplaint.translatedText && (
                      <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-3">
                        <div className="font-medium text-slate-800 mb-0.5">English Translation</div>
                        {activeComplaint.translatedText}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-slate-900">
                      Gemini AI Observations {activeAi ? `(${activeAi.model})` : ''}
                    </h3>
                    {activeAi ? (
                      <div className="space-y-1.5 text-xs text-slate-700">
                        <p>{activeAi.englishSummary}</p>
                        <p className="text-slate-600">{activeAi.observations}</p>
                        {activeAi.imageObservations && (
                          <p className="text-slate-600">
                            <strong>Visual Note:</strong> {activeAi.imageObservations}
                          </p>
                        )}
                        <p className="text-slate-500 italic">{activeAi.advisoryDisclaimer}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">No AI analysis record linked.</p>
                    )}
                  </div>
                </div>

                {/* Multi-issue classification breakdown */}
                {activeIssues.length > 0 && (
                  <div className="border-t border-slate-200 pt-4 space-y-2">
                    <h3 className="text-xs font-semibold text-slate-900">
                      Standardized Classified Issues ({activeIssues.length})
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-2 pr-3">Code</th>
                            <th className="py-2 pr-3">Hierarchy</th>
                            <th className="py-2 pr-3">Department</th>
                            <th className="py-2 text-right">Severity / Conf.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {activeIssues.map((iss) => (
                            <tr key={iss.id}>
                              <td className="py-2 pr-3 font-mono font-semibold text-blue-700">{iss.canonicalCode}</td>
                              <td className="py-2 pr-3 text-slate-800">
                                {iss.domain} / {iss.category} / {iss.subcategory}
                              </td>
                              <td className="py-2 pr-3 text-slate-600">{iss.department}</td>
                              <td className="py-2 text-right font-mono tabular-nums text-slate-700">
                                {iss.recommendedSeverity} ({Math.round(iss.confidence * 100)}%)
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ImageGuard Evidence Verification Panel */}
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-900">
                      ImageGuard Forensic Evidence Dossier ({activeEvidence.length})
                    </h3>
                    <span className="text-xs text-slate-500">
                      Human inspector verification is authoritative — AI checks are advisory only.
                    </span>
                  </div>

                  {activeEvidence.length === 0 ? (
                    <p className="text-xs text-slate-500">No photographs were uploaded with this complaint.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {activeEvidence.map((ev) => (
                        <div key={ev.id} className="border border-slate-200 rounded-md p-3.5 space-y-2.5">
                          <SecureEvidenceImage
                            storageUrl={ev.storageUrl}
                            alt={ev.fileName}
                            className="w-full h-44 object-cover rounded border border-slate-200"
                          />
                          <div className="text-xs space-y-1">
                            <div className="font-medium text-slate-900 truncate">{ev.fileName}</div>
                            <div className="font-mono text-slate-500 break-all">SHA-256: {ev.sha256}</div>
                            <div className="text-slate-600">
                              Camera: {ev.exifCamera} · Capture: {ev.exifTimestamp}
                              {ev.hasExifGps ? ` · EXIF GPS Delta: ${ev.gpsMismatchMeters}m` : ' · No EXIF GPS'}
                            </div>
                            <div className="text-slate-600">
                              Duplicate: {ev.isDuplicate ? 'Yes (SHA-256 matched earlier upload)' : 'No'} · Review Status:{' '}
                              <strong>{ev.reviewStatus.replace(/_/g, ' ')}</strong>
                            </div>
                          </div>

                          {ev.suspiciousReasons.length > 0 && (
                            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 space-y-0.5">
                              <div className="font-medium flex items-center gap-1">
                                <FileWarning className="w-3.5 h-3.5" /> Advisory Flags
                              </div>
                              {ev.suspiciousReasons.map((r, i) => (
                                <div key={i}>• {r}</div>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              disabled={reviewingId === ev.id}
                              onClick={() => void handleEvidenceReview(ev.id, true)}
                              className="px-2.5 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors"
                            >
                              Mark Verified on Site
                            </button>
                            <button
                              type="button"
                              disabled={reviewingId === ev.id}
                              onClick={() => void handleEvidenceReview(ev.id, false)}
                              className="px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-colors"
                            >
                              Flag for Inquiry
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* TwinTrust Site Map */}
                <div className="border-t border-slate-200 pt-4">
                  <TwinTrustMap
                    centerLat={activeComplaint.latitude}
                    centerLng={activeComplaint.longitude}
                    selectedLat={activeComplaint.latitude}
                    selectedLng={activeComplaint.longitude}
                    offices={offices}
                    hotspots={hotspots}
                    complaints={[activeComplaint]}
                    heightClass="h-56"
                  />
                </div>
              </div>

              {/* Municipal Field Inspection Report (MFIR) Form */}
              <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Municipal Field Inspection Report (MFIR)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Record physical site verification, human evidence review, final priority, and departmental action recommendation.
                    </p>
                  </div>
                  <ClipboardCheck className="w-5 h-5 text-blue-700" />
                </div>

                {existingReports.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-2 text-xs">
                    <div className="font-semibold text-slate-900">Previous MFIR Filing(s)</div>
                    {existingReports.map((r) => (
                      <div key={r.id} className="text-slate-700 space-y-0.5">
                        <div>
                          <span className="font-mono">{r.id}</span> · Status: <strong>{r.status}</strong> · Priority:{' '}
                          {r.finalPriority} · Est. ₹{r.estimatedCostInr.toLocaleString('en-IN')}
                        </div>
                        <div className="text-slate-600">{r.siteNotes}</div>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={handleSubmitMfir} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-700">Physical Verification</label>
                      <select
                        value={physicalVerification}
                        onChange={(e) =>
                          setPhysicalVerification(e.target.value as InspectionReportRecord['physicalVerification'])
                        }
                        className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
                      >
                        <option value="verified_on_site">Verified On-Site</option>
                        <option value="hazardous_confirmed">Hazardous Condition Confirmed</option>
                        <option value="partially_verified">Partially Verified</option>
                        <option value="not_found">Not Found / Unsubstantiated</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-700">Evidence Review Outcome</label>
                      <select
                        value={evidenceReviewOutcome}
                        onChange={(e) =>
                          setEvidenceReviewOutcome(e.target.value as InspectionReportRecord['evidenceReviewOutcome'])
                        }
                        className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
                      >
                        <option value="evidence_consistent">Evidence Consistent with Site</option>
                        <option value="suspicious_needs_inquiry">Suspicious Evidence — Needs Inquiry</option>
                        <option value="no_photo_submitted">No Photograph Submitted</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-700">Final Priority</label>
                      <select
                        value={finalPriority}
                        onChange={(e) => setFinalPriority(e.target.value as SeverityLevel)}
                        className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
                      >
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-700">Recommended Department</label>
                      <select
                        value={recommendedDepartment}
                        onChange={(e) => setRecommendedDepartment(e.target.value)}
                        className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
                      >
                        {MUNICIPAL_DEPARTMENTS.map((dept) => (
                          <option key={dept} value={dept}>
                            {dept}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-700">Estimated Repair Cost (INR)</label>
                      <input
                        type="number"
                        min={0}
                        step={500}
                        value={estimatedCostInr}
                        onChange={(e) => setEstimatedCostInr(e.target.value)}
                        className="w-full text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900"
                      />
                    </div>

                    <div className="flex items-end pb-2">
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={requiresWorkOrder}
                          onChange={(e) => setRequiresWorkOrder(e.target.checked)}
                          className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                        />
                        Requires Maintenance Work Order
                      </label>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700">
                      Professional Field Inspection Remarks
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={siteNotes}
                      onChange={(e) => setSiteNotes(e.target.value)}
                      placeholder="Document physical measurements, hazard containment, utility coordination, and recommended remediation steps..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  {feedback && (
                    <div
                      className={`text-xs rounded-md p-3 border flex items-center gap-2 ${
                        feedback.type === 'success'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}
                    >
                      {feedback.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                      {feedback.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Submit MFIR to Municipal Officer
                  </button>
                </form>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
