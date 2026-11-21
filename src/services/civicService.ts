import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { auth, db, BOOTSTRAPPED_ADMIN_EMAIL, OperationType, handleFirestoreError } from '../firebase';
import type {
  UserProfile,
  UserRole,
  SupportedLanguage,
  ComplaintRecord,
  IssueTaxonomyRecord,
  ClassifiedIssueRecord,
  AiAnalysisRecord,
  EvidenceRecord,
  AccidentHotspotRecord,
  MunicipalOfficeRecord,
  InspectorAssignmentRecord,
  InspectionReportRecord,
  EmergencyIncidentRecord,
  OfficerApprovalRecord,
  DepartmentWorkOrderRecord,
  ResolutionRecord,
  NotificationRecord,
  AuditLogRecord,
  EmergencyRuleRecord,
  UploadedEvidenceDraft,
  GeminiInspectionResponse,
  TwinTrustContextResponse,
  SeverityLevel,
  HealthIntegrationStatus,
  RoleAuthorizationRecord,
  BootstrapVerifyResponse,
} from '../types/civic';
import { STARTER_TAXONOMY, STARTER_EMERGENCY_RULES } from '../data/municipalDefaults';

function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function makeCode(prefix: string): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${num}`;
}

async function getBearerHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('User is not authenticated.');
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}

// ── Health & Integration Status ──────────────────────────────────────────────
export async function fetchHealthStatus(): Promise<HealthIntegrationStatus> {
  const resp = await fetch('/api/health');
  if (!resp.ok) {
    throw new Error('Failed to load platform integration health status.');
  }
  return (await resp.json()) as HealthIntegrationStatus;
}

// Deterministic safe Firestore document ID for an email (must match firestore.rules emailToDocId)
export function emailToAuthorizationId(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

export async function verifyServerAdminBootstrap(): Promise<BootstrapVerifyResponse> {
  const headers = await getBearerHeaders();
  const resp = await fetch('/api/auth/bootstrap-verify', {
    method: 'POST',
    headers,
  });
  if (!resp.ok) {
    const body = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || 'Failed to verify administrator bootstrap status with server.');
  }
  return (await resp.json()) as BootstrapVerifyResponse;
}

// ── User Profile & Secure RBAC Initialization ────────────────────────────────
export async function initializeUserSession(
  preferredLanguage: SupportedLanguage
): Promise<{ profile: UserProfile; bootstrap: BootstrapVerifyResponse | null }> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  const path = `users/${user.uid}`;

  // 1. Server-side Firebase Admin SDK token verification & ADMIN_BOOTSTRAP_EMAIL check
  let bootstrap: BootstrapVerifyResponse | null = null;
  try {
    bootstrap = await verifyServerAdminBootstrap();
  } catch (err) {
    console.warn('Bootstrap verification endpoint unavailable, falling back to verified token check:', err);
  }

  const normalizedEmail = (user.email || '').trim().toLowerCase();
  const isRuleBootstrapAdmin = Boolean(
    user.emailVerified && normalizedEmail === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
  );
  const isVerifiedBootstrapAdmin = Boolean(
    user.emailVerified && (bootstrap ? bootstrap.isBootstrapAdmin && isRuleBootstrapAdmin : isRuleBootstrapAdmin)
  );

  // 2. Check Admin-created email pre-authorization record (role_authorizations/{emailKey})
  let activePreAuth: RoleAuthorizationRecord | null = null;
  if (user.emailVerified && normalizedEmail) {
    const authDocId = emailToAuthorizationId(normalizedEmail);
    try {
      const preAuthSnap = await getDoc(doc(db, 'role_authorizations', authDocId));
      if (preAuthSnap.exists()) {
        const candidate = { id: preAuthSnap.id, ...preAuthSnap.data() } as RoleAuthorizationRecord;
        if (candidate.active && candidate.email.trim().toLowerCase() === normalizedEmail) {
          activePreAuth = candidate;
        }
      }
    } catch {
      // No pre-authorization exists for this email; user remains Citizen unless bootstrapped Admin
    }
  }

  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data() as UserProfile;

      // Promote an existing account strictly if verified as initial Bootstrap Admin
      // or explicitly pre-authorized by an Administrator in role_authorizations
      if (isVerifiedBootstrapAdmin && data.role !== 'admin') {
        const nextDept = data.department || 'Municipal Administration';
        await updateDoc(ref, {
          role: 'admin',
          department: nextDept,
          onDuty: true,
          language: preferredLanguage || data.language || 'en',
          updatedAt: serverTimestamp(),
        });
        await logAudit({
          actorUid: user.uid,
          actorRole: 'admin',
          action: 'ADMIN_BOOTSTRAP_ACTIVATED',
          entityType: 'users',
          entityId: user.uid,
          summary: `Verified initial Administrator ${data.email} promoted from ${data.role} to admin via server bootstrap.`,
        });
        const refreshed = await getDoc(ref);
        return { profile: refreshed.data() as UserProfile, bootstrap };
      }

      if (activePreAuth && data.role !== activePreAuth.role) {
        await updateDoc(ref, {
          role: activePreAuth.role,
          department: activePreAuth.department || data.department || '',
          wardId: activePreAuth.wardId || data.wardId || '',
          onDuty: true,
          language: preferredLanguage || data.language || 'en',
          updatedAt: serverTimestamp(),
        });
        await logAudit({
          actorUid: user.uid,
          actorRole: activePreAuth.role,
          action: 'STAFF_PREAUTH_ACTIVATED',
          entityType: 'users',
          entityId: user.uid,
          summary: `Pre-authorized account ${data.email} activated with role=${activePreAuth.role}.`,
        });
        const refreshed = await getDoc(ref);
        return { profile: refreshed.data() as UserProfile, bootstrap };
      }

      if (preferredLanguage && data.language !== preferredLanguage) {
        await updateDoc(ref, {
          language: preferredLanguage,
          updatedAt: serverTimestamp(),
        });
        return { profile: { ...data, language: preferredLanguage }, bootstrap };
      }
      return { profile: data, bootstrap };
    }

    // New user creation: default strictly to 'citizen' unless verified Bootstrap Admin or Admin pre-authorized
    let initialRole: UserRole = 'citizen';
    let initialDepartment = '';
    let initialWardId = '';
    let initialOnDuty = false;

    if (isVerifiedBootstrapAdmin) {
      initialRole = 'admin';
      initialDepartment = 'Municipal Administration';
      initialOnDuty = true;
    } else if (activePreAuth) {
      initialRole = activePreAuth.role;
      initialDepartment = activePreAuth.department || '';
      initialWardId = activePreAuth.wardId || '';
      initialOnDuty = true;
    }

    const newProfile = {
      uid: user.uid,
      displayName: (user.displayName || user.email?.split('@')[0] || 'Civic User').slice(0, 120),
      email: (user.email || '').slice(0, 200),
      role: initialRole,
      language: preferredLanguage || 'en',
      department: initialDepartment,
      wardId: initialWardId,
      phone: '',
      onDuty: initialOnDuty,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, newProfile);
    await logAudit({
      actorUid: user.uid,
      actorRole: newProfile.role,
      action: isVerifiedBootstrapAdmin ? 'ADMIN_BOOTSTRAP_REGISTERED' : 'USER_REGISTERED',
      entityType: 'users',
      entityId: user.uid,
      summary: `User ${newProfile.displayName} registered with role ${newProfile.role}.`,
    });

    const created = await getDoc(ref);
    return { profile: created.data() as UserProfile, bootstrap };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function ensureUserProfile(preferredLanguage: SupportedLanguage): Promise<UserProfile> {
  const { profile } = await initializeUserSession(preferredLanguage);
  return profile;
}

export async function updateOwnProfile(
  uid: string,
  updates: { displayName?: string; language?: SupportedLanguage; phone?: string; onDuty?: boolean }
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminUpdateUser(
  targetUid: string,
  updates: {
    displayName: string;
    role: UserRole;
    language: SupportedLanguage;
    department: string;
    wardId: string;
    phone: string;
    onDuty: boolean;
  },
  actorUid: string
): Promise<void> {
  const path = `users/${targetUid}`;
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      displayName: updates.displayName.slice(0, 120),
      role: updates.role,
      language: updates.language,
      department: updates.department.slice(0, 100),
      wardId: updates.wardId.slice(0, 64),
      phone: updates.phone.slice(0, 32),
      onDuty: updates.onDuty,
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      actorUid,
      actorRole: 'admin',
      action: 'USER_ROLE_UPDATED',
      entityType: 'users',
      entityId: targetUid,
      summary: `Admin updated user ${targetUid} -> role=${updates.role}, dept=${updates.department || 'none'}, ward=${updates.wardId || 'none'}.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function authorizeStaffAccountByEmail(
  params: {
    email: string;
    role: 'inspector' | 'officer' | 'admin';
    department: string;
    wardId: string;
    notes: string;
  },
  adminUid: string,
  existingUsers: UserProfile[]
): Promise<{ updatedExistingUser: boolean }> {
  const cleanEmail = params.email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@') || cleanEmail.length < 5) {
    throw new Error('Enter a valid Google account email address.');
  }
  const emailKey = emailToAuthorizationId(cleanEmail);
  const path = `role_authorizations/${emailKey}`;
  try {
    const ref = doc(db, 'role_authorizations', emailKey);
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, {
        role: params.role,
        department: params.department.slice(0, 100),
        wardId: params.wardId.slice(0, 64),
        authorizedByUid: adminUid,
        notes: params.notes.slice(0, 300),
        active: true,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        email: cleanEmail.slice(0, 200),
        role: params.role,
        department: params.department.slice(0, 100),
        wardId: params.wardId.slice(0, 64),
        authorizedByUid: adminUid,
        notes: params.notes.slice(0, 300),
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // If this person already signed in earlier as a Citizen, immediately upgrade their live profile
    const matchingUser = existingUsers.find((u) => u.email.trim().toLowerCase() === cleanEmail);
    let updatedExistingUser = false;
    if (matchingUser) {
      await adminUpdateUser(
        matchingUser.uid,
        {
          displayName: matchingUser.displayName,
          role: params.role,
          language: matchingUser.language,
          department: params.department || matchingUser.department,
          wardId: params.wardId || matchingUser.wardId,
          phone: matchingUser.phone,
          onDuty: true,
        },
        adminUid
      );
      updatedExistingUser = true;
    }

    await logAudit({
      actorUid: adminUid,
      actorRole: 'admin',
      action: 'STAFF_EMAIL_AUTHORIZED',
      entityType: 'role_authorizations',
      entityId: emailKey,
      summary: `Authorized ${cleanEmail} for role=${params.role}, dept=${params.department || 'none'}, ward=${params.wardId || 'none'}.`,
    });

    return { updatedExistingUser };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function revokeRoleAuthorization(
  emailKey: string,
  email: string,
  adminUid: string
): Promise<void> {
  const path = `role_authorizations/${emailKey}`;
  try {
    await deleteDoc(doc(db, 'role_authorizations', emailKey));
    await logAudit({
      actorUid: adminUid,
      actorRole: 'admin',
      action: 'STAFF_EMAIL_AUTHORIZATION_REVOKED',
      entityType: 'role_authorizations',
      entityId: emailKey,
      summary: `Revoked pre-authorization for ${email}.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ── Immutable Audit Log & Real-Time Notification Helpers ─────────────────────
export async function logAudit(params: {
  actorUid: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
}): Promise<void> {
  const logId = makeSafeId('aud');
  const path = `audit_logs/${logId}`;
  try {
    await setDoc(doc(db, 'audit_logs', logId), {
      actorUid: params.actorUid,
      actorRole: params.actorRole,
      action: params.action.slice(0, 100),
      entityType: params.entityType.slice(0, 64),
      entityId: params.entityId.slice(0, 128),
      summary: params.summary.slice(0, 600),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function createNotification(params: {
  recipientUid: string;
  senderUid: string;
  complaintId?: string;
  emergencyIncidentId?: string;
  type: NotificationRecord['type'];
  severity: SeverityLevel;
  title: string;
  message: string;
  requiresAck?: boolean;
  escalationDeadline?: string;
}): Promise<void> {
  if (!params.recipientUid) return;
  const notifId = makeSafeId('ntf');
  const path = `notifications/${notifId}`;
  try {
    await setDoc(doc(db, 'notifications', notifId), {
      recipientUid: params.recipientUid,
      senderUid: params.senderUid,
      complaintId: params.complaintId || '',
      emergencyIncidentId: params.emergencyIncidentId || '',
      type: params.type,
      severity: params.severity,
      title: params.title.slice(0, 180),
      message: params.message.slice(0, 1000),
      read: false,
      requiresAck: Boolean(params.requiresAck),
      acknowledgedAt: '',
      escalationDeadline: params.escalationDeadline || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function markNotificationRead(notifId: string, acknowledge = false): Promise<void> {
  const path = `notifications/${notifId}`;
  try {
    const payload: Record<string, unknown> = {
      read: true,
      updatedAt: serverTimestamp(),
    };
    if (acknowledge) {
      payload.acknowledgedAt = new Date().toISOString();
    }
    await updateDoc(doc(db, 'notifications', notifId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ── Server-Side API Bridges (ImageGuard, Gemini AI, TwinTrust, Emergency) ────
export async function uploadEvidenceImage(
  file: File,
  latitude: number,
  longitude: number,
  knownHashes: string[] = []
): Promise<UploadedEvidenceDraft> {
  const headers = await getBearerHeaders();
  const form = new FormData();
  form.append('file', file);
  form.append('latitude', String(latitude));
  form.append('longitude', String(longitude));
  if (knownHashes.length > 0) {
    form.append('knownHashes', JSON.stringify(knownHashes));
  }

  const resp = await fetch('/api/evidence/upload', {
    method: 'POST',
    headers,
    body: form,
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Evidence upload failed.');
  }
  return data as UploadedEvidenceDraft;
}

export async function inspectComplaintWithGemini(params: {
  rawText: string;
  language: SupportedLanguage;
  landmark: string;
  latitude: number;
  longitude: number;
  evidenceDrafts: UploadedEvidenceDraft[];
  taxonomy: IssueTaxonomyRecord[];
  emergencyRules: EmergencyRuleRecord[];
}): Promise<GeminiInspectionResponse> {
  const headers = await getBearerHeaders();
  const resp = await fetch('/api/ai/inspect-complaint', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      rawText: params.rawText,
      language: params.language,
      landmark: params.landmark,
      latitude: params.latitude,
      longitude: params.longitude,
      evidenceFiles: params.evidenceDrafts.map((e) => ({
        storageFileName: e.storageFileName,
        mimeType: e.mimeType,
        sha256: e.sha256,
      })),
      taxonomyCatalog: params.taxonomy
        .filter((t) => t.active)
        .map((t) => ({
          code: t.code,
          domain: t.domain,
          category: t.category,
          subcategory: t.subcategory,
          department: t.department,
          defaultSeverity: t.defaultSeverity,
          emergencyTrigger: t.emergencyTrigger,
        })),
      emergencyRules: params.emergencyRules
        .filter((r) => r.active)
        .map((r) => ({
          ruleCode: r.ruleCode,
          name: r.name,
          keywords: r.keywords,
          taxonomyCodes: r.taxonomyCodes,
          severity: r.severity,
          ackWindowMinutes: r.ackWindowMinutes,
        })),
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Gemini AI complaint inspection failed.');
  }
  return data as GeminiInspectionResponse;
}

export async function resolveTwinTrustContext(
  latitude: number,
  longitude: number,
  offices: MunicipalOfficeRecord[],
  hotspots: AccidentHotspotRecord[]
): Promise<TwinTrustContextResponse> {
  const headers = await getBearerHeaders();
  const resp = await fetch('/api/twintrust/context', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      latitude,
      longitude,
      offices: offices.map((o) => ({
        id: o.id,
        officeCode: o.officeCode,
        officeName: o.officeName,
        department: o.department,
        wardId: o.wardId,
        wardName: o.wardName,
        latitude: o.latitude,
        longitude: o.longitude,
        minLat: o.minLat,
        maxLat: o.maxLat,
        minLng: o.minLng,
        maxLng: o.maxLng,
        primaryOfficerUid: o.primaryOfficerUid,
        primaryOfficerName: o.primaryOfficerName,
        backupOfficerUid: o.backupOfficerUid,
        backupOfficerName: o.backupOfficerName,
        inspectorUid: o.inspectorUid,
        inspectorName: o.inspectorName,
      })),
      hotspots: hotspots.map((h) => ({
        id: h.id,
        recordCode: h.recordCode,
        locationName: h.locationName,
        roadName: h.roadName,
        latitude: h.latitude,
        longitude: h.longitude,
        incidentCount: h.incidentCount,
        fatalities: h.fatalities,
        injuries: h.injuries,
        sourceDataset: h.sourceDataset,
      })),
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'TwinTrust location matching failed.');
  }
  return data as TwinTrustContextResponse;
}

// ── Complete End-to-End Citizen Complaint Submission Pipeline ────────────────
export async function submitFullComplaintWorkflow(params: {
  profile: UserProfile;
  rawText: string;
  language: SupportedLanguage;
  landmark: string;
  latitude: number;
  longitude: number;
  evidenceDrafts: UploadedEvidenceDraft[];
  aiResult: GeminiInspectionResponse;
  twinTrust: TwinTrustContextResponse | null;
}): Promise<{ complaintId: string; complaintCode: string; emergencyIncidentId: string | null }> {
  const { profile, rawText, language, landmark, latitude, longitude, evidenceDrafts, aiResult, twinTrust } = params;

  const complaintId = makeSafeId('cmp');
  const complaintCode = makeCode('CIV');
  const matchedOffice = twinTrust?.matchedOffice || null;

  const assignedOfficerUid = matchedOffice?.primaryOfficerUid || '';
  const backupOfficerUid = matchedOffice?.backupOfficerUid || '';
  const assignedInspectorUid = matchedOffice?.inspectorUid || '';
  const assignedInspectorName = matchedOffice?.inspectorName || 'Unassigned Ward Inspector';

  const primaryDepartment =
    aiResult.classifiedIssues[0]?.department || matchedOffice?.department || 'General Municipal Operations';

  const hasSuspiciousEvidence =
    evidenceDrafts.some((e) => e.suspiciousFlag) || aiResult.suspiciousVisualFlags.length > 0;

  const initialStatus = aiResult.emergencyFlag
    ? 'emergency_escalated'
    : assignedInspectorUid
    ? 'inspector_assigned'
    : 'ai_analyzed';

  // 1. Create primary Complaint document first (satisfies complaintExists() for child collections)
  const complaintPath = `complaints/${complaintId}`;
  try {
    await setDoc(doc(db, 'complaints', complaintId), {
      complaintCode,
      citizenUid: profile.uid,
      citizenName: profile.displayName.slice(0, 120),
      language,
      rawText: rawText.slice(0, 4000),
      translatedText: aiResult.englishTranslation.slice(0, 4000),
      landmark: landmark.slice(0, 300),
      latitude,
      longitude,
      roadName: (twinTrust?.roadName || 'Coordinates recorded').slice(0, 250),
      wardId: (matchedOffice?.wardId || '').slice(0, 64),
      wardName: (matchedOffice?.wardName || 'Pending Ward Mapping').slice(0, 120),
      officeId: matchedOffice?.id || '',
      officeName: (matchedOffice?.officeName || 'Central Municipal Desk').slice(0, 160),
      primaryDepartment: primaryDepartment.slice(0, 120),
      severity: aiResult.recommendedSeverity,
      status: initialStatus,
      isEmergency: aiResult.emergencyFlag,
      issueCount: aiResult.classifiedIssues.length,
      evidenceCount: evidenceDrafts.length,
      hasSuspiciousEvidence,
      assignedInspectorUid,
      assignedOfficerUid,
      backupOfficerUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, complaintPath);
  }

  // 2. Persist Validated Gemini AI Analysis
  const analysisId = makeSafeId('ai');
  try {
    await setDoc(doc(db, 'ai_analysis', analysisId), {
      complaintId,
      citizenUid: profile.uid,
      assignedInspectorUid,
      assignedOfficerUid,
      model: aiResult.model.slice(0, 80),
      detectedLanguage: aiResult.detectedLanguage.slice(0, 40),
      englishSummary: aiResult.englishSummary.slice(0, 2000),
      observations: aiResult.observations.slice(0, 3000),
      recommendedSeverity: aiResult.recommendedSeverity,
      emergencyFlag: aiResult.emergencyFlag,
      emergencyReason: aiResult.emergencyReason.slice(0, 1000),
      imageObservations: aiResult.imageObservations.slice(0, 2000),
      suspiciousVisualFlags: aiResult.suspiciousVisualFlags.slice(0, 15),
      advisoryDisclaimer: aiResult.advisoryDisclaimer.slice(0, 400),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `ai_analysis/${analysisId}`);
  }

  // 3. Persist All Multi-Issue Classified Records
  for (const issue of aiResult.classifiedIssues) {
    const issueId = makeSafeId('iss');
    try {
      await setDoc(doc(db, 'classified_issues', issueId), {
        complaintId,
        citizenUid: profile.uid,
        assignedInspectorUid,
        assignedOfficerUid,
        canonicalCode: issue.canonicalCode.slice(0, 40),
        domain: issue.domain.slice(0, 80),
        category: issue.category.slice(0, 100),
        subcategory: issue.subcategory.slice(0, 120),
        department: issue.department.slice(0, 120),
        description: issue.description.slice(0, 1000),
        recommendedSeverity: issue.recommendedSeverity,
        confidence: Math.max(0, Math.min(1, Number(issue.confidence) || 0.8)),
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `classified_issues/${issueId}`);
    }
  }

  // 4. Persist ImageGuard Evidence Records
  for (const ev of evidenceDrafts) {
    const evidenceId = makeSafeId('ev');
    const combinedReasons = [...ev.suspiciousReasons, ...aiResult.suspiciousVisualFlags].slice(0, 15);
    try {
      await setDoc(doc(db, 'evidence', evidenceId), {
        complaintId,
        citizenUid: profile.uid,
        assignedInspectorUid,
        assignedOfficerUid,
        fileName: ev.originalName.slice(0, 200),
        mimeType: ev.mimeType,
        fileSize: ev.fileSize,
        sha256: ev.sha256,
        storageType: ev.storageType,
        storageUrl: ev.storageUrl,
        isDuplicate: ev.isDuplicate,
        duplicateOfEvidenceId: '',
        exifCamera: ev.exifCamera.slice(0, 200),
        exifTimestamp: ev.exifTimestamp.slice(0, 80),
        exifGpsLat: ev.exifGpsLat,
        exifGpsLng: ev.exifGpsLng,
        hasExifGps: ev.hasExifGps,
        gpsMismatchMeters: ev.gpsMismatchMeters,
        suspiciousFlag: combinedReasons.length > 0,
        suspiciousReasons: combinedReasons,
        reviewStatus: combinedReasons.length > 0 ? 'flagged_unverified' : 'pending_review',
        aiVisualNote: aiResult.imageObservations.slice(0, 1000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `evidence/${evidenceId}`);
    }
  }

  // 5. Create Parallel Inspector Assignment (for Emergency & Standard routing)
  const assignmentId = makeSafeId('asg');
  const slaHours = aiResult.recommendedSeverity === 'Critical' ? 2 : aiResult.recommendedSeverity === 'High' ? 12 : 48;
  const dueAtIso = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();
  try {
    await setDoc(doc(db, 'inspector_assignments', assignmentId), {
      complaintId,
      citizenUid: profile.uid,
      inspectorUid: assignedInspectorUid,
      inspectorName: assignedInspectorName.slice(0, 120),
      assignedOfficerUid,
      assignedByUid: profile.uid,
      priority: aiResult.recommendedSeverity,
      status: 'assigned',
      dueAt: dueAtIso,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `inspector_assignments/${assignmentId}`);
  }

  if (assignedInspectorUid) {
    await createNotification({
      recipientUid: assignedInspectorUid,
      senderUid: profile.uid,
      complaintId,
      type: 'assignment',
      severity: aiResult.recommendedSeverity,
      title: `Field Inspection Assigned: ${complaintCode}`,
      message: `${aiResult.recommendedSeverity} priority ${primaryDepartment} complaint at ${landmark || twinTrust?.roadName || 'pinned GPS'}.`,
    });
  }

  // 6. EmergencyGuard: Immediate Critical Incident + Officer Escalation (without waiting for MFIR)
  let emergencyIncidentId: string | null = null;
  if (aiResult.emergencyFlag || aiResult.recommendedSeverity === 'Critical') {
    emergencyIncidentId = makeSafeId('emg');
    const incidentTitle = `${complaintCode}: ${aiResult.classifiedIssues[0]?.subcategory || 'Critical Civic Emergency'}`;
    let ackDeadline = new Date(Date.now() + (aiResult.ackWindowMinutes || 15) * 60 * 1000).toISOString();

    // Server-side critical incident notification & SLA registration
    try {
      const headers = await getBearerHeaders();
      const resp = await fetch('/api/emergency/notify', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaintId,
          incidentId: emergencyIncidentId,
          severity: 'Critical',
          title: incidentTitle.slice(0, 240),
          wardName: matchedOffice?.wardName || 'Unmapped Ward',
          ackWindowMinutes: aiResult.ackWindowMinutes || 15,
        }),
      });
      if (resp.ok) {
        const emgResp = await resp.json();
        if (emgResp.acknowledgementDeadline) {
          ackDeadline = emgResp.acknowledgementDeadline;
        }
      }
    } catch {
      // Proceed with computed deadline and Firestore alert
    }

    try {
      await setDoc(doc(db, 'emergency_incidents', emergencyIncidentId), {
        complaintId,
        citizenUid: profile.uid,
        title: incidentTitle.slice(0, 240),
        severity: 'Critical',
        triggerSource: aiResult.triggerSource === 'none' ? 'gemini_ai' : aiResult.triggerSource,
        matchedRuleIds: aiResult.matchedRuleIds.slice(0, 20),
        assignedOfficerUid,
        backupOfficerUid,
        assignedInspectorUid,
        wardId: matchedOffice?.wardId || '',
        officeId: matchedOffice?.id || '',
        status: 'open',
        acknowledgementDeadline: ackDeadline,
        acknowledgedAt: '',
        acknowledgedByUid: '',
        escalatedAt: '',
        call112GuidanceShown: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `emergency_incidents/${emergencyIncidentId}`);
    }

    // Immediate real-time notification to On-Duty Municipal Officer
    if (assignedOfficerUid) {
      await createNotification({
        recipientUid: assignedOfficerUid,
        senderUid: profile.uid,
        complaintId,
        emergencyIncidentId,
        type: 'emergency_alert',
        severity: 'Critical',
        title: `CRITICAL EMERGENCY: ${incidentTitle}`,
        message: `${aiResult.emergencyReason || aiResult.englishSummary} — Immediate acknowledgement required before ${new Date(ackDeadline).toLocaleTimeString()}.`,
        requiresAck: true,
        escalationDeadline: ackDeadline,
      });
    }
  } else if (aiResult.recommendedSeverity === 'High' && assignedOfficerUid) {
    // High severity: Fast-track officer notification alongside inspector assignment
    await createNotification({
      recipientUid: assignedOfficerUid,
      senderUid: profile.uid,
      complaintId,
      type: 'assignment',
      severity: 'High',
      title: `Fast-Track High Priority Case: ${complaintCode}`,
      message: `${primaryDepartment} issue flagged High severity: ${aiResult.englishSummary.slice(0, 220)}`,
    });
  }

  // 7. Immutable Audit Log
  await logAudit({
    actorUid: profile.uid,
    actorRole: profile.role,
    action: aiResult.emergencyFlag ? 'CRITICAL_COMPLAINT_SUBMITTED' : 'COMPLAINT_SUBMITTED',
    entityType: 'complaints',
    entityId: complaintId,
    summary: `Complaint ${complaintCode} submitted (${aiResult.recommendedSeverity}, ${aiResult.classifiedIssues.length} issue(s), ${evidenceDrafts.length} photo(s), emergency=${aiResult.emergencyFlag}).`,
  });

  return { complaintId, complaintCode, emergencyIncidentId };
}

// ── Inspector Portal Actions ─────────────────────────────────────────────────
export async function reviewEvidenceAsHuman(params: {
  evidenceId: string;
  reviewStatus: 'verified_human' | 'flagged_unverified';
  suspiciousFlag: boolean;
  actorUid: string;
  actorRole: UserRole;
}): Promise<void> {
  const path = `evidence/${params.evidenceId}`;
  try {
    await updateDoc(doc(db, 'evidence', params.evidenceId), {
      reviewStatus: params.reviewStatus,
      suspiciousFlag: params.suspiciousFlag,
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      actorUid: params.actorUid,
      actorRole: params.actorRole,
      action: 'EVIDENCE_HUMAN_REVIEWED',
      entityType: 'evidence',
      entityId: params.evidenceId,
      summary: `Evidence marked ${params.reviewStatus} by ${params.actorRole}.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function submitInspectionReportMfir(params: {
  complaint: ComplaintRecord;
  assignmentId: string;
  inspector: UserProfile;
  physicalVerification: InspectionReportRecord['physicalVerification'];
  siteNotes: string;
  evidenceReviewOutcome: InspectionReportRecord['evidenceReviewOutcome'];
  finalPriority: SeverityLevel;
  recommendedDepartment: string;
  estimatedCostInr: number;
  requiresWorkOrder: boolean;
}): Promise<string> {
  const reportId = makeSafeId('mfir');
  const reportPath = `inspection_reports/${reportId}`;
  try {
    await setDoc(doc(db, 'inspection_reports', reportId), {
      complaintId: params.complaint.id,
      assignmentId: params.assignmentId || '',
      citizenUid: params.complaint.citizenUid,
      inspectorUid: params.inspector.uid,
      inspectorName: params.inspector.displayName.slice(0, 120),
      assignedOfficerUid: params.complaint.assignedOfficerUid || '',
      physicalVerification: params.physicalVerification,
      siteNotes: params.siteNotes.slice(0, 4000),
      evidenceReviewOutcome: params.evidenceReviewOutcome,
      finalPriority: params.finalPriority,
      recommendedDepartment: params.recommendedDepartment.slice(0, 120),
      estimatedCostInr: Math.max(0, Number(params.estimatedCostInr) || 0),
      requiresWorkOrder: params.requiresWorkOrder,
      status: 'submitted',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'complaints', params.complaint.id), {
      status: 'inspected_mfir',
      severity: params.finalPriority,
      primaryDepartment: params.recommendedDepartment.slice(0, 120),
      hasSuspiciousEvidence: params.evidenceReviewOutcome === 'suspicious_needs_inquiry',
      updatedAt: serverTimestamp(),
    });

    if (params.assignmentId) {
      await updateDoc(doc(db, 'inspector_assignments', params.assignmentId), {
        status: 'completed',
        updatedAt: serverTimestamp(),
      });
    }

    if (params.complaint.assignedOfficerUid) {
      await createNotification({
        recipientUid: params.complaint.assignedOfficerUid,
        senderUid: params.inspector.uid,
        complaintId: params.complaint.id,
        type: 'mfir_submitted',
        severity: params.finalPriority,
        title: `MFIR Submitted for Approval: ${params.complaint.complaintCode}`,
        message: `Inspector ${params.inspector.displayName} verified site (${params.physicalVerification}) and recommended ${params.recommendedDepartment}.`,
      });
    }

    await createNotification({
      recipientUid: params.complaint.citizenUid,
      senderUid: params.inspector.uid,
      complaintId: params.complaint.id,
      type: 'mfir_submitted',
      severity: params.finalPriority,
      title: `Field Inspection Completed: ${params.complaint.complaintCode}`,
      message: `A municipal field inspector has submitted the Municipal Field Inspection Report (MFIR) for officer review.`,
    });

    await logAudit({
      actorUid: params.inspector.uid,
      actorRole: params.inspector.role,
      action: 'MFIR_SUBMITTED',
      entityType: 'inspection_reports',
      entityId: reportId,
      summary: `MFIR submitted for ${params.complaint.complaintCode} (${params.physicalVerification}, priority=${params.finalPriority}).`,
    });

    return reportId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, reportPath);
  }
}

// ── Municipal Officer Portal Actions ─────────────────────────────────────────
export async function acknowledgeEmergencyIncident(incident: EmergencyIncidentRecord, officer: UserProfile): Promise<void> {
  const path = `emergency_incidents/${incident.id}`;
  const nowIso = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'emergency_incidents', incident.id), {
      status: 'acknowledged',
      acknowledgedAt: nowIso,
      acknowledgedByUid: officer.uid,
      updatedAt: serverTimestamp(),
    });
    await createNotification({
      recipientUid: incident.citizenUid,
      senderUid: officer.uid,
      complaintId: incident.complaintId,
      emergencyIncidentId: incident.id,
      type: 'emergency_alert',
      severity: 'Critical',
      title: `Emergency Acknowledged by Municipal Officer`,
      message: `Officer ${officer.displayName} has acknowledged your Critical incident (${incident.title}) and initiated municipal action. For life safety, call 112.`,
    });
    await logAudit({
      actorUid: officer.uid,
      actorRole: officer.role,
      action: 'EMERGENCY_ACKNOWLEDGED',
      entityType: 'emergency_incidents',
      entityId: incident.id,
      summary: `Officer ${officer.displayName} acknowledged Critical Incident ${incident.id}.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function escalateEmergencyToBackup(incident: EmergencyIncidentRecord, officer: UserProfile): Promise<void> {
  const path = `emergency_incidents/${incident.id}`;
  const nowIso = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'emergency_incidents', incident.id), {
      status: 'escalated_backup',
      escalatedAt: nowIso,
      updatedAt: serverTimestamp(),
    });
    if (incident.backupOfficerUid) {
      await createNotification({
        recipientUid: incident.backupOfficerUid,
        senderUid: officer.uid,
        complaintId: incident.complaintId,
        emergencyIncidentId: incident.id,
        type: 'emergency_alert',
        severity: 'Critical',
        title: `BACKUP ESCALATION: ${incident.title}`,
        message: `Primary acknowledgement SLA escalated. Immediate backup officer takeover required.`,
        requiresAck: true,
        escalationDeadline: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
    }
    await logAudit({
      actorUid: officer.uid,
      actorRole: officer.role,
      action: 'EMERGENCY_ESCALATED_BACKUP',
      entityType: 'emergency_incidents',
      entityId: incident.id,
      summary: `Critical Incident ${incident.id} escalated to backup officer (${incident.backupOfficerUid || 'central desk'}).`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function resolveEmergencyIncident(incident: EmergencyIncidentRecord, officer: UserProfile): Promise<void> {
  const path = `emergency_incidents/${incident.id}`;
  try {
    await updateDoc(doc(db, 'emergency_incidents', incident.id), {
      status: 'resolved',
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      actorUid: officer.uid,
      actorRole: officer.role,
      action: 'EMERGENCY_RESOLVED',
      entityType: 'emergency_incidents',
      entityId: incident.id,
      summary: `Emergency Incident ${incident.id} marked resolved by ${officer.displayName}.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function submitOfficerDecision(params: {
  complaint: ComplaintRecord;
  report: InspectionReportRecord;
  officer: UserProfile;
  decision: OfficerApprovalRecord['decision'];
  remarks: string;
  assignedDepartment: string;
}): Promise<string> {
  const approvalId = makeSafeId('apr');
  const path = `officer_approvals/${approvalId}`;
  try {
    await setDoc(doc(db, 'officer_approvals', approvalId), {
      complaintId: params.complaint.id,
      reportId: params.report.id,
      citizenUid: params.complaint.citizenUid,
      officerUid: params.officer.uid,
      officerName: params.officer.displayName.slice(0, 120),
      assignedInspectorUid: params.report.inspectorUid,
      decision: params.decision,
      remarks: params.remarks.slice(0, 2000),
      assignedDepartment: params.assignedDepartment.slice(0, 120),
      createdAt: serverTimestamp(),
    });

    const nextReportStatus = params.decision === 'approved' ? 'approved' : 'revision_requested';
    await updateDoc(doc(db, 'inspection_reports', params.report.id), {
      status: nextReportStatus,
      updatedAt: serverTimestamp(),
    });

    const nextComplaintStatus =
      params.decision === 'approved'
        ? 'officer_approved'
        : params.decision === 'rejected'
        ? 'rejected'
        : 'inspector_assigned';

    await updateDoc(doc(db, 'complaints', params.complaint.id), {
      status: nextComplaintStatus,
      primaryDepartment: params.assignedDepartment.slice(0, 120),
      updatedAt: serverTimestamp(),
    });

    await createNotification({
      recipientUid: params.complaint.citizenUid,
      senderUid: params.officer.uid,
      complaintId: params.complaint.id,
      type: 'officer_decision',
      severity: params.complaint.severity,
      title: `Officer Decision on ${params.complaint.complaintCode}: ${params.decision.replace('_', ' ')}`,
      message: params.remarks.slice(0, 400),
    });

    await logAudit({
      actorUid: params.officer.uid,
      actorRole: params.officer.role,
      action: 'OFFICER_MFIR_DECISION',
      entityType: 'officer_approvals',
      entityId: approvalId,
      summary: `Officer ${params.officer.displayName} recorded "${params.decision}" on ${params.complaint.complaintCode}.`,
    });

    return approvalId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function issueDepartmentWorkOrder(params: {
  complaint: ComplaintRecord;
  officer: UserProfile;
  department: string;
  priority: SeverityLevel;
  scopeOfWork: string;
  contractorOrCrew: string;
  targetDate: string;
}): Promise<string> {
  const workOrderId = makeSafeId('wo');
  const workOrderCode = makeCode('MWO');
  const path = `department_work_orders/${workOrderId}`;
  try {
    await setDoc(doc(db, 'department_work_orders', workOrderId), {
      workOrderCode,
      complaintId: params.complaint.id,
      citizenUid: params.complaint.citizenUid,
      officerUid: params.officer.uid,
      assignedInspectorUid: params.complaint.assignedInspectorUid || '',
      department: params.department.slice(0, 120),
      officeId: params.complaint.officeId || '',
      wardId: params.complaint.wardId || '',
      priority: params.priority,
      scopeOfWork: params.scopeOfWork.slice(0, 2000),
      contractorOrCrew: params.contractorOrCrew.slice(0, 200),
      status: 'issued',
      targetDate: params.targetDate.slice(0, 40),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'complaints', params.complaint.id), {
      status: 'work_order_issued',
      primaryDepartment: params.department.slice(0, 120),
      updatedAt: serverTimestamp(),
    });

    await createNotification({
      recipientUid: params.complaint.citizenUid,
      senderUid: params.officer.uid,
      complaintId: params.complaint.id,
      type: 'work_order',
      severity: params.priority,
      title: `Work Order ${workOrderCode} Issued (${params.department})`,
      message: `Maintenance crew assigned: ${params.contractorOrCrew || params.department}. Target date: ${params.targetDate || 'TBD'}.`,
    });

    await logAudit({
      actorUid: params.officer.uid,
      actorRole: params.officer.role,
      action: 'WORK_ORDER_ISSUED',
      entityType: 'department_work_orders',
      entityId: workOrderId,
      summary: `Work order ${workOrderCode} issued to ${params.department} for ${params.complaint.complaintCode}.`,
    });

    return workOrderId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateWorkOrderStatus(
  workOrderId: string,
  status: DepartmentWorkOrderRecord['status'],
  officer: UserProfile
): Promise<void> {
  const path = `department_work_orders/${workOrderId}`;
  try {
    await updateDoc(doc(db, 'department_work_orders', workOrderId), {
      status,
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      actorUid: officer.uid,
      actorRole: officer.role,
      action: 'WORK_ORDER_STATUS_UPDATED',
      entityType: 'department_work_orders',
      entityId: workOrderId,
      summary: `Work order ${workOrderId} updated to status=${status}.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function verifyResolutionAndClose(params: {
  complaint: ComplaintRecord;
  workOrderId: string;
  officer: UserProfile;
  resolutionSummary: string;
}): Promise<string> {
  const resId = makeSafeId('res');
  const nowIso = new Date().toISOString();
  const path = `resolution_records/${resId}`;
  try {
    await setDoc(doc(db, 'resolution_records', resId), {
      complaintId: params.complaint.id,
      workOrderId: params.workOrderId || '',
      citizenUid: params.complaint.citizenUid,
      verifiedByOfficerUid: params.officer.uid,
      officerName: params.officer.displayName.slice(0, 120),
      assignedInspectorUid: params.complaint.assignedInspectorUid || '',
      resolutionSummary: params.resolutionSummary.slice(0, 2000),
      citizenNotified: true,
      resolvedAt: nowIso,
      createdAt: serverTimestamp(),
    });

    if (params.workOrderId) {
      await updateDoc(doc(db, 'department_work_orders', params.workOrderId), {
        status: 'verified',
        updatedAt: serverTimestamp(),
      });
    }

    await updateDoc(doc(db, 'complaints', params.complaint.id), {
      status: 'resolved',
      updatedAt: serverTimestamp(),
    });

    await createNotification({
      recipientUid: params.complaint.citizenUid,
      senderUid: params.officer.uid,
      complaintId: params.complaint.id,
      type: 'resolution',
      severity: 'Low',
      title: `Complaint Resolved: ${params.complaint.complaintCode}`,
      message: params.resolutionSummary.slice(0, 400),
    });

    await logAudit({
      actorUid: params.officer.uid,
      actorRole: params.officer.role,
      action: 'RESOLUTION_VERIFIED',
      entityType: 'resolution_records',
      entityId: resId,
      summary: `Complaint ${params.complaint.complaintCode} verified resolved by ${params.officer.displayName}.`,
    });

    return resId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// ── Admin Governance & CSV Import Services ───────────────────────────────────
export async function seedStandardTaxonomyAndRules(adminUid: string): Promise<{ taxonomyCount: number; ruleCount: number }> {
  let taxonomyCount = 0;
  let ruleCount = 0;

  for (const item of STARTER_TAXONOMY) {
    const id = `tax-${item.code.toLowerCase()}`;
    try {
      await setDoc(doc(db, 'issue_taxonomy', id), {
        ...item,
        active: true,
        recordScope: 'municipal_reference',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      taxonomyCount++;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `issue_taxonomy/${id}`);
    }
  }

  for (const rule of STARTER_EMERGENCY_RULES) {
    const id = `rule-${rule.ruleCode.toLowerCase()}`;
    try {
      await setDoc(doc(db, 'emergency_rules', id), {
        ...rule,
        active: true,
        recordScope: 'municipal_reference',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      ruleCount++;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `emergency_rules/${id}`);
    }
  }

  await logAudit({
    actorUid: adminUid,
    actorRole: 'admin',
    action: 'BOOTSTRAP_TAXONOMY_AND_RULES',
    entityType: 'issue_taxonomy',
    entityId: 'starter-catalog',
    summary: `Administrator initialized ${taxonomyCount} canonical issue codes and ${ruleCount} deterministic EmergencyGuard rules.`,
  });

  return { taxonomyCount, ruleCount };
}

export async function saveTaxonomyItem(
  item: Omit<IssueTaxonomyRecord, 'id' | 'recordScope' | 'createdAt' | 'updatedAt'>,
  adminUid: string
): Promise<void> {
  const id = `tax-${item.code.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`;
  const path = `issue_taxonomy/${id}`;
  try {
    await setDoc(doc(db, 'issue_taxonomy', id), {
      code: item.code.toUpperCase().slice(0, 32),
      domain: item.domain.slice(0, 80),
      category: item.category.slice(0, 100),
      subcategory: item.subcategory.slice(0, 120),
      department: item.department.slice(0, 120),
      defaultSeverity: item.defaultSeverity,
      emergencyTrigger: item.emergencyTrigger,
      slaHours: Math.max(1, Math.min(720, Math.round(item.slaHours))),
      active: item.active,
      recordScope: 'municipal_reference',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      actorUid: adminUid,
      actorRole: 'admin',
      action: 'TAXONOMY_SAVED',
      entityType: 'issue_taxonomy',
      entityId: id,
      summary: `Taxonomy code ${item.code} saved (${item.domain} / ${item.department}).`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveEmergencyRule(
  rule: Omit<EmergencyRuleRecord, 'id' | 'recordScope' | 'createdAt' | 'updatedAt'>,
  adminUid: string
): Promise<void> {
  const id = `rule-${rule.ruleCode.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`;
  const path = `emergency_rules/${id}`;
  try {
    await setDoc(doc(db, 'emergency_rules', id), {
      ruleCode: rule.ruleCode.toUpperCase().slice(0, 40),
      name: rule.name.slice(0, 160),
      keywords: rule.keywords.slice(0, 30),
      taxonomyCodes: rule.taxonomyCodes.slice(0, 20),
      severity: rule.severity,
      ackWindowMinutes: Math.max(1, Math.min(180, Math.round(rule.ackWindowMinutes))),
      active: rule.active,
      recordScope: 'municipal_reference',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await logAudit({
      actorUid: adminUid,
      actorRole: 'admin',
      action: 'EMERGENCY_RULE_SAVED',
      entityType: 'emergency_rules',
      entityId: id,
      summary: `EmergencyGuard rule ${rule.ruleCode} (${rule.severity}) saved.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveMunicipalOffice(
  office: Omit<MunicipalOfficeRecord, 'id' | 'recordScope' | 'createdAt' | 'updatedAt'>,
  adminUid: string,
  existingId?: string
): Promise<void> {
  const id = existingId || `off-${office.officeCode.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`;
  const path = `municipal_offices/${id}`;
  try {
    if (existingId) {
      await updateDoc(doc(db, 'municipal_offices', id), {
        ...office,
        recordScope: 'municipal_reference',
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'municipal_offices', id), {
        ...office,
        recordScope: 'municipal_reference',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await logAudit({
      actorUid: adminUid,
      actorRole: 'admin',
      action: 'MUNICIPAL_OFFICE_SAVED',
      entityType: 'municipal_offices',
      entityId: id,
      summary: `Office ${office.officeCode} (${office.wardName}) saved.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteReferenceDoc(
  col: 'municipal_offices' | 'accident_hotspots' | 'issue_taxonomy' | 'emergency_rules',
  docId: string,
  adminUid: string
): Promise<void> {
  const path = `${col}/${docId}`;
  try {
    await deleteDoc(doc(db, col, docId));
    await logAudit({
      actorUid: adminUid,
      actorRole: 'admin',
      action: 'REFERENCE_RECORD_DELETED',
      entityType: col,
      entityId: docId,
      summary: `Deleted ${col} document ${docId}.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Simple RFC-4180 aware CSV line parser
export function parseCsvText(csvText: string): Array<Record<string, string>> {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const splitRow = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const headers = splitRow(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });
    return row;
  });
}

export async function importOfficesCsv(csvText: string, adminUid: string, adminName: string): Promise<number> {
  const rows = parseCsvText(csvText);
  let imported = 0;
  for (const row of rows) {
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    if (!row.officeCode || !row.officeName || !row.wardId || Number.isNaN(lat) || Number.isNaN(lng)) continue;
    const minLat = Number(row.minLat) || lat - 0.025;
    const maxLat = Number(row.maxLat) || lat + 0.025;
    const minLng = Number(row.minLng) || lng - 0.025;
    const maxLng = Number(row.maxLng) || lng + 0.025;

    const id = `off-${row.officeCode.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`;
    try {
      await setDoc(doc(db, 'municipal_offices', id), {
        officeCode: row.officeCode.slice(0, 40),
        officeName: row.officeName.slice(0, 160),
        department: (row.department || 'Roads & Public Works').slice(0, 120),
        wardId: row.wardId.slice(0, 64),
        wardName: (row.wardName || row.wardId).slice(0, 120),
        address: (row.address || '').slice(0, 300),
        latitude: lat,
        longitude: lng,
        minLat,
        maxLat,
        minLng,
        maxLng,
        contactPhone: (row.contactPhone || '').slice(0, 40),
        primaryOfficerUid: (row.primaryOfficerUid || adminUid).slice(0, 128),
        primaryOfficerName: (row.primaryOfficerName || adminName).slice(0, 120),
        backupOfficerUid: (row.backupOfficerUid || adminUid).slice(0, 128),
        backupOfficerName: (row.backupOfficerName || adminName).slice(0, 120),
        inspectorUid: (row.inspectorUid || adminUid).slice(0, 128),
        inspectorName: (row.inspectorName || adminName).slice(0, 120),
        recordScope: 'municipal_reference',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      imported++;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `municipal_offices/${id}`);
    }
  }
  await logAudit({
    actorUid: adminUid,
    actorRole: 'admin',
    action: 'CSV_OFFICES_IMPORTED',
    entityType: 'municipal_offices',
    entityId: 'csv-batch',
    summary: `Imported ${imported} municipal office & ward boundary record(s) from CSV.`,
  });
  return imported;
}

export async function importAccidentHotspotsCsv(csvText: string, adminUid: string): Promise<number> {
  const rows = parseCsvText(csvText);
  let imported = 0;
  for (const row of rows) {
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    if (!row.recordCode || !row.locationName || Number.isNaN(lat) || Number.isNaN(lng)) continue;

    const id = `acc-${row.recordCode.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`;
    try {
      await setDoc(doc(db, 'accident_hotspots', id), {
        recordCode: row.recordCode.slice(0, 40),
        locationName: row.locationName.slice(0, 200),
        roadName: (row.roadName || '').slice(0, 200),
        wardId: (row.wardId || '').slice(0, 64),
        latitude: lat,
        longitude: lng,
        incidentCount: Math.max(0, Math.round(Number(row.incidentCount) || 0)),
        fatalities: Math.max(0, Math.round(Number(row.fatalities) || 0)),
        injuries: Math.max(0, Math.round(Number(row.injuries) || 0)),
        sourceDataset: (row.sourceDataset || 'Imported Municipal CSV').slice(0, 200),
        verifiedDate: (row.verifiedDate || new Date().toISOString().slice(0, 10)).slice(0, 40),
        recordScope: 'municipal_reference',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      imported++;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `accident_hotspots/${id}`);
    }
  }
  await logAudit({
    actorUid: adminUid,
    actorRole: 'admin',
    action: 'CSV_HOTSPOTS_IMPORTED',
    entityType: 'accident_hotspots',
    entityId: 'csv-batch',
    summary: `Imported ${imported} verified historical accident hotspot record(s) from CSV.`,
  });
  return imported;
}

// ── Real-Time Role-Scoped Firestore Subscriptions ────────────────────────────
export function subscribeReferenceCollection<T>(
  colName: 'issue_taxonomy' | 'municipal_offices' | 'accident_hotspots' | 'emergency_rules',
  onData: (items: T[]) => void
): Unsubscribe {
  const q = query(collection(db, colName), where('recordScope', '==', 'municipal_reference'));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
    },
    (error) => handleFirestoreError(error, OperationType.LIST, colName)
  );
}

export function subscribeNotifications(uid: string, onData: (items: NotificationRecord[]) => void): Unsubscribe {
  const q = query(collection(db, 'notifications'), where('recipientUid', '==', uid), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as NotificationRecord);
      list.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'notifications')
  );
}

export function subscribeComplaintsForRole(
  profile: UserProfile,
  isBootstrappedAdmin: boolean,
  onData: (items: ComplaintRecord[]) => void
): Unsubscribe {
  let q;
  if (isBootstrappedAdmin) {
    q = query(collection(db, 'complaints'), orderBy('createdAt', 'desc'), limit(150));
  } else if (profile.role === 'inspector') {
    q = query(collection(db, 'complaints'), where('assignedInspectorUid', '==', profile.uid), limit(100));
  } else if (profile.role === 'officer') {
    q = query(collection(db, 'complaints'), where('assignedOfficerUid', '==', profile.uid), limit(100));
  } else {
    q = query(collection(db, 'complaints'), where('citizenUid', '==', profile.uid), limit(100));
  }

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ComplaintRecord);
      list.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'complaints')
  );
}

export function subscribeComplaintScopedCollection<T>(
  colName:
    | 'classified_issues'
    | 'ai_analysis'
    | 'evidence'
    | 'inspector_assignments'
    | 'inspection_reports'
    | 'emergency_incidents'
    | 'officer_approvals'
    | 'department_work_orders'
    | 'resolution_records',
  profile: UserProfile,
  isBootstrappedAdmin: boolean,
  onData: (items: T[]) => void
): Unsubscribe {
  let q;
  if (isBootstrappedAdmin) {
    q = query(collection(db, colName), limit(250));
  } else if (profile.role === 'inspector') {
    const field =
      colName === 'inspector_assignments' || colName === 'inspection_reports'
        ? 'inspectorUid'
        : 'assignedInspectorUid';
    q = query(collection(db, colName), where(field, '==', profile.uid), limit(150));
  } else if (profile.role === 'officer') {
    const field =
      colName === 'officer_approvals' || colName === 'department_work_orders'
        ? 'officerUid'
        : colName === 'resolution_records'
        ? 'verifiedByOfficerUid'
        : 'assignedOfficerUid';
    q = query(collection(db, colName), where(field, '==', profile.uid), limit(150));
  } else {
    q = query(collection(db, colName), where('citizenUid', '==', profile.uid), limit(150));
  }

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as unknown as T & { createdAt?: { toMillis?: () => number } }
      );
      list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      onData(list as unknown as T[]);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, colName)
  );
}

export function subscribeAllUsersAdmin(onData: (users: UserProfile[]) => void): Unsubscribe {
  const q = query(collection(db, 'users'), limit(200));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as UserProfile));
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'users')
  );
}

export function subscribeRoleAuthorizations(
  onData: (items: RoleAuthorizationRecord[]) => void
): Unsubscribe {
  const q = query(collection(db, 'role_authorizations'), limit(200));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RoleAuthorizationRecord);
      list.sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'role_authorizations')
  );
}

export function subscribeAuditLogs(
  profile: UserProfile,
  isBootstrappedAdmin: boolean,
  onData: (logs: AuditLogRecord[]) => void
): Unsubscribe {
  const q = isBootstrappedAdmin
    ? query(collection(db, 'audit_logs'), limit(200))
    : query(collection(db, 'audit_logs'), where('actorUid', '==', profile.uid), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditLogRecord);
      list.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'audit_logs')
  );
}
