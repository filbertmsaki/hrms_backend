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
