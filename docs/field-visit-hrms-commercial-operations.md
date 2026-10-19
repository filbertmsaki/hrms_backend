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

## Production readiness checklist

Before production use, the HRMS service owner should complete and record:

- Company-specific default and supported currency configuration.
- Role assignments for employee capture, manager review, and commercial policy setup.
- A backup before applying migrations; then run migrations through the approved deployment pipeline and confirm the new table/columns exist.
- Monitoring of API errors on `/api/me/field-visits`, `/api/manager/field-visits`, `/api/manager/field-visits/commercial-summary`, and manager review actions; route repeated failures to the HRMS on-call/support queue.
- Daily review of field visit sync failures, rejected currency values, and pending opportunity validations.
- A rollback plan: stop writes, restore the pre-deployment database backup if the release cannot be repaired, and redeploy the prior application version. Do not run the schema down migration after commercial policy records have been configured unless data loss is accepted.
- First-cycle reconciliation between visit records and HRMS opportunity summaries; record who reviewed it, date, sample size, and discrepancies.

Production role ownership, backups, alert routing, deployment, and first-cycle reconciliation are operational actions and are not claimed complete by this code change.
