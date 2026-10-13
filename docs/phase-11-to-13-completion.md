# Phases 11–13 implementation status

Reviewed: 2026-10-13  
Scope: backend employee movements, performance/KPI, and work activities.

## Phase 11 — Employee movements

The phase is implemented in the current codebase:

- Draft, submit, approve, reject, return, cancel, apply, acknowledgement, and letter operations are implemented in `src/modules/hr/employee-movements`.
- Movement changes preserve before/after snapshots and apply with version checks and an operation record for retryable downstream work.
- Compensation versions are created and superseded as movements take effect. Payroll and employee finance consume the compensation-version model.
- Movement sequence numbers are allocated per company and year, so no static movement lookup seed is required.
- `test/employee-movements-flow.e2e-spec.ts` covers the guarded HTTP contract.

Production validation still needs the movement lifecycle exercised against the target database and real downstream payroll/finance repositories. The existing e2e suite mocks the service boundary, so it does not establish database transaction behavior.

## Phase 12 — Performance and KPI

The phase is implemented in `src/modules/hr/performance`:

- Financial years, review periods, rating scales, scorecards, competencies, KPI definitions and versions, applicability rules, employee plans, achievements, reviews, workflow, appeals, feedback, development plans, improvement plans, aggregates, reports, and audit records are present.
- `041-performance-baseline.seed.ts` and `042-performance-kpi-baseline.seed.ts` create the default review/KPI configuration and are registered in the seed index.
- The baseline financial year and monthly KPI template now use the current UTC calendar year. Seed logic creates missing records and leaves existing configuration unchanged.
- `test/performance-flow.e2e-spec.ts` covers guarded workflow endpoints.
- Payroll can read approved performance aggregates/KPI data for configured payroll inputs.

Production validation still needs database-backed review and KPI cycles, including generated assignments, approvals, score calculation, and aggregate consumption. The current e2e suite mocks service providers.

## Phase 13 — Work activities

The phase is implemented in `src/modules/hr/work-activities`:

- Daily activity plans/reports, employee submissions, manager review, comments/evidence, field visit plans/check-in/check-out, opportunities, expenses, follow-ups, offline mobile sync, exception handling, notifications/reminders, retention, insights, and audit services are registered.
- Performance KPI providers read approved daily activity and field visit data.
- KPI provider flags now default to enabled. Operators can still explicitly set `PERFORMANCE_ACTIVITY_PROVIDER_ENABLED=false` or `PERFORMANCE_FIELD_VISIT_PROVIDER_ENABLED=false` to disable either provider.
- The generic `PHASE13_DAILY_ACTIVITY` and `PHASE13_FIELD_VISIT` provider keys now calculate daily activity completion rate and field visit completion rate respectively; neither returns a placeholder zero.
- Existing `/me/field-follow-ups` and `/me/field-sync` routes are retained as compatibility aliases for older clients. Canonical field visit routes are under `/me/field-visits`.

Production validation still needs database-backed employee sync, manager approval, and KPI calculation across a complete activity period. Compatibility aliases can be removed only after client usage confirms that no deployed client still calls them.

## Outstanding sign-off

The implementation gaps identified for these phases have been addressed in source. Remaining work is environment validation: apply pending migrations/seeds in a disposable or staging database, run the movement and performance flows against that database, and exercise the daily activity/field visit to KPI path with real persisted records. The current HTTP e2e suites use mocked services and do not substitute for that validation.
