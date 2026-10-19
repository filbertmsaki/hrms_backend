# Resignation and Exit: Phase 6 Staging UAT

Status: **Local UAT profile prepared; staging execution and sign-off pending.** Automated tests and local PostgreSQL checks from Phase 5 are not a substitute for staging sign-off.

## Environment readiness

- [ ] Provision a dedicated UAT database from a recent sanitized copy or approved synthetic dataset. Never point UAT at the development, test, or production database.
- [x] Prepare a local backend UAT profile with loopback app URLs, Redis disabled, and a database endpoint deliberately set to `127.0.0.1:1` so it cannot silently connect to the development database. The profile is ignored by git.
- [x] Isolate backend UAT command environment loading to `.env.uat.local` plus explicitly provided process environment; generic `.env.local` and `.env` values are not merged for UAT.
- [x] Add a tracked frontend UAT template. Next.js runs UAT with `NODE_ENV=production` and distinguishes it using `APP_ENV=uat`; copy the template to `.env.production.local` when configuring a local frontend UAT run.
- [ ] Supply real UAT runtime settings through the deployment secret store: dedicated database host, port, name, username/password, TLS policy, Redis, application URLs, auth keys, and notification provider configuration. Do not commit secrets here or in `.env.uat.local`.
- [ ] Set `APP_ENV=uat` and verify the effective database identity with the UAT owner before any migration or write.
- [ ] Take and verify a UAT database backup. Confirm restore procedure and rollback owner.
- [ ] Apply migrations to the confirmed UAT database, then inspect migration status and run readiness checks. Record the target identity, migration result, app version, and date without recording credentials.
- [ ] Configure a UAT-only mail sink or approved test recipients. Confirm notification links use the UAT frontend URL. Disable live SMS, push, device, and identity-provider side effects unless their sandbox endpoints are explicitly configured.
- [ ] Configure HR-approved notice policies, workflow steps, role permissions, exit-interview requirement, asset/clearance requirements, settlement owners, letter settings, and termination schedule. Capture policy owner and approval in the sign-off record.
- [ ] Create synthetic employees and UAT users for employee, assigned approver, manager, HR, Finance, IT/security, and system-worker roles. Use varied branches, departments, positions, and employment types.

## UAT scenarios

For each run, record the request code, exit type, role used, expected result, actual result, evidence link, tester, date, and pass/fail. Use synthetic records only.

| ID | Scenario | Pass condition |
| --- | --- | --- |
| UAT-01 | Employee submits a resignation with a valid notice date and last working day | Request is created for the signed-in employee, appears in HR review, and employee sees status and notice summary. |
| UAT-02 | Employee submits missing reason/date, a date before the notice date, or a resignation for another employee | Invalid request is rejected; no request or unrelated employee change is created. |
| UAT-03 | HR creates each supported exit type: resignation, termination, retirement, contract end, absconded, deceased, layoff, other | Correct workflow, notice rule, access mode, and final employee status are used for the configured policy. |
| UAT-04 | Duplicate active request and subsequent request after cancellation/completion | Active duplicate is rejected; a closed request does not permanently block a later valid exit. |
| UAT-05 | Approval sequence with multiple levels; unauthorized and out-of-order actors attempt decisions | Only the currently assigned approver can act; decisions and comments are audited; later levels activate in order. |
| UAT-06 | Rejection with and without comments, then HR edits and resubmits | Employee receives the correct in-app/email notice; reason is visible as intended; request can be corrected and re-routed. |
| UAT-07 | Notice policy by employment type, grade, position, and confirmation status; shortfall and excess boundaries | Correct policy wins; served/shortfall/excess days match independently calculated expected values. |
| UAT-08 | HR waives notice with a reason; try waiver without permission and without a reason | Authorized waiver is saved with reason and audit history; unauthorized or reasonless waiver is blocked. |
| UAT-09 | Required interview on/off and draft/completed interview | With requirement enabled, incomplete interview blocks readiness; completed interview passes. With it disabled, interview remains optional. |
| UAT-10 | Required tasks, approvals, clearances, action items, assets, and settlement are independently left unresolved | Each required item blocks readiness/finalization; resolved or explicitly waived items follow policy. |
| UAT-11 | Upload, list, download, and attempt unauthorized access to exit documents and generated letters | Files remain private; only authorized users can access them; downloads and generation are audited; letter fields are correct. |
| UAT-12 | Access termination at last working day, immediate mode, and manual mode | Correct timing occurs; membership/session/access/device operations match enabled integrations; no premature termination occurs. |
| UAT-13 | Force one operation failure, retry it, and repeat a completed request | Failure is visible and blocks finalization; retry is safe; completed operations and side effects are not duplicated. |
| UAT-14 | Finance completes payroll final pay and all settlement items | Payroll result is independently reconciled; offboarding cannot finalize until all required items are resolved. |
| UAT-15 | Complete exit and finalize | Employee status/date, assignments, attendance artifacts, access records, letters, audit snapshot, notifications, and reports are consistent. |
| UAT-16 | Employee, approver, owner, HR, and Finance inspect records and try cross-employee/cross-company access | Each role sees only permitted records and fields; unauthorized reads and writes are denied server-side. |
| UAT-17 | Overdue reminders, queue retries, email delivery, and notification links | Correct recipient receives one actionable message; links return to UAT; retries do not create duplicate alerts. |
| UAT-18 | Representative concurrent approvals and a medium-sized batch of exits | No duplicate active exit, lost update, double finalization, cross-tenant leak, or unacceptable delay occurs. |

## Release gates and sign-off

- [ ] All required scenarios pass, with defects recorded and resolved or explicitly accepted by the owner.
- [ ] HR signs workflow, notice, role, exit interview, document, and employee-status behavior.
- [ ] Finance signs final-pay/settlement reconciliation and outstanding-item handling.
- [ ] IT/security signs access revocation, device integration scope, identity behavior, and recovery evidence.
- [ ] Operations confirms backups, migration status, health/readiness, logs, queue monitoring, rollback, and restoration evidence.
- [ ] Product owner records go/no-go and date. A failed required gate means no production rollout.

## Current workspace finding

The local UAT profile and environment isolation are prepared, and the loader was checked to confirm it does not inherit database credentials or Redis URLs from generic environment files. The local profile intentionally cannot connect to a database until dedicated UAT settings are supplied. UAT execution has not started: no staging credentials, database, mail sink, test identities, or policy sign-off are available in this workspace. No UAT migrations, seeds, deployments, or workflow writes have been performed.
