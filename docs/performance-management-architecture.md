# Performance Management Architecture

## Recommended Module Shape

The HRMS already has the right foundations for a full performance-management suite:

- `hr/performance` owns performance periods, KPI definitions, KPI templates, employee KPI proposals, assignments, reviews, rating scales, competencies, calibration/moderation, PIPs, audits, and scoring.
- `hr/work-activities` owns daily activity reports, manager-assigned tasks, evidence, comments, reviews, reminders, summaries, and KPI metric providers.
- `hr/attendance`, `hr/leave`, `hr/employees`, `hr/shared`, `notifications`, roles, permissions, and audit logs provide the organization, hierarchy, security, workflow, and evidence backbone.

The recommended architecture is to keep KPI, activity, appraisal, calibration, development, and reporting logic as separate services under the HR domain, connected by stable IDs and score snapshots rather than hidden recalculation.

## Core Entities

- KPI catalogue: `kpi_definitions`, `kpi_definition_versions`, `kpi_templates`, `kpi_template_items`, and `kpi_applicability_rules`.
- Employee KPI workflow: `employee_kpis` and `employee_kpi_review_history`.
- Activity workflow: `daily_activity_reports`, `daily_activity_entries`, `daily_activity_comments`, `daily_activity_evidence`, `activity_categories`, `activity_policies`, and work-activity audit/exception tables.
- Appraisal cycle: `performance_financial_years`, `performance_periods`, `performance_period_assignments`, `performance_reviews`, `performance_review_moderations`, `performance_appeals`, and `performance_aggregates`.
- Competencies: `competency_templates`, `competency_template_items`, and `performance_competency_ratings`.
- Rating/scoring: `performance_rating_scales`, `performance_rating_bands`, and `performance_scorecard_configs`.
- Improvement: `performance_improvement_plans` and `performance_improvement_milestones`.
- Audit: `performance_audit_logs`, plus the existing global notification and user audit infrastructure.

## KPI Structure

KPIs should be created at catalogue level for reusable strategic/departmental/team metrics, then assigned through templates or applicability rules. Employees can propose period KPIs through `employee_kpis`, with manager review, versioned review history, target/actual tracking, weighted achievement, activity-linked progress, notifications, and audit logs.

## Activities Structure

Activities stay in `work-activities` because they are operational work records used by more than performance. Entries can link to KPI definitions or employee KPIs. Approved completed activities can contribute to KPI progress and appraisal scorecards through the scorecard component type `ACTIVITIES`.

## Appraisal Structure

The review lifecycle remains:

1. Period setup and assignment.
2. KPI/activity execution.
3. Employee self-review.
4. Manager review and competency scoring.
5. HR approval and score calculation.
6. Optional calibration/moderation.
7. Publication, appeals, PIP/development actions, and history.

## Rating And Scoring

Performance calculation is now configurable through `performance_scorecard_configs`. HR can define enabled components and weights, such as KPI, activities, competency, attendance, manager assessment, self-assessment, peer feedback, manual items, and HR adjustment. Approval stores raw scores, weighted scores, final score, rating band, calculation hash, and scorecard snapshot for audit.

If no active scorecard is configured, the module preserves the legacy fixed KPI calculation path so existing deployments are not silently changed.

## Approval Workflows

The current workflow is role-secured with employee, manager, and HR surfaces. More complex approval chains should be modeled as company-level workflow configuration over the same review states, with each transition writing a performance audit log and notification.

## Role And Permission Structure

Use the existing permission system:

- Employees: own KPI/activity/review/PIP access.
- Supervisors/managers: team KPI review, activity review, manager assessment.
- HR: period/configuration/review/PIP/calibration access.
- Administrators: role, permission, and module setup.
- Executives: dashboard/reporting permissions only unless explicitly granted.

Hierarchy-limited access should continue flowing through `HrAccessService`.

## Dashboards, Reports, Notifications, And Jobs

Dashboards should aggregate from `PerformanceInsightsService`, `WorkActivityInsightsService`, attendance summaries, and review aggregates. Reports should expose the persisted calculation snapshots so exported Excel/PDF/CSV files can explain how each final score was produced. Scheduled jobs should handle deadline reminders, overdue KPI/activity checks, appraisal-cycle reminders, and PIP/development-plan review dates using the existing notifications/email infrastructure.

## UI/UX

Employees should see a simple workflow: KPIs, activities, self-review, feedback, and development actions. Managers should see team queues and review tasks. HR/admin screens should carry the advanced configuration: rating scales, scorecards, periods, templates, competency libraries, calibration, and reports.

