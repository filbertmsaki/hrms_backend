# Seeder file inventory and consolidation review

This is a static review of the files, call sites and visible write paths, not a database execution or proof of idempotency, permissions, legal compliance or production readiness. Names in the tables are relative to `src/database/seeds/`. **Combine** means migrate behavior to a module-oriented runner, retaining support files where useful; it does not mean delete before parity is tested. **Update** identifies required safety or scope work. **Conditional delete** means a candidate only after its references and replacement have been dealt with. No files were removed by this review.

## Core and organization

| File | Current purpose | Recommendation |
| --- | --- | --- |
| `001-permissions.seed.ts` | Global permission catalog; inserts and changes scope of existing entries. | Combine with authorization module; update conflict handling and verify canonical backend/frontend identifiers and scope changes. |
| `002-global-roles.seed.ts` | Platform roles and grants. | Combine with authorization; update first: deletes legacy OWNER rather than safely migrating its references. Verify least privilege. |
| `003-platform-users.seed.ts` | Platform administrator bootstrap. | Update and keep as explicit controlled bootstrap, separate from ordinary reference seeding. Review fallback identities and account matching. |
| `004-company.seed.ts` | Creates configured-name company using fixed Alliance slug. | Move to explicit company provisioning or Alliance import; do not use as a generic core default. |
| `005-company-roles.seed.ts` | Alliance company roles and permission grants; also removes some roles and adds grants. | Combine with authorization, after company parameterization, ownership and grant review; avoid silent role removal or escalation. |
| `006-company-admin.seed.ts` | Alliance company administrator and membership. | Update as explicit company bootstrap; avoid automatic admin creation and preserve existing users. |
| `006a-employee-number-sequence.seed.ts` | Alliance employee numbering sequence, environment-configured. | Combine with employee module; explicit company and approved prefix/padding. Current default is empty prefix and five digits, not automatically AICL/NNN. Check allocation concurrency and existing numbers. |
| `006b-platform-owner-company-access.seed.ts` | Grants platform owner membership and company-admin role. | Update/retain only for explicitly approved bootstrap; avoid automatic cross-company access. |
| `007-branches.seed.ts` | Alliance branch records. | Combine in optional, explicitly approved company structure import, not global defaults. |
| `008-departments.seed.ts` | Alliance departments. | Same company structure import; preserve dependencies and existing records. |
| `009-department-position-mappings.seed.ts` | Alliance department-position mappings. | Combine in structure import after positions; retain its tests and mapping behavior. |
| `010-positions.seed.ts` | Alliance positions. | Combine in structure import before mappings; do not invent company structure. |

## HR policies and operations

| File | Current purpose | Recommendation |
| --- | --- | --- |
| `013-leave-types.seed.ts` | Alliance leave types and active entitlements. | Combine with leave module; company-scope and review entitlements and approval before activation. |
| `014-leave-policies.seed.ts` | Leave policy and leave-type links. | Combine with leave module; preserve approved settings and validate service behavior and effective dates. |
| `015-leave-workflows.seed.ts` | Leave approval workflow and steps. | Combine with leave module after roles; validate routing and avoid overwriting company workflow. |
| `016-shifts.seed.ts` | Alliance shifts and breaks. | Combine with attendance module; use explicit company and approved schedule. |
| `017-timetables.seed.ts` | Alliance timetable and day-to-shift relationships. | Combine with attendance after shifts; review employee/group overrides and preservation. |
| `018-shift-assignments.seed.ts` | Intentionally no-op; explains why direct assignments override timetable. | **Conditional delete**: remove from legacy index and move its explanation to attendance documentation first. Do not execute the deletion SQL in its comment. |
| `018a-attendance-policy.seed.ts` | Alliance attendance policy, active if no active policy exists. | Combine with attendance only after HR approves values; proposed overtime, thresholds and device rules must not silently activate. |
| `019-onboarding-workflow.seed.ts` | Company onboarding workflow and steps. | Combine into onboarding module after roles; validate templates and approvals. |
| `020-offboarding-workflow.seed.ts` | Company offboarding workflow and steps. | Combine into offboarding module after roles; retain constants and validate consumers. |
| `021-attendance-devices.seed.ts` | Alliance attendance device records. | Move to explicit device provisioning/import; do not invent infrastructure records. |
| `022-access-organizations.seed.ts` | Access-control organization. | Combine with access-control provisioning, scoped to an existing company and approved device setup. |
| `023-access-groups.seed.ts` | Device-linked access group. | Combine with access-control provisioning after device and organization; validate memberships and scope. |
| `035-holidays.seed.ts` | Alliance holiday group and dated holidays. | Combine with company calendar; verify dates, jurisdiction and provenance, preserve approved edits. |
| `037-default-avatars.seed.ts` | Company avatar rows and SVG files for companies. | Update to explicit company scope and handle filesystem/database failure separately; file writes are not rolled back with the database transaction. |
| `038-payroll-baseline.seed.ts` | Calendar, components, structure, schemes and draft statutory versions. | Combine under payroll only after verifying statutory sources and dates. It changes earlier seed-owned rules and retires a seed-only NHIF scheme; review history and ownership carefully. Its statutory rules are created as DRAFT; schemes are ACTIVE. This file has pre-existing uncommitted changes. |
| `039-employee-finance-products.seed.ts` | Active Alliance advance and loan products with financial limits. | Update before consolidation: require Finance-approved products and terms; do not auto-activate unapproved limits. Referenced directly by e2e tests. |
| `040-probation-baseline.seed.ts` | Company probation policy and criteria. | Combine with probation module; require policy approval and preserve existing configurations. |
| `043-scheduled-report-definitions.seed.ts` | Global registered report definitions. | Consolidate with unified reports module. Conditional deletion only after consumer, migration, locking and parity tests; old chain still imports it. |
| `044-attendance-scheduled-reports.seed.ts` | Backfills attendance report templates for all companies. | Combine with reports module as an explicitly scoped operation; review default enabled schedules and delivery before activation. |
| `045-workforce-report-packs.seed.ts` | Inactive workforce report packs for all companies. | Consolidate with unified reports module, which already calls the same provisioning utility for one company. Remove wrapper only after legacy references and behavior are migrated. |
| `activity-categories.seed.ts` | Standard activity categories for all companies. | Consolidate with unified activities module, which calls the same catalog for one company. Preserve company-create provisioning and update the UAT command before removing wrapper. |
| `045-alliance-employees.seed.ts` | Standalone Alliance employee, account, role and hierarchy import. | Keep outside core; treat as sensitive one-off import. Conditional retirement only after confirming operational need and replacing any required import workflow. |

## Demo and UAT data

These are not core reference data and should stay separately invoked. Deletion requires confirmation that associated UAT/training workflows and documents no longer need them.

| File | Current purpose | Recommendation |
| --- | --- | --- |
| `daily-activity-uat-demo.seed.ts` | Synthetic activity, policy and field-visit data. | Keep as fixture or retire after UAT; runner has UAT/name/confirmation checks. Never combine into core. |
| `field-visit-uat-demo.seed.ts` | Synthetic field visit and opportunity. | Keep as fixture or retire after UAT; runner has UAT/name/confirmation checks. |
| `module8-uat-test-accounts.seed.ts` | Test accounts, roles, employees and company configuration. | Keep isolated or retire after UAT; verify direct invocation cannot bypass safeguards. |
| `employee-finance-demo.seed.ts` | Active demo finance products; defaults to Alliance company. | Update urgently: its standalone runner lacks an environment/target confirmation guard. Keep distinct from core. |
| `payroll-demo.seed.ts` | Synthetic payroll company, accounts and transactions. | Keep separate or retire after training; review its password output, reset behavior and target isolation. |

## Runners and supporting files

| File(s) | Recommendation |
| --- | --- |
| `index.ts`, `run-seed.ts` | Legacy full chain; migrate callers and reset/deployment scripts before retirement. Current chain has a production-environment guard; standalone commands are not covered. |
| `unified-seed.ts`, `run-unified-seed.ts` | Keep and extend; currently only reports and activities, with explicit company scope and PostgreSQL transaction lock. Other seeding paths do not share its lock. |
| `run-attendance-policy.ts`, `run-payroll-baseline.ts`, `run-default-avatars.ts`, `run-module8-activity-categories-seed.ts` | Conditional consolidation into module selection after parity, scope and compatible command migration. Some are package scripts used operationally. |
| `run-alliance-employees.ts` | Keep with the restricted company import until retirement is approved. |
| `run-daily-activity-uat-demo-seed.ts`, `run-field-visit-uat-demo-seed.ts`, `run-module8-uat-test-accounts-seed.ts`, `run-employee-finance-demo-seed.ts`, `run-payroll-demo-seed.ts`, `run-payroll-demo-reset.ts` | Keep with corresponding fixtures until their workflows are retired; update isolation guards. Payroll reset is destructive and must remain separate. |
| `run-kpi-assignment-permissions.ts` | Local-only grant helper overlaps permission and company-role catalogs. Conditional deletion after verifying catalog parity, migration history and local operational use; it currently makes grants across company roles. |
| `company-structure.constants.ts`, `company-hr-structure.constants.ts` | Support Alliance structure and tests; move to company import/fixtures only after references migrate. |
| `onboarding-seed.constants.ts`, `offboarding-seed.constants.ts` | Preserve with their workflow modules. |
| `seeder-guards.ts` | Keep while legacy chain exists; review password checks and target isolation when designing replacement. |
| `009-department-position-mappings.seed.spec.ts`, `seeder-guards.spec.ts`, `unified-seed.spec.ts` | Keep or migrate tests with their implementation. Add isolated database and service integration coverage. |
| `src/scripts/seed-payroll-demo-cycle.ts` | Separate demo transaction script referenced by package command; retain or retire with payroll demo. |

## Cross-cutting dependencies and recommended sequence

The TypeORM data-source options contain a `*.seed` glob, and the legacy chain, startup path, package scripts, reset/import scripts, docs and e2e tests refer to specific seeders. Check all of these before removing files. Seed or backfill data also exists in migrations, including notification templates, report definitions, activity categories, role grants and payroll components. Historical deployed migrations should not be deleted or casually rewritten; reconcile their behavior with the new runner.

1. Define module and scope ownership, approval rules and a safe deployment target; isolate optional demo and company import paths.
2. Migrate authorization and company provisioning without changing existing grants or deleting roles; validate protected endpoints and frontend checks.
3. Consolidate leave, attendance, onboarding, offboarding, payroll, finance and other supported modules, retaining approved defaults and inactive/pending rules where appropriate.
4. Replace all-company loops with explicit company scope where relevant; coordinate all writers with constraints and concurrency handling. Add durable audit, dry-run and policy validation.
5. Validate clean and existing isolated databases, repeated and concurrent execution, rollback, tenant isolation and actual service use. Update scripts, tests and docs, then remove only superseded wrappers and no-op files.

No comprehensive service-by-service or statutory audit, production database execution, or fresh/existing database test was performed for this review. Actual deletion safety and final production readiness remain unverified.
