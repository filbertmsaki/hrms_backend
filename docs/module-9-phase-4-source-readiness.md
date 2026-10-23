# Module 9 Phase 4: Discipline, Training, and Eligibility Source Readiness

**Reviewed:** 2026-10-23  
**Result:** Source integration is blocked pending authoritative owner decisions. No discipline/training records or eligibility rules were created or inferred.

## Existing source inventory

| Domain | Existing evidence | What it can safely represent | Missing for Module 9 |
|---|---|---|---|
| Discipline | No disciplinary case/action entities, module, or source integration found in the backend module inventory. | Nothing authoritative. Attendance exceptions and deductions are not disciplinary cases. | Source owner/system, case statuses, final/outcome semantics, effective dates, privacy classification, retention, correction/reversal rules, and disclosure grants. |
| Training | `performance_reviews.training_needs` and manager/HR free-text recommendations exist. No completed-training event, course enrollment, attendance, or completion evidence module was found. | A published review may contain a training need or recommendation. This is not evidence that training was assigned or completed. | LMS/HR source, course/event identity, completion status/date/evidence, provider, tenant mapping, correction rules, privacy, retention, and permitted summary fields. |
| Increment/bonus/promotions | Employee movement workflows handle promotion and other changes with their approval process. Payroll supports performance-source records and bonus schemes. Payroll can consume published performance aggregates. | Existing records can represent approved movement/payroll workflow outcomes, and the payroll source is configurable. | No approved common eligibility formula, thresholds, period, exclusions, effective date, or recommendation-to-approval handoff was identified. No automatic execution is authorized. |

## Required owner decisions before implementation

1. HR identifies the authoritative disciplinary source and approves whether reports may contain counts, status summaries, or any case details. Restricted case text must not be copied into general performance reports.
2. HR/Learning identifies the authoritative training source and defines which states qualify as assigned, attended, and completed. Review `training_needs` remains a recommendation field only.
3. HR, Finance, and the KPI owner approve eligibility criteria independently for increments, bonuses, and promotions, including score source, rating scale version, period, partial-year treatment, thresholds, exceptions, and effective date.
4. Security/Privacy approves role-specific read/export grants, retention, correction/reversal history, and employee disclosure rules.
5. IT provides the source API/database contract, tenant/employee identity mapping, service credentials for isolated UAT, retry behavior, and a notification/test sink if synchronization alerts are needed.

## Safe implementation boundary after decisions

- Add a tenant-scoped adapter for each named authoritative source; do not manufacture a parallel disciplinary or LMS record from review text.
- Persist only approved summary fields and source identifiers, with source version, effective date, sync timestamp, hash, and correction/reversal lineage. Use repeatable idempotent upserts keyed by tenant and source record identity.
- Calculate eligibility as an explainable recommendation snapshot against an approved, versioned rule. Keep it separate from payroll generation and movement approval; a recommendation never creates a payment or employee movement.
- Enforce source-specific report permissions at the API and export boundary, and omit restricted details from general analytics datasets.
- Verify synthetic source reconciliation, duplicate/retry handling, correction/reversal, employee/tenant scope, and role denial before exposing report columns.

## Acceptance evidence still required

This phase cannot be marked implemented until the source owners and rules above are recorded, at least one isolated source/UAT fixture is available for each in-scope domain, and API/UI/export results reconcile to those fixtures under approved roles. No source records were accessed or changed during this readiness review.
