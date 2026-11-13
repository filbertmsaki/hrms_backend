# KPI integration release-file manifest (review draft)

No file is staged, approved for push, or approved for UAT deployment by this manifest. Both repositories contain mixed uncommitted work. Review each path and its diff before forming commits. Backend and frontend revisions must be paired.

## Backend `hrms_backend`

| Release group | Paths and review notes |
| --- | --- |
| KPI implementation | `src/modules/hr/kpi/**` except `dev-migrations/**`; includes definitions, templates, periods, assignments, targets, scorecards, achievements, evidence, evaluations, analytics, controllers, services, entities, DTOs, guards, and tests. |
| Existing-HRMS integration | `src/modules/hr/hr.module.ts` registers the KPI module behind `KPI_PHASE1A_ENABLED`; `src/config/env.validation.ts` and `.env.example` document/configure flags. Review KPI-related permission and notification changes in `src/database/seeds/001-permissions.seed.ts`, `005-company-roles.seed.ts`, `src/modules/notifications/enums/notification-type.enum.ts`, and existing HR notification/action-inbox integration. Include only verified dependencies. |
| Legacy removal | Deleted `src/modules/hr/performance/**`, associated seeds, obsolete scheduled-reporting and activity KPI links, and legacy APIs/tests. Twelve deleted historical KPI/performance migration source files and the edited baseline/later historical migrations require the actual UAT ledger/schema decision **before** their release treatment is approved. Do not restore old application functionality or erase applied ledger rows. |
| New release migrations | **None approved yet.** The five `src/database/kpi-release-candidates/*.ts` files are outside normal discovery and excluded from compilation. Promote only after actual UAT metadata comparison and a sanitized representative upgrade/restore rehearsal. Development migrations under `src/modules/hr/kpi/dev-migrations/**` and `scripts/rehearse-kpi-release-candidates.ts` are local test tools, not release executables. |
| CI/recovery | `.github/workflows/hrms-backend-ci.yml`, `deploy/hrms-backend/deploy.sh`, `stage-release.sh`, and `README.md`: preserve removed dump dependency, mandatory backup, read-only metadata dispatch, and opt-in automated UAT deployment. `src/database/kpi-uat-preflight.ts` and `kpi-uat-metadata-export.ts` compile into the release; the SQL is packaged privately for runner execution. Review `tsconfig.build.json` candidate/dev exclusions. |
| Tests/docs | KPI tests in the module; `STATE.md`, `docs/kpi-uat-metadata.sql`, `docs/kpi-uat-release-runbook.md`, and this manifest. Exclude any generated metadata output. |

## Frontend `hrms`

| Release group | Paths and review notes |
| --- | --- |
| KPI pages/API | `src/app/dashboard/kpi/**`, `src/app/dashboard/me/kpi/**`, `src/app/dashboard/me/scorecards/**`, `src/app/dashboard/me/evaluations/**`, `src/components/dashboard/kpi/**`, and `src/lib/{kpi,scorecard,achievement,evaluation,kpi-analytics}*` API/session/test files. |
| Shared shell/navigation | `src/components/app-sidebar.tsx`, `src/components/dashboard/admin-dashboard-view.tsx`, `src/lib/dashboard-nav.ts`, `src/lib/dashboard-permissions.ts`, `src/lib/forbidden-routes.ts`, their focused tests, and `src/components/nav-main.test.tsx`. Review only KPI-related hunks where these files also contain unrelated changes. Existing dashboard layout, auth, sidebar, permissions, and mobile behavior remain shared. |
| Legacy removal | Deleted `src/app/dashboard/performance/**`, `src/app/dashboard/me/performance/**`, old performance/KPI components and tests, and the obsolete mobile performance tab. Preserve unrelated mobile work. |
| CI | `.github/workflows/hrms-frontend-ci.yml` and `deploy/hrms-frontend/README.md` allow opt-in automated UAT deployment after CI validation; disabled by default through the shared repository variable name. |

## Explicit exclusions pending separate review

- `/home/innocent/systems/kpi-reset-baseline-2026-11-05.zip`, all database dumps/backups, metadata exports, credentials, `.env`/`.env.local`, synthetic account/login files, `dist/`, `.next/`, `node_modules/`, and disposable databases.
- Unrelated attendance, payroll, employee-finance, work-activity, mail styling, forms, mobile UI, and other HRMS edits unless a specific KPI dependency is demonstrated and reviewed. `git add .` is prohibited for this mixed baseline.
- Historical migration modifications remain a separate compatibility decision. An applied UAT migration name does not authorize changing its source or dropping its legacy objects.

## Commit/PR preparation after UAT evidence

Review explicit path lists and diffs for: (1) legacy module removal and required references; (2) KPI backend with tests; (3) KPI frontend with shared navigation/permission tests; (4) approved forward migrations and migration rehearsals; (5) CI/recovery/runbook. Use the existing PR/review workflow and approved compatible Git SHAs. Pushing to `uat` runs CI; deployment remains gated until an authorized administrator enables `KPI_UAT_AUTO_DEPLOY_ENABLED=true` in each repository after the first reviewed release. No staging, commit, push, or remote deployment has been performed.
