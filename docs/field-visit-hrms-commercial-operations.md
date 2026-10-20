# Field Visit Tracking: HRMS commercial rules and operations

## HRMS field definitions

- **Potential sales value** is the employee's estimate of the expected total sales value for the opportunity at the time of the visit. It is a forecast and is not an accounting posting.
- **Premium value** is an optional estimated premium amount associated with the opportunity. It is stored independently from potential sales value and can use a separately selected supported currency.
- **Actual sales value** is the realized amount confirmed by a manager. Employees cannot set it. HRMS requires a non-negative amount before an opportunity can be marked `WON`; its currency is the opportunity's sales currency.
- **Opportunity stages:** `IDENTIFIED` means recorded; `FOLLOW_UP` means an action is due; `QUOTATION_ISSUED` means a formal quote was sent; `WON` means accepted and requires actual value; `LOST` means declined/closed; `DEFERRED` means postponed; `CANCELLED` means invalidated. Managers own stage and actual-value changes, which require a reason and create an audit entry.
- **Stage transitions:** active opportunities may move through the allowed working stages; `WON`, `LOST`, and `CANCELLED` are terminal. Terminal opportunities cannot be reopened or moved to another stage. A correction requires a new opportunity and a reasoned manager audit entry for the original record.
- **Currency:** each company has a default currency (`TZS` for existing companies) and an allowed list (`TZS` initially). HRMS normalizes codes to uppercase, blocks values outside the list, and never adds amounts across different currencies in reports.
- **Source system and external reference:** optional trace metadata only. This HRMS module does not perform a live external CRM sync.

## Configuration and access

The Field Visit setup screen has a commercial policy editor. A user with `field_visits:config` sets the default and supported three-letter currency codes. The default must be included in the supported list. Existing companies receive a `TZS` policy during migration; new companies receive a default policy on first read if one is absent.

Employee web and native screens read this policy to select currencies. Backend validation remains authoritative. Native manager tools use the same protected APIs as the web setup screen. Manager stage/actual changes require `field_visits:manager:review`; commercial policy changes require `field_visits:config`. Both are company-scoped and changes are audited.

### Company role access

The company-role seed and access migration grant the following baseline:

| Role | Field Visit access |
| --- | --- |
| Employee | Own visits, plans, check-in/out, evidence, follow-ups, opportunities, and expenses |
| Department/Branch Manager | Own employee access plus team visits, map locations, plans, and reviews |
| HR Officer | Own employee access plus company HR summaries |
| HR Manager | HR Officer access plus manager review, map locations, and company policy configuration |
| Company Admin | All Field Visit permissions |

Data scope and manager relationships still constrain records. Verify assigned real accounts and any company-specific role changes in UAT after applying migration `1794500000000`.

### Synthetic UAT sample records

The opt-in seed creates one internal visit and one opportunity for an existing employee. It has no party/customer, GPS, or external CRM data and uses the tenant's configured default currency. It is idempotent for the selected company and employee. It refuses to run unless `APP_ENV=uat`, the database name does not contain `prod`, and `FIELD_VISIT_DEMO_CONFIRM=YES`.

```powershell
cd backend
$env:APP_ENV = 'uat'
$env:FIELD_VISIT_DEMO_CONFIRM = 'YES'
$env:FIELD_VISIT_DEMO_COMPANY_ID = 'YOUR_UAT_COMPANY_ID'
$env:FIELD_VISIT_DEMO_EMPLOYEE_ID = 'YOUR_UAT_EMPLOYEE_ID'
npm run seed:field-visit-uat-demo
```

Use an employee with an assigned manager for the manager review path. This command uses the configured `DB_*` connection; verify it points to UAT before running. The seed does not select or create users, memberships, role assignments, or policy configuration.

## Native offline behavior

- The employee app caches the last synced visit list and stores check-in, check-out, and opportunity actions in its SQLCipher-enabled SQLite outbox. The outbox is scoped to the signed-in company and user.
- Each queued action keeps its client request ID and capture timestamp/location. The app flushes on reconnect and exposes the pending count. Rejected actions remain visible as `NEEDS_REVIEW`; employees can discard them after review.
- Field check-in/out events can be submitted up to `FIELD_VISIT_OFFLINE_SYNC_MAX_DAYS` old (3 days by default). The backend rejects future times, records delayed events as offline captures, and uses request IDs to avoid duplicate events. Older pending records require manager review and must not be silently recreated with a new timestamp.
- Offline validation still depends on the server's saved visit status and company policy. Test on airplane mode and with connectivity loss during submission before enabling the feature for a production workforce.

## HRMS acceptance procedure

Run against the isolated test database after migrations:

```powershell
cd backend
$env:APP_ENV = 'test'
npm run migration:run
npm run test:e2e -- --runInBand --runTestsByPath test/field-visit-commercial.e2e-spec.ts
```

Acceptance checks:

1. Set an allowed currency list, save, and confirm default currency is included.
2. Record potential and premium values from web and native clients in allowed currencies; confirm values stay distinct in visit details and report rows.
3. Attempt an unsupported currency and confirm HRMS rejects it.
4. Attempt employee writes to actual value or stage and confirm the API DTO rejects/ignores those fields under whitelist validation.
5. As an authorized manager, record actual value and mark `WON`; confirm a reason is mandatory, the audit row exists, and `WON` without a realized amount is rejected.
6. Confirm commercial summary groups sales and premium by currency and only counts manager-validated actual value.
7. Verify a user outside the employee's manager scope cannot change opportunity values.
8. Attempt to move a `WON`, `LOST`, or `CANCELLED` opportunity to another stage and confirm HRMS rejects it; confirm the rejection leaves the audit/history intact.
9. Replay an opportunity request ID and confirm HRMS creates one record. Reuse a sync request ID with a different payload and confirm HRMS returns a conflict.
10. In the native app, load a visit list online, switch to airplane mode, queue a check-in and opportunity, restore connectivity, and verify each action syncs once with the original capture time/location. Confirm stale or rejected actions appear for review.
11. As a manager on native, configure a company currency policy and update a working-stage opportunity; confirm insufficient permissions are rejected and successful changes are audited.

For a full human acceptance cycle, deploy the migration and role update to UAT, seed the synthetic record above, then use real employee, line-manager, HR Officer, HR Manager, and unauthorized test accounts:

1. HR Manager reviews the company policy, sets the approved default/supported currencies, confirms whether employees may enter forecast values, and signs off stage rules.
2. HR verifies company memberships and role assignments. Confirm employee can only see own records; manager only sees the assigned team; HR can see summaries; only HR Manager/Company Admin can change configuration.
3. Employee opens the seeded visit, records check-in/out from web, adds notes/evidence/opportunity, and submits. Confirm the manager can review and update stage/value with a reason. Verify audit history and reports.
4. From a physical mobile device, repeat with airplane mode: queue visit/check-in/out/opportunity actions, reconnect, verify original capture time and coordinates, one server record per action, and visible review state for rejected items. Check offline data is retained after app restart.
5. Operations applies production migrations through the approved pipeline after backup and confirms alerts, support owner, restore procedure, and rollback plan. Do not treat UAT checks as production deployment approval.
6. For the first live cycle, reconcile a sample from source visit records to visit details, manager review history, and HRMS reports. Record sample size, owner, date, discrepancies, and resolution before closing the cycle.

## Production readiness checklist

Before production use, the HRMS service owner should complete and record:

- Company-specific default and supported currency configuration.
- Role assignments for employee capture, manager review, and commercial policy setup.
- A backup before applying migrations; then run migrations through the approved deployment pipeline and confirm the new table/columns exist.
- Monitoring of API errors on `/api/me/field-visits`, `/api/manager/field-visits`, `/api/manager/field-visits/commercial-summary`, and manager review actions; route repeated failures to the HRMS on-call/support queue.
- Daily review of field visit sync failures, rejected currency values, and pending opportunity validations.
- A rollback plan: stop writes, restore the pre-deployment database backup if the release cannot be repaired, and redeploy the prior application version. Do not run the schema down migration after commercial policy records have been configured unless data loss is accepted.
- First-cycle reconciliation between visit records and HRMS opportunity summaries; record who reviewed it, date, sample size, and discrepancies.

Production role ownership, backups, alert routing, deployment, physical device checks, and first-cycle reconciliation require authorized UAT/production operators; they are not claimed complete by a code change. Do not run this UAT seed in production.
