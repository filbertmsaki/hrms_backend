# Location Privacy and Daily Work Activity: Phase 6–8 execution record

**Record date:** 2026-10-20 (Africa/Dar_es_Salaam)  
**Workspace:** `D:\Projects\Office\HRMS`  
**Execution status:** Application changes and demo fixture implemented; UAT execution is still blocked. No UAT or production data was changed.

## Phase 6 — UAT on web and mobile

**Status: NOT RUN / NOT APPROVED**

| Check | Result | Evidence / blocker |
| --- | --- | --- |
| UAT database connectivity | Blocked | A read-only `migration:show` attempt using the guarded UAT profile failed with `ECONNREFUSED 127.0.0.1:1`. The configured password is blank. No migration or seed was run and no UAT data was changed. A local PostgreSQL listener is not a substitute for the isolated UAT endpoint; its authentication also requires an unavailable password. |
| Employee, manager, HR, privacy reviewer accounts | Not verified | No UAT account matrix or credentials are available in the workspace. The demo seed requires existing employee and manager IDs and does not create accounts or grant roles. |
| Location notice and acknowledgement | Implemented in code; not UAT-verified | Added company-scoped, versioned notices and employee receipt acknowledgements. Web and native screens display the current notice; attendance punches and field visit GPS events require acknowledgement when the active notice requires it. Demo notice is marked `DEMO_APPROVED` and is not company or legal approval. Acknowledgement confirms receipt/review, not legal consent. |
| HR privacy management | Implemented in code; not UAT-verified | `location_privacy:manage` gates notice publishing and acknowledgement review. Demo approval is allowed only for an isolated UAT environment. Company-approved notices require an approval reference. |
| Location notice demo data | Ready; not seeded | The existing UAT Daily Activity demo seed creates a clearly marked notice if none is active. It does not pre-create employee acknowledgement; the test employee must acknowledge through the UI. The seed command was not run because UAT DB credentials are incomplete. |
| Web UAT | Not run | Requires reachable UAT, configured roles, signed policy and test accounts. |
| Native mobile UAT | Not run | The UAT profile has no mobile API origin. Physical device and real account checks are still required. |
| Reminder/notification delivery | Not verified | No mail/SMTP delivery configuration is present in the UAT profile. In-app action creation is not evidence that a person received an alert. |
| Automated workflow endpoint suite | Inconclusive | `test/work-activities-flow.e2e-spec.ts` was started against the isolated `hrms_test_db`, emitted no test results, and was stopped. No pass/fail result is claimed. |
| Local code checks for location notice change | Passed | Backend typecheck and focused ESLint pass; frontend ESLint and native TypeScript pass; 3 focused location-privacy service tests pass. These do not count as web/native UAT. |
| HR / Privacy / Security / business sign-off | Not recorded | Approval record remains unsigned. |

**Acceptance work remaining:** run migrations and the guarded demo seed against isolated UAT, verify real employee/manager/HR/privacy-reviewer flows on web and device, confirm company notice wording and policy with stakeholders, and attach signed UAT evidence. Do not treat demo notice or demo approval as company policy sign-off.

## Phase 7 — Production preparation and deployment

**Status: NOT STARTED; deployment target and approvals unavailable**

- No production database or deployment connection was used. No production credential, approved pipeline run, deployment owner, or change window is configured in this workspace.
- No migrations were applied and no company configuration was changed.
- Production backups, restore test, scheduled job/scheduler health, notification recipients, alert routes, support ownership, permissions, privacy settings, and rollback steps are unverified.
- Keep production location views disabled until Phase 6 privacy and permission checks pass and owners sign the release record.
- Apply approved migrations through the authorized deployment pipeline only after Phase 6 sign-off. Current workspace includes migrations `1794600000000-AddAttendanceLocationPrivacyControls`, `1794700000000-AddActivityReviewEscalationPolicy`, and `1794800000000-AddLocationPrivacyNoticeAcknowledgement`; none was applied in this execution.

## Phase 8 — First live cycle reconciliation

**Status: NOT STARTED — no live cycle exists to reconcile.**

| Reconciliation item | Result |
| --- | --- |
| Attendance/visit location events vs. source events | Not sampled; production capture not available. |
| Location reads vs. access logs | Not sampled; UAT audit read was not executed. |
| Activity reports, evidence, reviews, reminders, escalations vs. approved policy | Not sampled; no signed policy or live submissions available. |
| Error, late submission, overdue review, retention monitoring | Not configured or observed. |
| Discrepancies, remediation owner, sign-off | No live evidence; owners and sign-off not assigned. |

## Required actions to resume

| Action | Owner | Evidence required | Status |
| --- | --- | --- | --- |
| Provision a reachable isolated UAT endpoint and credential through the secret store | IT / DBA | Successful authenticated read-only `migration:show` against the confirmed UAT database | Blocked (configured target refuses connection at `127.0.0.1:1`; password blank) |
| Configure UAT mobile API origin and notification test destination | IT / Mobile / HR Ops | Mobile connectivity and test notification receipt | Blocked |
| Provide UAT account matrix and role assignments | HR / UAT administrator | Employee, assigned manager, HR, privacy reviewer, unauthorized accounts | Blocked |
| Approve policy values and location notice wording | HR / Privacy / Legal / business owner | Signed company policy approval record | Blocked |
| Apply migrations, run demo seed, and verify notice acknowledgement evidence | Product / Engineering + UAT lead | Migration output, seeded demo notice, employee acknowledgement, and capture enforcement result | Blocked on reachable UAT endpoint, credential, and test account IDs |
| Run Phase 6 UAT with web/native accounts and complete all acceptance evidence | UAT lead | Signed acceptance record and account matrix | Not started |
| Authorize Phase 7 production change | Release owner | Backup/restore, migrations, monitoring, rollback and approvals | Not started |
| Reconcile and sign off first live cycle | HR / Privacy / IT | Source-to-report and access-log reconciliation | Not started |

Do not mark Phases 6–8 complete until their actual acceptance evidence and authorized signatures are attached. See [Phase 6 hypercare checklist](./location-privacy-daily-activity-phase-6-go-live-hypercare.md) for the rollout and operations record.
