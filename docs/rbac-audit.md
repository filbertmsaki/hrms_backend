# Roles and permissions audit

## Baseline, 23 November 2026

The backend seed defines 521 unique permission keys. A read-only inspection of the configured UAT database found 591 unique keys. Of those, 112 used a bare verb, dots or more than one colon. The 70 additional database entries cover KPI and performance operations. Their presence in a database does not establish which integrations still use them. Catalogue and grant changes must account for those entries.

| Area | Existing implementation and finding |
| --- | --- |
| Assignments | PostgreSQL stores a role's grants in `permission_role`, platform-user grants in `permission_user` and membership grants in `company_user_permissions`. Permission names are globally unique. Role audit records have foreign keys to permission IDs. Security events also record permission IDs. |
| Company access | An active membership supplies company roles and direct grants. The JWT strategy reloads the user's current membership and permissions. TenantGuard verifies company context. PlatformGuard separately requires the platform scope and owner account type. Some service-level owner checks also trusted a role name. |
| Company names | The current company controllers require `companies:read`, `companies:create` and `companies:update`. Older company verbs were also seeded and accepted by the UI. The old platform-only list label and the shared company-read capability have different assignment scopes. Blindly transferring an old-only grant would authorize operations its holder previously could not perform. |
| Leave and account security | Directional aliases let a balance reader satisfy a management check. Other pairs distinguish own balances, annual generation, carry-forward and manual adjustments. Two-factor enable, disable and full administration are separate operations. These require explicit operation rules. |
| Data scope | HrAccessService already combines branch and department assignments, company-filtered employee queries and the reporting hierarchy. Some paths inferred team scope from an action or included the employee without an explicit scope. The hierarchy includes indirect reports. |
| Role administration | Twelve default company roles and four platform roles are seeded. New-company provisioning preserves existing roles. The membership and role endpoints both manage grants. Each entry point needs the same delegation ceiling. A display label is not a safe identifier for choosing grants. |
| Frontend | The permission picker, roles table, member-access screens and sidebar already exist. The frontend separately normalized punctuation, expanded aliases, accepted wildcards and guessed some module permissions from prefixes. Its all-permissions test fixture also contained browser event names. |
| Background work | Leave-balance imports store the confirming actor in a JSON processing context. Pending jobs and stored configuration that name permissions must be covered during cutover. Historical audit payloads must retain their original meaning. |
| Existing coverage | The real-PostgreSQL permission matrix covers grant, revoke and missing access. Tenant isolation, role seeding, sidebar, routing and permission-picker tests provide further coverage. Migration equivalence, conflicts and repeatability need explicit tests. |

## Implementation sequence

1. Freeze the reviewed mapping at this schema version. Retain the meaning of narrower grants, and record conflicts for ambiguous custom records and one-sided grants.
2. Migrate actual permission rows and assignment relationships inside a transaction. Keep an audit receipt, enforce unique canonical keys on subsequent writes, and provide read-only preflight and a recovery procedure.
3. Update active checks, seeding, queued work and frontend consumers together. Use the backend catalogue exposed through the existing permissions API. Preserve unrelated routes and business identifiers.
4. Apply the same delegation and data-scope rules at each applicable service entry point. Keep role and direct grants attached to the active tenant.
5. Validate with an isolated PostgreSQL database, representative roles, negative authorization cases and both application test suites. Update Chapter 3 after validation and identify environments that still require coordinated deployment.

## Migration and authorization verification

The preflight on the November 23 UAT snapshot found 591 permission definitions. The reviewed migration renames 108 keys in place and merges four duplicate definitions. It adds the previously unseeded attendance-retention permission without granting it to a role. Applying the compiled migration twice to a restored copy produced 588 definitions and one migration receipt. The restored user IDs, role IDs, membership IDs and effective grant sets in all three assignment tables matched before and after migration. A simulated one-sided grant prevented the merge and the transaction rolled back.

The authenticated PostgreSQL regression covers all twelve default company roles, changes to direct grants on an existing session, System-role mutations, device-log access and probation policies, reviews and letter templates. The catalogue check also covers all four platform role templates.

### Recovery

Before deploying, run the permission preflight and retain a restorable PostgreSQL backup alongside the backend and frontend release identifiers. The deployment script backs up UAT before running migrations. If the coordinated cutover fails, suspend writes, restore that backup into a recovery database, verify principal and grant counts, and switch both applications and their database connection to their matching pre-cutover versions. Reconcile writes received after the backup before resuming service. Restoring a permission alias in isolation can reintroduce a revoked grant.

## Implementation reference

| Concern | Implementation |
| --- | --- |
| Permission inventory and migration | The frozen mapping contains the 112 reviewed changes. The preflight checks definitions, ownership and grants before the transactional migration writes its receipt. [Mapping](../src/database/migration-helpers/permission-keys-1797900200000.ts) · [Migration checks](../src/database/migration-helpers/canonical-permissions.ts) |
| Catalogue and default grants | The backend seed is the source of the 584 managed keys. The exporter generates the frontend reference and the permission tables for each of the four platform roles and twelve company roles. [Catalogue](../src/database/seeds/001-permissions.seed.ts) · [Exporter](../scripts/export-permission-catalogue.cjs) |
| Delegation and data scope | Role administration enforces System-role protection and delegation limits. Employee-record access uses the active company, assigned branch and department scopes, reporting relationships and self scope. [Role administration](../src/modules/roles/roles.service.ts) · [Employee access](../src/modules/hr/shared/hr-access.service.ts) |
| Accounts and company switching | The account menu lists the signed-in user’s active companies. Switching replaces the previous workspace’s identity and grants. The company Users table opens at `/dashboard/users` through Access Control and supports bookmarks. [Session regression](../test/auth-sessions.e2e-spec.ts) · [Permission matrix](../test/permission-matrix.e2e-spec.ts) |
| Probation | The policy editor saves targeting, priorities, dates, limits and required stages. The assigned manager rates the current cycle. Further review hands the case to HR for a decision. Company letter templates are maintained under Probation. [Controller](../src/modules/hr/probation/probation.controller.ts) · [Policy resolution](../src/modules/hr/probation/services/probation-policy-resolver.service.ts) |
| Readers and schedules | The database retains schedule revisions. Opt-in workers recheck authorization and verify changes by reading the device. Reader-specific rights and ordinary cards have ownership checks. Physical acceptance requires an isolated reader. [Schedule deployment](../src/modules/access-control/service/schedule-deployments.service.ts) · [Reader regression](../test/reader-reconciliation.e2e-spec.ts) |
| Finance regression found during verification | Creating an application now locks the employee row before checking the active-application limit. The application, product lock and audit record share a transaction. The existing sequence reserves numbers across concurrent applications and the release migration advances it past previously issued numbers. [Concurrency regression](../src/modules/hr/employee-finance/services/employee-finance-concurrency.postgres.spec.ts) |

## Shared UAT verification, 23 November 2026

The coordinated deployment completed for backend `918de3e8` and frontend `4786675`. Follow-up frontend `3304606` preserves the first edit to a probation letter template on a slow load and combines the account’s two-factor indicators in one column. The readiness endpoint and frontend sign-in page both returned HTTP 200. [Backend deployment](https://github.com/filbertmsaki/hrms_backend/actions/runs/45156465830) · [Initial frontend deployment](https://github.com/Inocent-Nuruva/hrms/actions/runs/45156473662) · [Final frontend deployment](https://github.com/Inocent-Nuruva/hrms/actions/runs/45163982977)

| Check | Result |
| --- | --- |
| Live permission migration | The 591 definitions became 588. A second read-only preflight found zero changes and zero conflicts. The database contains one RBAC receipt and the new attendance-retention permission. |
| Assignment preservation | The pre-deployment and post-deployment digests matched across user, role and membership IDs and all 2,364 normalized grants. The checksum was `d6f9b5911970c8c0abb1d0476ce1cd818e5db81460c7c09a75a4914145066339`. |
| Release migrations and recovery | All five migrations are recorded in shared UAT. The finance sequence is at or above all issued application numbers. The deployed backend archive passed its SHA-256 check and ran twice against a restored backup. The second run preserved all assignments and the single RBAC receipt. |
| Access schedules | Four existing schedule revisions were recorded. Zero schedules and zero readers had automatic deployment or reconciliation enabled. |
| Automated coverage | The release passed lint, type checking and builds for both applications, 2,034 backend unit tests, 399 PostgreSQL end-to-end tests, 860 frontend unit tests and 33 Chromium tests. All 38 additional, opt-in PostgreSQL tests passed in a separate loopback cluster. They include repeatable seeding, reader reconciliation, finance concurrency, onboarding visibility, forms and KPI workflows. |
| Live route protection | Signed-out requests to Users, probation policy options, probation letter templates, Command Logs, Sync Logs and session administration all returned HTTP 401. The twelve default company roles were tested against isolated PostgreSQL. The browser and Module 8 fixture accounts are absent from shared UAT. The configured company administrator exists, but the current UAT authentication log records a failed sign-in with the saved credential. |
| User documentation | The role appendix matches the backend export for all sixteen default role templates. With example records, the deployed frontend exercised Users navigation, bookmarked access, probation targeting, criterion ratings, Further review and letter-template editing at desktop and mobile widths. |

Physical door and credential behavior still requires an isolated reader with known model and firmware. Shared UAT has zero registered company identity providers. A live SSO acceptance test requires a registered non-production application and a linked test identity.

During manual sign-in, UAT opened a company session under a different identity from the designated administrator. The account-specific administrator and employee checks remain pending on shared UAT. Repeat those checks with an approved company administrator and employee test session.
