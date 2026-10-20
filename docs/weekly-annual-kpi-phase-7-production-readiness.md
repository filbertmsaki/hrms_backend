# Weekly-to-Annual Reporting and KPI: Phase 7 Production Readiness

**Status:** Test-database deployment rehearsal passed. Production release remains blocked by Phase 6 owner sign-offs and must go through the approved deployment operator/pipeline.

## Rehearsal record

| Item | Result |
| --- | --- |
| Database | Dedicated `hrms_test_db`; no production connection used |
| Migration rehearsal | Applied all four pending migrations, including `AddQuarterlyAnnualReportScheduling1794900000000` |
| Post-migration status | `migration:show` reports no pending migrations |
| Seed rehearsal | `seed:run` completed; report packs were provisioned inactive and the insurance KPI starter stayed draft |
| Post-seed report API e2e | Passed: report catalog, all report endpoints, and demo quarterly/annual score rows |
| Backend lint and typecheck | Passed in the Phase 6 run |
| Backend production build | PASS: `npm run build` |

The seed run also reported 327 companies receiving the inactive report-pack templates. No SMTP configuration, recipients, or schedule activation are assigned by these seeds. The five insurance KPI examples remain provisional with no approved targets or role scope.

## Production release gates

- [ ] HR, Finance/reporting, KPI/business, and Security owners complete Phase 6 UAT and sign [the Phase 6 UAT register](weekly-annual-kpi-phase-6-uat.md).
- [ ] Owner-approved FRS 9.1–9.4 mapping, company financial-year basis, formulas, insurance KPI catalogue, output format, access roles, recipients, and delivery times are recorded.
- [ ] Operations confirms the intended production database and application version from the deployment secret store. Do not copy local `.env.production.local` values into a deployment or document.
- [ ] Take a production backup and verify a restore in the approved recovery environment; record backup ID, restore evidence, owner, and timestamp.
- [ ] Verify the pipeline has the reviewed commit, migrations, backend build artifact, configuration, and rollback release artifact.
- [ ] Confirm scheduler/worker health, private report storage, SMTP delivery monitoring, alert recipients, support owner, and incident runbook.
- [ ] Deploy first with report templates/schedules inactive. Configure approved recipients and mail delivery only after the owners approve each company's settings.
- [ ] Verify migrations with the target environment's migration status command and check readiness, logs, scheduled worker, and permission grants.
- [ ] Do not publish or activate the insurance KPI draft template until its catalogue, target values, weights, evidence requirements, and role scope are approved and configured.

## Migration and rollback notes

`AddQuarterlyAnnualReportScheduling1794900000000` adds PostgreSQL enum labels using `ADD VALUE IF NOT EXISTS`. Its `down()` is intentionally empty because removing enum labels safely could invalidate existing schedule/template rows. If an application release is rolled back, the enum labels remain. Keep the prior application artifact available and use a forward fix for data/configuration issues; do not assume `migration:revert` removes the schema change.

The local test migration rehearsal also applied attendance/location and activity-policy migrations `179460`–`179480`, because the TypeORM migration runner applies the entire pending queue in timestamp order. Confirm the reviewed release contains those migrations and that their separate feature owners authorize them before a shared production rollout.

## Environment finding and deployment decision

The local UAT profile is missing a database password and mail configuration, and Phase 6 has no human sign-offs. The local production profile has database and mail settings, but this rehearsal did not connect to or validate that target. No production migration, seed, activation, or deployment was performed. Phase 7 is not release-complete until the gates above are satisfied by the owners and deployment operator.
