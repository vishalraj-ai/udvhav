import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'citizen' | 'inspector' | 'officer' | 'admin';
export type SupportedLanguage = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'mr' | 'bn' | 'gu';
export type SeverityLevel = 'Critical' | 'High' | 'Medium' | 'Low';
export type ComplaintStatus =
  | 'submitted'
  | 'ai_analyzed'
  | 'emergency_escalated'
  | 'inspector_assigned'
  | 'inspected_mfir'
  | 'officer_approved'
  | 'work_order_issued'
  | 'resolved'
  | 'closed'
  | 'rejected';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  language: SupportedLanguage;
  department: string;
  wardId: string;
  phone: string;
  onDuty: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ComplaintRecord {
  id: string;
  complaintCode: string;
  citizenUid: string;
  citizenName: string;
  language: SupportedLanguage;
  rawText: string;
  translatedText: string;
  landmark: string;
  latitude: number;
  longitude: number;
  roadName: string;
  wardId: string;
  wardName: string;
  officeId: string;
  officeName: string;
  primaryDepartment: string;
  severity: SeverityLevel;
  status: ComplaintStatus;
  isEmergency: boolean;
  issueCount: number;
  evidenceCount: number;
  hasSuspiciousEvidence: boolean;
  assignedInspectorUid: string;
  assignedOfficerUid: string;
  backupOfficerUid: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface IssueTaxonomyRecord {
  id: string;
  code: string;
  domain: string;
  category: string;
  subcategory: string;
  department: string;
  defaultSeverity: SeverityLevel;
  emergencyTrigger: boolean;
  slaHours: number;
  active: boolean;
  recordScope: 'municipal_reference';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ClassifiedIssueRecord {
  id: string;
  complaintId: string;
  citizenUid: string;
  assignedInspectorUid: string;
  assignedOfficerUid: string;
  canonicalCode: string;
  domain: string;
  category: string;
  subcategory: string;
  department: string;
  description: string;
  recommendedSeverity: SeverityLevel;
  confidence: number;
  createdAt?: Timestamp | null;
}

export interface AiAnalysisRecord {
  id: string;
  complaintId: string;
  citizenUid: string;
  assignedInspectorUid: string;
  assignedOfficerUid: string;
  model: string;
  detectedLanguage: string;
  englishSummary: string;
  observations: string;
  recommendedSeverity: SeverityLevel;
  emergencyFlag: boolean;
  emergencyReason: string;
  imageObservations: string;
  suspiciousVisualFlags: string[];
  advisoryDisclaimer: string;
  createdAt?: Timestamp | null;
}

export interface EvidenceRecord {
  id: string;
  complaintId: string;
  citizenUid: string;
  assignedInspectorUid: string;
  assignedOfficerUid: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  storageType: 'server_local' | 'firebase_storage';
  storageUrl: string;
  isDuplicate: boolean;
  duplicateOfEvidenceId: string;
  exifCamera: string;
  exifTimestamp: string;
  exifGpsLat: number;
  exifGpsLng: number;
  hasExifGps: boolean;
  gpsMismatchMeters: number;
  suspiciousFlag: boolean;
  suspiciousReasons: string[];
  reviewStatus: 'pending_review' | 'verified_human' | 'flagged_unverified';
  aiVisualNote: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface AccidentHotspotRecord {
  id: string;
  recordCode: string;
  locationName: string;
  roadName: string;
  wardId: string;
  latitude: number;
  longitude: number;
  incidentCount: number;
  fatalities: number;
  injuries: number;
  sourceDataset: string;
  verifiedDate: string;
  recordScope: 'municipal_reference';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface MunicipalOfficeRecord {
  id: string;
  officeCode: string;
  officeName: string;
  department: string;
  wardId: string;
  wardName: string;
  address: string;
  latitude: number;
  longitude: number;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  contactPhone: string;
  primaryOfficerUid: string;
  primaryOfficerName: string;
  backupOfficerUid: string;
  backupOfficerName: string;
  inspectorUid: string;
  inspectorName: string;
  recordScope: 'municipal_reference';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface InspectorAssignmentRecord {
  id: string;
  complaintId: string;
  citizenUid: string;
  inspectorUid: string;
  inspectorName: string;
  assignedOfficerUid: string;
  assignedByUid: string;
  priority: SeverityLevel;
  status: 'assigned' | 'in_progress' | 'completed';
  dueAt: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface InspectionReportRecord {
  id: string;
  complaintId: string;
  assignmentId: string;
  citizenUid: string;
  inspectorUid: string;
  inspectorName: string;
  assignedOfficerUid: string;
  physicalVerification: 'verified_on_site' | 'partially_verified' | 'not_found' | 'hazardous_confirmed';
  siteNotes: string;
  evidenceReviewOutcome: 'evidence_consistent' | 'suspicious_needs_inquiry' | 'no_photo_submitted';
  finalPriority: SeverityLevel;
  recommendedDepartment: string;
  estimatedCostInr: number;
  requiresWorkOrder: boolean;
  status: 'submitted' | 'approved' | 'revision_requested';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface EmergencyIncidentRecord {
  id: string;
  complaintId: string;
  citizenUid: string;
  title: string;
  severity: 'Critical' | 'High';
  triggerSource: 'deterministic_rule' | 'gemini_ai' | 'hybrid';
  matchedRuleIds: string[];
  assignedOfficerUid: string;
  backupOfficerUid: string;
  assignedInspectorUid: string;
  wardId: string;
  officeId: string;
  status: 'open' | 'acknowledged' | 'escalated_backup' | 'resolved';
  acknowledgementDeadline: string;
  acknowledgedAt: string;
  acknowledgedByUid: string;
  escalatedAt: string;
  call112GuidanceShown: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface OfficerApprovalRecord {
  id: string;
  complaintId: string;
  reportId: string;
  citizenUid: string;
  officerUid: string;
  officerName: string;
  assignedInspectorUid: string;
  decision: 'approved' | 'revision_requested' | 'rejected' | 'emergency_cleared';
  remarks: string;
  assignedDepartment: string;
  createdAt?: Timestamp | null;
}

export interface DepartmentWorkOrderRecord {
  id: string;
  workOrderCode: string;
  complaintId: string;
  citizenUid: string;
  officerUid: string;
  assignedInspectorUid: string;
  department: string;
  officeId: string;
  wardId: string;
  priority: SeverityLevel;
  scopeOfWork: string;
  contractorOrCrew: string;
  status: 'issued' | 'in_progress' | 'completed' | 'verified';
  targetDate: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ResolutionRecord {
  id: string;
  complaintId: string;
  workOrderId: string;
  citizenUid: string;
  verifiedByOfficerUid: string;
  officerName: string;
  assignedInspectorUid: string;
  resolutionSummary: string;
  citizenNotified: boolean;
  resolvedAt: string;
  createdAt?: Timestamp | null;
}

export interface NotificationRecord {
  id: string;
  recipientUid: string;
  senderUid: string;
  complaintId: string;
  emergencyIncidentId: string;
  type: 'emergency_alert' | 'assignment' | 'mfir_submitted' | 'officer_decision' | 'work_order' | 'resolution' | 'system';
  severity: SeverityLevel;
  title: string;
  message: string;
  read: boolean;
  requiresAck: boolean;
  acknowledgedAt: string;
  escalationDeadline: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface AuditLogRecord {
  id: string;
  actorUid: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  createdAt?: Timestamp | null;
}

export interface EmergencyRuleRecord {
  id: string;
  ruleCode: string;
  name: string;
  keywords: string[];
  taxonomyCodes: string[];
  severity: 'Critical' | 'High';
  ackWindowMinutes: number;
  active: boolean;
  recordScope: 'municipal_reference';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface UploadedEvidenceDraft {
  storageFileName: string;
  storageUrl: string;
  storageType: 'server_local' | 'firebase_storage';
  originalName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileSize: number;
  sha256: string;
  isDuplicate: boolean;
  duplicateOfFileName: string;
  exifCamera: string;
  exifTimestamp: string;
  exifGpsLat: number;
  exifGpsLng: number;
  hasExifGps: boolean;
  gpsMismatchMeters: number;
  suspiciousFlag: boolean;
  suspiciousReasons: string[];
  advisoryNote: string;
}

export interface GeminiInspectionResponse {
  model: string;
  detectedLanguage: string;
  englishTranslation: string;
  englishSummary: string;
  observations: string;
  recommendedSeverity: SeverityLevel;
  emergencyFlag: boolean;
  emergencyReason: string;
  triggerSource: 'deterministic_rule' | 'gemini_ai' | 'hybrid' | 'none';
  matchedRuleIds: string[];
  ackWindowMinutes: number;
  imageObservations: string;
  suspiciousVisualFlags: string[];
  classifiedIssues: Array<{
    canonicalCode: string;
    domain: string;
    category: string;
    subcategory: string;
    department: string;
    description: string;
    recommendedSeverity: SeverityLevel;
    confidence: number;
  }>;
  advisoryDisclaimer: string;
  call112Guidance: string;
}

export interface TwinTrustContextResponse {
  latitude: number;
  longitude: number;
  roadName: string;
  osmSuburb: string;
  osmDisplayName: string;
  roadMatchSource: 'openstreetmap_nominatim' | 'coordinates_only';
  jurisdictionMatchType: 'ward_boundary_box' | 'nearest_imported_office' | 'unassigned_no_import';
  officeDistanceMeters: number;
  matchedOffice: MunicipalOfficeRecord | null;
  nearbyHotspots: Array<AccidentHotspotRecord & { distanceMeters: number }>;
  infrastructureNote: string;
}

export interface HealthIntegrationStatus {
  status: string;
  timestamp: string;
  integrations: {
    geminiAi: { configured: boolean; model: string; mode: string };
    firebaseAuthAndFirestore: { configured: boolean; projectId: string | null; mode: string };
    evidenceStorage: { configured: boolean; mode: string; note: string };
    openStreetMapTwinTrust: { configured: boolean; mode: string };
    fcmPush: { configured: boolean; note: string };
    cloudTasks: { configured: boolean; note: string };
    emergencyDispatch112: { configured: boolean; note: string };
  };
}
