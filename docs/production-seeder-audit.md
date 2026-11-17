# Production seeder audit: preliminary findings

Status: BLOCKED. This is an initial risk review, not the complete audit or a production initialization procedure. No database was modified or seeder executed during this review. Existing uncommitted payroll and leave changes were present and have not been audited as a completed change.

## Observed coverage and risks

| Module | Existing seeder | Status and required action |
| --- | --- | --- |
| Permissions and roles | 001, 002, 005 | PARTIALLY READY: compare guards and frontend identifiers and least-privilege assignments. 002 deletes a legacy OWNER role; assess historical references. |
| Accounts | 003, 006, 006b | BLOCKED: audit bootstrap, privileges, tenant isolation and credential lifecycle. |
| Company and organization | 004, 006a, 007–010 | BLOCKED: main chain creates the Alliance company and specific structures; do not use as generic production defaults. Review employee sequence concurrency. |
| Leave | 013–015 | PARTIALLY READY: validate entitlements, workflows, scope and preservation with actual services and HR approval. |
| Attendance | 016–018a | BLOCKED: Alliance-specific policies are created active when no active policy exists. Values including overtime multipliers and operational limits require approval. |
| Onboarding and offboarding | 019–020 | PARTIALLY READY: validate workflows against consumers and company policy. |
| Device access | 021–023 | BLOCKED: review device and organization-specific records and isolation. |
| Holidays and avatars | 035, 037 | PARTIALLY READY: review dates, jurisdiction, approval and asset deployment. |
| Payroll | 038 | BLOCKED: effective-dated rates and modifications of earlier rules exist; independently verify sources, dates and preservation before any live use. |
| Employee finance | 039 | BLOCKED: creates active loan and advance products with specific financial limits and rates; finance approval is required. |
| Probation | 040 | PARTIALLY READY: review defaults and approval. |
| Reports | 043–045 workforce report packs | PARTIALLY READY: verify definitions, endpoints, tenant scope and report access. |
| Activity categories | activity-categories | PARTIALLY READY: iterates all companies; verify tenant-provisioning boundaries and consumers. |
| Employee import | 045 Alliance employees | BLOCKED: separate command creates real employee accounts; never include in a generic production initialization. |
| Demo / UAT | payroll, finance, field visit, daily activity and module 8 account seeders | NOT IMPLEMENTED for production: separate commands exist; audit all entry points and enforce environment isolation. |

The main chain is ordered in `src/database/seeds/index.ts`, with positions run before their mappings. It also has an opt-in startup path. Individual seeders have varying transaction boundaries; lookup followed by insert alone does not prove concurrent safety. Standalone commands, migration-embedded seed data, hardcoded service defaults, and 124 migrations and 208 entity files have not yet been comprehensively audited.

## Policy decisions

| Policy | Proposed value | Scope | Status |
| --- | --- | --- | --- |
| Timezone and currency | Africa/Dar_es_Salaam; TZS | Company | Proposed; verify implementation and company approval. |
| Working schedule | Weekdays 08:15–17:15, lunch 13:00–14:00; Saturday 09:00–13:00; one Saturday rest monthly | Company/department if supported | Proposed; approval and service support required. |
| Attendance | 30-minute late threshold; overtime disabled | Company | Proposed; existing attendance seed activates additional unapproved rules. |
| Annual leave | 28 days | Company | Proposed; statutory basis and employer policy require review. |
| Payroll statutory rules | No unverified rates or effective dates | Company/jurisdiction | BLOCKED pending independent verification, effective-date review and finance approval. |
| Loans | No invented limits or automatically active products | Company | BLOCKED pending approved policy. |

## Containment and next steps

The legacy `seed:run` chain and its startup entry point now reject `APP_ENV=production` or `NODE_ENV=production`. This is a marker-based guard, not database identification: a production database can still be targeted with a mislabeled environment, and standalone seeder commands and migration data are not covered. Do not run any of them against production without explicit authorization and a reviewed procedure. Existing data is not changed by the guard.

Continue by inventorying every seeder and migration data operation, schemas and unique constraints, service consumers, RBAC and configuration precedence. Establish isolated PostgreSQL integration tests and approved policy inputs, then design scoped insert/preserve/deprecate/review operations with concurrency control, version tracking, validation and explicit tenant provisioning. Verify statutory sources and effective dates separately. Test clean and existing databases, retries, concurrency, isolation and service integration before creating a reviewed production deployment and rollback procedure. Do not enable automatic production startup seeding.
