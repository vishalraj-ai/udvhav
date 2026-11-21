import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  Loader2,
  MapPin,
  PhoneCall,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  AccidentHotspotRecord,
  AiAnalysisRecord,
  ClassifiedIssueRecord,
  ComplaintRecord,
  DepartmentWorkOrderRecord,
  EmergencyRuleRecord,
  EvidenceRecord,
  GeminiInspectionResponse,
  InspectionReportRecord,
  IssueTaxonomyRecord,
  MunicipalOfficeRecord,
  ResolutionRecord,
  SupportedLanguage,
  TwinTrustContextResponse,
  UploadedEvidenceDraft,
  UserProfile,
} from '../types/civic';
import { SUPPORTED_LANGUAGES, UI_TRANSLATIONS } from '../i18n/translations';
import {
  inspectComplaintWithGemini,
  resolveTwinTrustContext,
  submitFullComplaintWorkflow,
  updateOwnProfile,
  uploadEvidenceImage,
} from '../services/civicService';
import { TwinTrustMap } from './TwinTrustMap';
import { SecureEvidenceImage } from './SecureEvidenceImage';

interface CitizenPortalProps {
  profile: UserProfile;
  language: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
  complaints: ComplaintRecord[];
  classifiedIssues: ClassifiedIssueRecord[];
  aiAnalyses: AiAnalysisRecord[];
  evidenceList: EvidenceRecord[];
  inspectionReports: InspectionReportRecord[];
  workOrders: DepartmentWorkOrderRecord[];
  resolutions: ResolutionRecord[];
  offices: MunicipalOfficeRecord[];
  hotspots: AccidentHotspotRecord[];
  taxonomy: IssueTaxonomyRecord[];
  emergencyRules: EmergencyRuleRecord[];
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CitizenPortal({
  profile,
  language,
  onLanguageChange,
  complaints,
  classifiedIssues,
  aiAnalyses,
  evidenceList,
  inspectionReports,
  workOrders,
  resolutions,
  offices,
  hotspots,
  taxonomy,
  emergencyRules,
}: CitizenPortalProps) {
  const t = UI_TRANSLATIONS[language] || UI_TRANSLATIONS.en;

  // Form state
  const [rawText, setRawText] = useState('');
  const [landmark, setLandmark] = useState('');
  const [latitude, setLatitude] = useState<number>(offices[0]?.latitude ?? 28.6139);
  const [longitude, setLongitude] = useState<number>(offices[0]?.longitude ?? 77.209);
  const [evidenceDrafts, setEvidenceDrafts] = useState<UploadedEvidenceDraft[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const [twinTrust, setTwinTrust] = useState<TwinTrustContextResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSubmission, setLastSubmission] = useState<{
    complaintCode: string;
    aiResult: GeminiInspectionResponse;
    emergencyIncidentId: string | null;
  } | null>(null);

  // Tracker state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'emergency' | 'resolved'>('all');
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);

  const myComplaints = useMemo(() => {
    const base = complaints.filter((c) => c.citizenUid === profile.uid);
    return base.filter((c) => {
      if (statusFilter === 'emergency' && !c.isEmergency && c.severity !== 'Critical') return false;
      if (statusFilter === 'resolved' && c.status !== 'resolved' && c.status !== 'closed') return false;
      if (statusFilter === 'active' && (c.status === 'resolved' || c.status === 'closed' || c.status === 'rejected'))
        return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.complaintCode.toLowerCase().includes(q) ||
          c.rawText.toLowerCase().includes(q) ||
          c.translatedText.toLowerCase().includes(q) ||
          c.primaryDepartment.toLowerCase().includes(q) ||
          c.wardName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [complaints, profile.uid, statusFilter, searchQuery]);

  const selectedComplaint = useMemo(
    () => myComplaints.find((c) => c.id === selectedComplaintId) || myComplaints[0] || null,
    [myComplaints, selectedComplaintId]
  );

  const handleLanguageSelect = async (nextLang: SupportedLanguage) => {
    onLanguageChange(nextLang);
    try {
      await updateOwnProfile(profile.uid, { language: nextLang });
    } catch {
      // ignore non-critical profile preference sync error
    }
  };

  const handleResolveLocation = async (lat: number, lng: number) => {
    setResolvingLocation(true);
    setErrorMessage(null);
    try {
      const ctx = await resolveTwinTrustContext(lat, lng, offices, hotspots);
      setTwinTrust(ctx);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to resolve road and ward context.');
    } finally {
      setResolvingLocation(false);
    }
  };

  const handlePickMap = (lat: number, lng: number) => {
    setLatitude(lat);
    setLongitude(lng);
    void handleResolveLocation(lat, lng);
  };

  const handleUseBrowserGps = () => {
    if (!navigator.geolocation) {
      setErrorMessage('Browser geolocation is unavailable. Click directly on the OpenStreetMap to pin location.');
      return;
    }
    setResolvingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setLatitude(lat);
        setLongitude(lng);
        void handleResolveLocation(lat, lng);
      },
      () => {
        setResolvingLocation(false);
        setErrorMessage('Location permission denied. Click on the OpenStreetMap to place the complaint pin manually.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (evidenceDrafts.length >= 4) {
      setErrorMessage('Maximum 4 photographs can be attached per complaint.');
      return;
    }
    setUploadingPhoto(true);
    setErrorMessage(null);
    try {
      const knownHashes = [
        ...evidenceList.map((ev) => ev.sha256),
        ...evidenceDrafts.map((ev) => ev.sha256),
      ];
      const uploaded = await uploadEvidenceImage(file, latitude, longitude, knownHashes);
      setEvidenceDrafts((prev) => [...prev, uploaded]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rawText.trim().length < 5) {
      setErrorMessage('Please describe the civic issue in at least 5 characters.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setLastSubmission(null);

    try {
      // 1. Ensure TwinTrust jurisdiction & OpenStreetMap road matching are resolved before routing
      let resolvedContext = twinTrust;
      if (!resolvedContext || Math.abs(resolvedContext.latitude - latitude) > 0.0001 || Math.abs(resolvedContext.longitude - longitude) > 0.0001) {
        resolvedContext = await resolveTwinTrustContext(latitude, longitude, offices, hotspots);
        setTwinTrust(resolvedContext);
      }

      // 2. Server-side Gemini multimodal inspection + deterministic EmergencyGuard
      const aiResult = await inspectComplaintWithGemini({
        rawText: rawText.trim(),
        language,
        landmark: landmark.trim(),
        latitude,
        longitude,
        evidenceDrafts,
        taxonomy,
        emergencyRules,
      });

      // 3. Persist complaint, AI analysis, multi-issue records, ImageGuard evidence, assignments, emergency incidents, notifications & audit logs
      const saved = await submitFullComplaintWorkflow({
        profile,
        rawText: rawText.trim(),
        language,
        landmark: landmark.trim(),
        latitude,
        longitude,
        evidenceDrafts,
        aiResult,
        twinTrust: resolvedContext,
      });

      setLastSubmission({
        complaintCode: saved.complaintCode,
        aiResult,
        emergencyIncidentId: saved.emergencyIncidentId,
      });
      setSelectedComplaintId(saved.complaintId);
      setRawText('');
      setLandmark('');
      setEvidenceDrafts([]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to analyze and submit complaint.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedIssues = selectedComplaint
    ? classifiedIssues.filter((i) => i.complaintId === selectedComplaint.id)
    : [];
  const selectedAi = selectedComplaint
    ? aiAnalyses.find((a) => a.complaintId === selectedComplaint.id) || null
    : null;
  const selectedEvidence = selectedComplaint
    ? evidenceList.filter((ev) => ev.complaintId === selectedComplaint.id)
    : [];
  const selectedMfir = selectedComplaint
    ? inspectionReports.find((r) => r.complaintId === selectedComplaint.id) || null
    : null;
  const selectedWorkOrders = selectedComplaint
    ? workOrders.filter((w) => w.complaintId === selectedComplaint.id)
    : [];
  const selectedResolution = selectedComplaint
    ? resolutions.find((r) => r.complaintId === selectedComplaint.id) || null
    : null;

  return (
    <div className="space-y-8">
      {/* Top Emergency 112 Guidance & Regional Language Control */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <PhoneCall className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-red-700">{t.emergencyBannerTitle}</h2>
            <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">{t.emergencyBannerBody}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="citizen-lang" className="text-xs font-medium text-slate-600 whitespace-nowrap">
            {t.selectLanguage}
          </label>
          <select
            id="citizen-lang"
            value={language}
            onChange={(e) => void handleLanguageSelect(e.target.value as SupportedLanguage)}
            className="text-sm bg-slate-50 border border-slate-300 rounded-md px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeLabel} ({l.englishLabel})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Submission + TwinTrust Split Layout */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{t.submitComplaintTitle}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Single complaint supports multiple distinct municipal issues, regional language processing, ImageGuard verification, and TwinTrust jurisdiction routing.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmitComplaint} className="p-6 grid grid-cols-1 xl:grid-cols-12 gap-8">
          {/* Left Column: Text, Landmark, ImageGuard Photo Upload */}
          <div className="xl:col-span-6 space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="complaint-text" className="block text-sm font-medium text-slate-800">
                {t.describeIssueLabel}
              </label>
              <textarea
                id="complaint-text"
                rows={4}
                required
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={t.describeIssuePlaceholder}
                className="w-full rounded-md border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <p className="text-xs text-slate-500">
                You may describe multiple problems together (for example, a broken streetlight and an overflowing drain); Gemini AI will separate and classify each issue to its responsible department.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="complaint-landmark" className="block text-sm font-medium text-slate-800">
                {t.landmarkLabel}
              </label>
              <input
                id="complaint-landmark"
                type="text"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                placeholder={t.landmarkPlaceholder}
                className="w-full rounded-md border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {/* ImageGuard Upload Zone */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">{t.uploadEvidenceLabel}</span>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md cursor-pointer transition-colors whitespace-nowrap">
                  {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {uploadingPhoto ? 'Hashing & Inspecting EXIF...' : 'Add Photograph'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadingPhoto}
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {evidenceDrafts.length === 0 ? (
                <p className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-md p-4">
                  Optional: Upload JPEG, PNG, or WebP site photos (max 8 MB). ImageGuard computes SHA-256 hashes, checks duplicates, inspects EXIF metadata, and forwards images to Gemini visual review.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
                  {evidenceDrafts.map((ev, idx) => (
                    <div key={ev.storageFileName} className="p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">{ev.originalName}</div>
                          <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5 truncate">
                            SHA-256: {ev.sha256.slice(0, 24)}… · {(ev.fileSize / 1024).toFixed(1)} KB
                          </div>
                          <div className="text-xs text-slate-600 mt-1">
                            Camera: {ev.exifCamera} · Capture: {ev.exifTimestamp}
                            {ev.hasExifGps ? ` · EXIF GPS Delta: ${ev.gpsMismatchMeters}m` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEvidenceDrafts((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                          aria-label="Remove photograph"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {ev.suspiciousFlag && (
                        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2.5 space-y-1">
                          <div className="font-medium flex items-center gap-1.5">
                            <FileWarning className="w-3.5 h-3.5 shrink-0" />
                            Flagged for Human Inspector Review (Advisory)
                          </div>
                          <ul className="list-disc pl-4 space-y-0.5">
                            {ev.suspiciousReasons.map((r, rIdx) => (
                              <li key={rIdx}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {errorMessage && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
                {errorMessage}
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting || uploadingPhoto}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {submitting ? 'Running Gemini AI, ImageGuard & TwinTrust...' : t.analyzeAndSubmit}
              </button>
            </div>
          </div>

          {/* Right Column: TwinTrust Interactive OpenStreetMap & Jurisdiction Context */}
          <div className="xl:col-span-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">TwinTrust Location & Ward Jurisdiction</h3>
                <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                  GPS: {latitude.toFixed(6)}, {longitude.toFixed(6)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUseBrowserGps}
                  disabled={resolvingLocation}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors whitespace-nowrap"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {t.useMyGps}
                </button>
                <button
                  type="button"
                  onClick={() => void handleResolveLocation(latitude, longitude)}
                  disabled={resolvingLocation}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors whitespace-nowrap"
                >
                  {resolvingLocation ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Verify Road & Ward
                </button>
              </div>
            </div>

            <TwinTrustMap
              centerLat={latitude}
              centerLng={longitude}
              selectedLat={latitude}
              selectedLng={longitude}
              interactivePick
              onPickLocation={handlePickMap}
              offices={offices}
              hotspots={hotspots}
              heightClass="h-72"
            />

            {twinTrust && (
              <div className="border-t border-slate-200 pt-3 space-y-2 text-xs text-slate-700">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500">Matched Road (OSM): </span>
                    <span className="font-medium text-slate-900">{twinTrust.roadName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Jurisdiction Ward: </span>
                    <span className="font-medium text-slate-900">
                      {twinTrust.matchedOffice
                        ? `${twinTrust.matchedOffice.wardName} (${twinTrust.matchedOffice.officeName})`
                        : 'No imported ward matches yet'}
                    </span>
                  </div>
                </div>
                {twinTrust.nearbyHotspots.length > 0 && (
                  <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded p-2.5">
                    <span className="font-medium">Verified Accident Hotspot Proximity: </span>
                    {twinTrust.nearbyHotspots[0].locationName} ({twinTrust.nearbyHotspots[0].distanceMeters}m away ·{' '}
                    {twinTrust.nearbyHotspots[0].incidentCount} recorded incidents · Source:{' '}
                    {twinTrust.nearbyHotspots[0].sourceDataset})
                  </div>
                )}
                <p className="text-slate-500">{twinTrust.infrastructureNote}</p>
              </div>
            )}
          </div>
        </form>

        {/* Immediate Post-Submission Gemini + EmergencyGuard Summary */}
        {lastSubmission && (
          <div className="border-t border-slate-200 p-6 bg-slate-50 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {lastSubmission.aiResult.emergencyFlag ? (
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                )}
                <h3 className="text-sm font-semibold text-slate-900">
                  Complaint Registered: <span className="font-mono">{lastSubmission.complaintCode}</span>
                </h3>
              </div>
              <div className="text-xs text-slate-600">
                Severity: <strong className={lastSubmission.aiResult.recommendedSeverity === 'Critical' ? 'text-red-700' : 'text-slate-900'}>{lastSubmission.aiResult.recommendedSeverity}</strong> ·{' '}
                Issues Extracted: <span className="font-mono tabular-nums">{lastSubmission.aiResult.classifiedIssues.length}</span> ·{' '}
                Model: <span className="font-mono">{lastSubmission.aiResult.model}</span>
              </div>
            </div>

            {lastSubmission.aiResult.emergencyFlag && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4 space-y-1.5 text-sm text-red-900">
                <div className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                  EmergencyGuard Critical Escalation Triggered ({lastSubmission.aiResult.triggerSource.replace('_', ' ')})
                </div>
                <p className="text-xs leading-relaxed">{lastSubmission.aiResult.call112Guidance}</p>
                <p className="text-xs text-red-800">
                  Reason: {lastSubmission.aiResult.emergencyReason} · Critical Incident ID:{' '}
                  <span className="font-mono">{lastSubmission.emergencyIncidentId}</span> (routed directly to the authorized on-duty municipal officer with parallel inspector assignment).
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-700">
              <div className="space-y-1.5">
                <div className="font-semibold text-slate-900">Gemini Inspection Summary</div>
                <p>{lastSubmission.aiResult.englishSummary}</p>
                <p className="text-slate-600">{lastSubmission.aiResult.observations}</p>
                <p className="text-slate-500 italic">{lastSubmission.aiResult.advisoryDisclaimer}</p>
              </div>
              <div className="space-y-1.5">
                <div className="font-semibold text-slate-900">Hierarchical Multi-Issue Classification</div>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-md bg-white">
                  {lastSubmission.aiResult.classifiedIssues.map((iss, idx) => (
                    <div key={idx} className="p-2.5 space-y-0.5">
                      <div className="font-medium text-slate-900">
                        <span className="font-mono text-blue-700">{iss.canonicalCode}</span> · {iss.domain} / {iss.category} / {iss.subcategory}
                      </div>
                      <div className="text-slate-600">
                        Department: {iss.department} · Severity: {iss.recommendedSeverity} · Confidence:{' '}
                        <span className="font-mono tabular-nums">{Math.round(iss.confidence * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Citizen Complaint Tracking Section */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{t.myComplaintsTitle}</h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {myComplaints.length} complaint record(s) visible in your account
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search code, department, text..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
              {(['all', 'active', 'emergency', 'resolved'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    statusFilter === tab ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {myComplaints.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">{t.noComplaintsYet}</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-slate-200">
            {/* Complaint List Table */}
            <div className="xl:col-span-6 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                    <th className="py-2.5 px-4">Code & Department</th>
                    <th className="py-2.5 px-4">Severity</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {myComplaints.map((c) => {
                    const isSelected = selectedComplaint?.id === c.id;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setSelectedComplaintId(c.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="font-mono text-xs font-semibold text-slate-900">{c.complaintCode}</div>
                          <div className="text-xs text-slate-600 truncate max-w-[230px]">{c.primaryDepartment}</div>
                          <div className="text-xs text-slate-400 truncate max-w-[230px]">{c.wardName}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-xs font-semibold ${
                              c.severity === 'Critical'
                                ? 'text-red-700'
                                : c.severity === 'High'
                                ? 'text-amber-700'
                                : 'text-slate-700'
                            }`}
                          >
                            {c.severity}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700">{formatStatusLabel(c.status)}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                          {c.issueCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Complaint Detail Dossier */}
            <div className="xl:col-span-6 p-6 space-y-5">
              {selectedComplaint && (
                <>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-semibold text-slate-900 font-mono">
                        {selectedComplaint.complaintCode}
                      </h3>
                      <span className="text-xs font-medium text-slate-600">
                        {formatStatusLabel(selectedComplaint.status)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {selectedComplaint.wardName} · {selectedComplaint.officeName} · {selectedComplaint.roadName}
                    </div>
                  </div>

                  <div className="space-y-2 text-sm text-slate-800">
                    <p>{selectedComplaint.rawText}</p>
                    {selectedComplaint.translatedText && selectedComplaint.translatedText !== selectedComplaint.rawText && (
                      <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2.5">
                        <strong>English Translation:</strong> {selectedComplaint.translatedText}
                      </p>
                    )}
                  </div>

                  {selectedAi && (
                    <div className="border-t border-slate-200 pt-4 space-y-1.5 text-xs text-slate-700">
                      <div className="font-semibold text-slate-900">Gemini AI Triage ({selectedAi.model})</div>
                      <p>{selectedAi.englishSummary}</p>
                      {selectedAi.imageObservations && <p className="text-slate-600">Visual note: {selectedAi.imageObservations}</p>}
                    </div>
                  )}

                  {selectedIssues.length > 0 && (
                    <div className="border-t border-slate-200 pt-4 space-y-2">
                      <div className="text-xs font-semibold text-slate-900">
                        Classified Issues ({selectedIssues.length})
                      </div>
                      <div className="space-y-2">
                        {selectedIssues.map((iss) => (
                          <div key={iss.id} className="text-xs text-slate-700 flex flex-col gap-0.5">
                            <div>
                              <span className="font-mono font-medium text-blue-700">{iss.canonicalCode}</span> ·{' '}
                              {iss.domain} / {iss.category} / {iss.subcategory}
                            </div>
                            <div className="text-slate-500">
                              {iss.department} · {iss.recommendedSeverity}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedEvidence.length > 0 && (
                    <div className="border-t border-slate-200 pt-4 space-y-2">
                      <div className="text-xs font-semibold text-slate-900">
                        Uploaded Evidence ({selectedEvidence.length})
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {selectedEvidence.map((ev) => (
                          <div key={ev.id} className="space-y-1.5">
                            <SecureEvidenceImage storageUrl={ev.storageUrl} alt={ev.fileName} className="w-full h-36 object-cover rounded-md border border-slate-200" />
                            <div className="text-xs text-slate-600 font-mono truncate">
                              SHA-256: {ev.sha256.slice(0, 16)}…
                            </div>
                            <div className="text-xs text-slate-500">
                              Review: {formatStatusLabel(ev.reviewStatus)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedMfir && (
                    <div className="border-t border-slate-200 pt-4 space-y-1 text-xs text-slate-700">
                      <div className="font-semibold text-slate-900">
                        Municipal Field Inspection Report (MFIR) · {formatStatusLabel(selectedMfir.status)}
                      </div>
                      <p>
                        Inspector {selectedMfir.inspectorName}: {selectedMfir.siteNotes}
                      </p>
                      <div className="text-slate-500">
                        Verification: {formatStatusLabel(selectedMfir.physicalVerification)} · Final Priority:{' '}
                        {selectedMfir.finalPriority}
                      </div>
                    </div>
                  )}

                  {selectedWorkOrders.length > 0 && (
                    <div className="border-t border-slate-200 pt-4 space-y-1.5 text-xs text-slate-700">
                      <div className="font-semibold text-slate-900">Department Maintenance Work Orders</div>
                      {selectedWorkOrders.map((wo) => (
                        <div key={wo.id}>
                          <span className="font-mono font-medium">{wo.workOrderCode}</span> · {wo.department} ·{' '}
                          {formatStatusLabel(wo.status)} · Crew: {wo.contractorOrCrew || 'Municipal Crew'}
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedResolution && (
                    <div className="border-t border-slate-200 pt-4 space-y-1 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md p-3">
                      <div className="font-semibold">Verified Resolution ({selectedResolution.officerName})</div>
                      <p>{selectedResolution.resolutionSummary}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
