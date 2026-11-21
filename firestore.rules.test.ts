/**
 * CivicAI Firestore Security Rules Test Suite (Phase 0 — Dirty Dozen Verification)
 * Designed to verify all 12 adversarial payloads return PERMISSION_DENIED against firestore.rules.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collection: string;
  operation: 'create' | 'update' | 'delete' | 'get' | 'list';
  actor: { uid: string; email: string; email_verified: boolean; role: string };
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Self-Role Escalation on User Create',
    collection: 'users/citizen-1',
    operation: 'create',
    actor: { uid: 'citizen-1', email: 'c1@example.com', email_verified: true, role: 'citizen' },
    payload: { uid: 'citizen-1', displayName: 'Attacker', email: 'c1@example.com', role: 'admin', language: 'en', onDuty: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Self-Role Escalation on User Update',
    collection: 'users/citizen-1',
    operation: 'update',
    actor: { uid: 'citizen-1', email: 'c1@example.com', email_verified: true, role: 'citizen' },
    payload: { role: 'officer' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Cross-User PII Read',
    collection: 'users/citizen-2',
    operation: 'get',
    actor: { uid: 'citizen-1', email: 'c1@example.com', email_verified: true, role: 'citizen' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Citizen Complaint Owner Spoofing',
    collection: 'complaints/cmp-spoof-1',
    operation: 'create',
    actor: { uid: 'citizen-1', email: 'c1@example.com', email_verified: true, role: 'citizen' },
    payload: { complaintCode: 'CIV-1001', citizenUid: 'citizen-2', rawText: 'Spoofed report' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow Ghost Field Injection',
    collection: 'complaints/cmp-1',
    operation: 'update',
    actor: { uid: 'citizen-1', email: 'c1@example.com', email_verified: true, role: 'citizen' },
    payload: { landmark: 'Near Gate 2', adminOverride: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Unverified Email Admin Spoof',
    collection: 'users',
    operation: 'list',
    actor: { uid: 'spoof-uid', email: 'vishalkebaba@gmail.com', email_verified: false, role: 'citizen' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Document ID Poisoning',
    collection: 'complaints/bad id $$$ ' + 'a'.repeat(150),
    operation: 'create',
    actor: { uid: 'citizen-1', email: 'c1@example.com', email_verified: true, role: 'citizen' },
    payload: { complaintCode: 'CIV-9999', citizenUid: 'citizen-1' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Orphaned Evidence Creation',
    collection: 'evidence/ev-orphan-1',
    operation: 'create',
    actor: { uid: 'citizen-1', email: 'c1@example.com', email_verified: true, role: 'citizen' },
    payload: { complaintId: 'non-existent-complaint', citizenUid: 'citizen-1', sha256: 'a'.repeat(64) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Audit Log Tampering',
    collection: 'audit_logs/log-1',
    operation: 'delete',
    actor: { uid: 'admin-1', email: 'vishalkebaba@gmail.com', email_verified: true, role: 'admin' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Client Backdated Timestamp Forgery',
    collection: 'complaints/cmp-time-1',
    operation: 'create',
    actor: { uid: 'citizen-1', email: 'c1@example.com', email_verified: true, role: 'citizen' },
    payload: { complaintCode: 'CIV-1002', citizenUid: 'citizen-1', createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Terminal State Modification on Closed Complaint',
    collection: 'complaints/cmp-closed-1',
    operation: 'update',
    actor: { uid: 'inspector-1', email: 'insp@civic.gov', email_verified: true, role: 'inspector' },
    payload: { status: 'inspector_assigned' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Citizen Direct MFIR Creation',
    collection: 'inspection_reports/mfir-1',
    operation: 'create',
    actor: { uid: 'citizen-1', email: 'c1@example.com', email_verified: true, role: 'citizen' },
    payload: { complaintId: 'cmp-1', citizenUid: 'citizen-1', inspectorUid: 'citizen-1', siteNotes: 'Fake MFIR' },
    expected: 'PERMISSION_DENIED',
  },
];
