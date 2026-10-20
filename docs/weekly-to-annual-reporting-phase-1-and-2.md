# Weekly to Annual Reporting and KPI Performance — Phase 1 and Phase 2

Status: implementation baseline and provisional company templates. Business/Finance sign-off is still required before activating delivery.

## Phase 1 — Reporting requirements baseline

The repository does not contain the authoritative FRS 9.1–9.4 text or an approved company reporting specification. For that reason, this implementation does not claim legal or FRS conformity. The initial pack mapping below is a draft that owners must reconcile to the governing FRS clauses and company policy.

| Draft period | Starter report definition | Proposed period rule | Delivery recurrence |
| --- | --- | --- | --- |
| Weekly | `WEEKLY_ACTIVITY` | Previous complete Monday–Sunday week | Monday, 09:00 Africa/Dar_es_Salaam |
| Monthly | `MONTHLY_ACTIVITY` | Previous complete calendar month | First day of each month, 09:00 Africa/Dar_es_Salaam |
| Monthly KPI | `MONTHLY_KPI_SCORE` | Previous complete calendar month | First day of each month, 09:00 Africa/Dar_es_Salaam |
| Quarterly | `QUARTERLY_KPI_AVERAGE` | Previous complete calendar quarter | First day of Jan/Apr/Jul/Oct, 09:00 Africa/Dar_es_Salaam |
| Annual | `ANNUAL_KPI_AVERAGE` | Previous complete calendar year | January 1, 09:00 Africa/Dar_es_Salaam |

Provisional defaults: calendar months, calendar quarters, calendar years, Monday-start weeks, CSV output, and Tanzania time. Company templates are created inactive with no recipients or SMTP configuration. HR/Finance owners must approve the FRS clause-to-report mapping, fields and filters, aggregation definitions, access roles, output format, recipient groups, delivery timing, and financial-year basis before enabling them. In particular, if the company financial year differs from the calendar year, the annual date strategy and KPI definition need owner configuration.

### KPI and performance approval baseline

The five annual aggregation options are recorded as product choices, but their business formulas need sign-off before calculation logic is treated as authoritative:

| Method | Rule to approve before implementation |
| --- | --- |
| Simple monthly average | Which months count when reviews are missing, incomplete, or corrected? |
| Weighted monthly average | Source of month weights, normalization, and handling of a month with no score |
| Quarterly rollup | Whether to average quarter aggregates equally or weight by constituent month/period |
| Annual target achievement | Annual actual/target source, direction, cap, formula, and treatment of mixed KPIs |
| Monthly average with adjustments | Adjustment types, approver, evidence, limits, effective date, and audit requirements |

The insurance KPI seed set is not fabricated here because no approved insurance KPIs, targets, weights, scoring rules, data sources, or owners were found in the workspace. The insurance/HR owners need to provide that catalogue as part of Phase 1 approval. Employee trend chart and previous-month comparison are also captured as a UX decision for the owner to confirm.

## Phase 2 — Implemented reporting support

- The scheduler supports quarterly and annual recurrences in addition to daily, weekly, and monthly.
- Templates can select current or previous calendar quarter/year date ranges. Scheduled weekly/monthly/quarterly/annual templates default to the previous complete period when no explicit date strategy is stored.
- Scheduled executions persist the resolved `date_from` and `date_to` in both report boundaries and applied filters; explicit template date-range strategies take precedence.
- Inactive, idempotently provisioned starter templates and schedules are created for existing companies by the seed and for newly created companies by the company provisioning path.
- Starter templates are deliberately inactive and have no recipients or SMTP configuration pending company approval and configuration.

## Acceptance checks and remaining approval gates

1. HR/Finance map each FRS 9.1–9.4 requirement to the draft report or identify missing fields, filters, calculations, and report definitions.
2. Confirm Monday–Sunday weeks, calendar quarters/years, time zone, output format, and any company financial-year variant.
3. Configure company-specific recipients, SMTP, permissions, template filters, and desired execution time; activate only after review.
4. Reconcile one generated example for each period against source records and retain business sign-off.

These approval and company setup items remain operational gates; the templates are not evidence of an approved policy or completed UAT.

KPI formula implementation and the draft insurance KPI catalogue are now recorded below; they remain subject to business approval before activation.

## Phase 3 — KPI implementation baseline

The annual aggregation engine now executes all five selectable methods:

- **Simple monthly average:** averages scored published monthly reviews; null scores and missing months do not contribute.
- **Weighted monthly average:** accepts `monthly_weights` keyed by financial-year month sequence (`1`–`12`); unconfigured months default to weight `1`, and a configured zero excludes that month.
- **Quarterly rollup:** averages available employee quarter aggregates; if none exist, falls back to the scored monthly reviews.
- **Annual target achievement:** computes average monthly score ÷ `annual_target_score` × 100, capped by `annual_target_cap` (default `120`). A positive target is required.
- **Monthly average with adjustments:** averages the published final scores. The scorecard already includes the adjustment component, so it is captured in the audit snapshot and is not applied a second time.

The company financial-year setup form now accepts the JSON configuration. These formulas are an executable provisional baseline, not a substitute for owner approval. The seeded insurance template is likewise a **draft sample**: five manual-manager KPI candidates, no approved targets, no role scope, and no automatic application. The suggested weights are illustrative only.

The employee performance overview now shows up to twelve published monthly review scores and compares the latest result with the prior available published monthly result. Drafts and quarterly reviews are excluded.

## Phase 4 — Verification coverage

- Backend unit tests cover the five formulas, missing scores, weighted scores, fallback behavior, caps, and single-application of adjustments.
- A PostgreSQL integration spec persists source reviews and aggregate results in a disposable schema and checks decimal results for all five methods. It runs only with `HRMS_PERFORMANCE_TEST_DATABASE_URL` (or `HRMS_WORKFLOW_TEST_DATABASE_URL`) pointing to a dedicated database whose name ends in `_e2e`.
- Frontend unit tests cover employee trend filtering, order, and the twelve-period limit.

The gated PostgreSQL test has been run against the dedicated `hrms_test_db` using an isolated per-run schema. HR/business acceptance of formulas, insurance KPI names, weights, targets, and role applicability remains required before production activation.

## Phase 5 — Demo acceptance path

- The standard seed chain provisions the provisional weekly/monthly/quarterly/annual report packs and insurance KPI draft set (`045-workforce-report-packs`, `046-insurance-kpi-starter`). The seeds are idempotent and intentionally do not activate reports or KPI policy.
- The PostgreSQL acceptance suite inserts isolated demo employee and published review rows, runs annual aggregation against the database, then generates the performance CSV from the persisted aggregate. It checks the aggregate score, employee row, filename, and record count.
- This suite requires `HRMS_PERFORMANCE_TEST_DATABASE_URL` (or `HRMS_WORKFLOW_TEST_DATABASE_URL`) pointing to a dedicated database ending in `_e2e` or `_test_db`; it creates and drops a per-run schema and never writes demo rows to a company database.

Phase 5 implementation and PostgreSQL execution are complete. Company UAT approval of report contents, FRS mapping, KPI formulas, insurance KPI catalogue, access roles, recipients, and delivery timing remains a production acceptance gate.

## Phase 6 — UAT evidence and sign-off

- The authenticated operational-report e2e now inserts isolated quarterly and annual demo score rows and confirms the API returns the expected employee and scores. It also verifies the report's `year` filter against the financial-year start year.
- The detailed UAT matrix and evidence/sign-off register are in [`weekly-annual-kpi-phase-6-uat.md`](weekly-annual-kpi-phase-6-uat.md).
- HR, Finance, KPI/business, and Security sign-off remains pending. The local UAT profile is missing its database password and mail configuration, so real-account UAT and notification receipt checks could not be executed from this workspace.

## Phase 7 — Production readiness rehearsal

- Applied all four pending migrations and ran the complete seed chain against the dedicated `hrms_test_db`; a follow-up `migration:show` reported no pending migrations.
- The report-pack seeds completed for existing companies; those templates/schedules remain inactive and the insurance KPI starter remains draft.
- Backend build, targeted lint, typecheck, scheduled-report worker e2e, PostgreSQL aggregation/report e2e, and the operational report API e2e passed.
- Production rollout remains blocked on Phase 6 human sign-off, UAT database/mail configuration, backup/restore evidence, and operational owner/alert confirmation. No production database was connected to or changed. See [`weekly-annual-kpi-phase-7-production-readiness.md`](weekly-annual-kpi-phase-7-production-readiness.md).
