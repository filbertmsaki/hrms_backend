# Unified seeding: initial implementation

This runner is an incremental implementation, not a complete production initialization. It uses the same code in every environment. It neither creates companies nor imports employees, accounts, financial products, statutory rates or company policies. Existing legacy commands remain separate and have not been certified safe for production.

After migrations have been applied using an independently approved deployment procedure, examples are:

```sh
npm run seed:all -- --company=42 --employee-prefix=AICL --employee-padding=3 --employee-next=1 --proposed-attendance --probation-effective-from=2026-11-17
npm run seed:unified -- --module=reports
npm run seed:unified -- --company=42 --module=activities
npm run seed:unified:built -- --company=42 --module=reports,activities
npm run seed:module -- --module=authorization --company=42
npm run seed:dry-run -- --company=42 --module=reports,activities
npm run seed:validate -- --company=42 --module=reports,activities
```

The current selection covers authorization, employees, leave, attendance, payroll, probation, onboarding, offboarding, notifications, reports and activities. It requires an existing company ID, explicit numbering parameters, an explicit acknowledgement to create the proposed attendance schedule, and an effective date for the probation draft. These flags do not approve or activate policies. Authorization creates missing permissions and roles from existing catalogs, but does not change existing grants. Employee numbering is insert-only; existing employees without a sequence require manual reconciliation. Leave types, payroll components, attendance settings, probation and onboarding/offboarding workflows are proposed inactive records, not approved operational policies. The payroll catalog deliberately omits accounting mappings. Notifications reuse the service's global channel catalog. Reports creates global registered definitions and inactive company workforce report packs. Activities uses the existing company catalog. Existing matching records and their children are preserved. Onboarding/offboarding selections also initialize authorization first.

One PostgreSQL transaction encompasses the selected modules. A database-wide transaction advisory lock prevents overlapping executions of this runner; other provisioning paths and older commands do not acquire this lock. A failed transaction rolls back, and the runner refuses an unknown company or unavailable lock. Apply the `UnifiedSeederExecutionHistory` migration through the reviewed migration process before using the runner. Completed executions record the runner version, company, selected modules and timestamps in the same transaction; a failure is logged separately on a best-effort basis without secrets or error details. Dry runs do not write history, but PostgreSQL sequence values can still advance. Validation performs limited read-only presence checks and always reports uncovered modules for review; exit code 2 means review or missing configuration. It is not a production-readiness certification. Database uniqueness and concurrency with other paths still require integration testing. No automatic application-startup execution is added.

The TypeORM data-source no longer auto-discovers `*.seed` files: explicit project runners select their seeders. External scripts that relied on glob discovery must switch to an explicit runner.

## Remaining work and limitations

Production readiness is BLOCKED. The runner does not yet cover finance products, employee movements, KPI/performance, devices, organization provisioning and other modules. Leave types alone do not initialize leave policies, balances or approvals; payroll components alone do not initialize calendars, salary structures or statutory rules. Validation is partial; approved updates, cross-runner locks, effective-date governance and a complete policy activation lifecycle remain missing. The older seeders include company-specific records and policy values that require review before their logic can be migrated. Statutory payroll rates and finance products must not be activated without verification and approval. The existing `seed:run` chain is production-blocked, and direct legacy commands remain outside that safeguard. Do not infer production readiness from the new runner's environment independence.

The no-op `018-shift-assignments.seed.ts` was removed. Direct shift assignments take precedence over employee and company timetables in the attendance resolver; indiscriminate assignment can therefore hide the weekday/Saturday timetable. Do not delete existing assignments automatically. Remaining legacy files are retained pending dependency and parity verification. Fresh and existing isolated PostgreSQL tests, service integration, RBAC alignment, concurrency against all writers, deployment and rollback validation remain required. Never target a live production database without explicit authorization.
