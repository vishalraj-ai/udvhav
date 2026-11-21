# CivicAI Firestore Security Specification (Phase 0 TDD)

## 1. Core Data Invariants
1. **Strict Role Immutability**: A newly registered user (other than the bootstrapped admin email with verified email) can ONLY create `/users/{uid}` with `role == "citizen"`. No user can ever modify their own `role` field. Only an Administrator can assign `inspector`, `officer`, or `admin` roles.
2. **PII Isolation**: `/users/{uid}` documents contain email and phone PII and are strictly readable ONLY by `request.auth.uid == uid` or `isAdmin()`.
3. **Citizen Isolation**: Citizens can read and list ONLY complaints, evidence, classified issues, AI analyses, inspection reports, work orders, and resolutions where `resource.data.citizenUid == request.auth.uid`.
4. **Staff Case Authorization**: Inspectors access ONLY cases where `assignedInspectorUid == request.auth.uid`; Municipal Officers access ONLY cases where `assignedOfficerUid == request.auth.uid` or `backupOfficerUid == request.auth.uid`.
5. **Immutable Audit Trail**: `/audit_logs/{logId}` supports verified `create` (with `actorUid == request.auth.uid` and `createdAt == request.time`) and strictly denies all `update` and `delete`.
6. **Terminal State Locking**: Once a complaint reaches `closed`, non-admin updates are blocked. Once an emergency incident reaches `resolved`, non-admin updates are blocked.
7. **Referential Integrity**: Child documents (`evidence`, `classified_issues`, `ai_analysis`, `inspector_assignments`, `inspection_reports`, `emergency_incidents`, `officer_approvals`, `department_work_orders`, `resolution_records`) must reference an existing `complaintId` in `/complaints/{complaintId}`.
8. **Zero `get()`/`exists()` inside `allow list`**: Every `allow list` rule evaluates only `request.auth` and `resource.data` to guarantee O(1) security evaluation and prevent read cost explosions.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Role Escalation on Create**: Citizen attempts to create `/users/{uid}` with `role: "admin"`. Expected: `PERMISSION_DENIED`.
2. **Self-Role Escalation on Update**: Citizen attempts to update `/users/{uid}` changing `role` from `"citizen"` to `"officer"`. Expected: `PERMISSION_DENIED`.
3. **Cross-User PII Read**: Authenticated citizen B attempts `get` on `/users/{citizenA_uid}`. Expected: `PERMISSION_DENIED`.
4. **Citizen Complaint Spoofing**: Citizen A attempts to create `/complaints/{id}` with `citizenUid: "citizenB_uid"`. Expected: `PERMISSION_DENIED`.
5. **Shadow / Ghost Field Injection**: Citizen attempts to update a complaint with an extra unauthorized key `adminOverride: true`. Expected: `PERMISSION_DENIED`.
6. **Unverified Email Admin Spoof**: Token with `email: "vishalkebaba@gmail.com"` and `email_verified: false` attempts admin read on `/users`. Expected: `PERMISSION_DENIED`.
7. **ID Poisoning**: Attacker attempts to create `/complaints/bad id with spaces and $$$` or 200-char ID. Expected: `PERMISSION_DENIED`.
8. **Orphaned Evidence Creation**: Attacker attempts to create `/evidence/{id}` referencing a non-existent `complaintId: "ghost-999"`. Expected: `PERMISSION_DENIED`.
9. **Audit Log Tampering**: Even an admin attempts to `update` or `delete` `/audit_logs/{logId}`. Expected: `PERMISSION_DENIED`.
10. **Client Timestamp Forgery**: Attacker attempts to create a complaint with a backdated client timestamp instead of `request.time`. Expected: `PERMISSION_DENIED`.
11. **Terminal State Re-opening**: Non-admin attempts to update a complaint whose status is already `"closed"`. Expected: `PERMISSION_DENIED`.
12. **Citizen Unauthorized MFIR Submission**: Citizen attempts to create an `/inspection_reports/{id}` document directly. Expected: `PERMISSION_DENIED`.
