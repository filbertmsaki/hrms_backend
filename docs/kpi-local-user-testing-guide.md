# KPI local user testing guide

This guide uses the **existing HRMS** at `http://127.0.0.1:39993/login`. The API is `http://127.0.0.1:38890/api` and the isolated database is `hrms_kpi_dev_test`. These addresses work on this development machine only. Use a private or fresh browser session for each role so an earlier dashboard session does not carry over. Sign out before changing roles.

## Accounts and sign-in

All accounts below are synthetic `example.invalid` identities in the disposable database. The shared local test password is in `/tmp/kpi-phase2-preview-login.json` (owner-only permissions). Open that file on this machine to sign in. Do not send the password in chat, email, tickets, screenshots, or Git. The same HRMS authentication and sidebar are used for every role.

| Role | Email | Main purpose |
| --- | --- | --- |
| Company administrator | `kpi-admin@example.invalid` | Definitions, policies, scorecards, cycles, HR reports |
| HR manager | `kpi-hr@example.invalid` | HR configuration, review, finalization, HR reports |
| Department manager | `kpi-manager@example.invalid` | Assign and review the synthetic employee in the test department |
| Branch manager | `kpi-branch@example.invalid` | Check branch-scoped access and branch reports |
| Employee | `kpi-employee@example.invalid` | Personal KPI submissions, self-assessment, acknowledgement, personal report |
| Executive management | `kpi-executive@example.invalid` | Aggregate analytics and executive coverage report only |

The database also contains `kpi-other@example.invalid` in another company for isolation tests. It is deliberately not part of the shared login file. The three newly added role accounts are local fixtures; their HRMS-wide permissions are intentionally minimal. Some unrelated HRMS dashboard cards may therefore show unavailable or forbidden data for these synthetic users.

## Understand the numbers

- A **target** is the assigned goal. An **actual** is an employee's submitted result. Only a manager-approved actual can contribute to a live scorecard.
- **Pending**, **returned**, and **rejected** achievements do not become approved actuals. A scorecard with missing required approved results remains incomplete.
- **Live scorecards** can change after later approvals. A **finalized evaluation** retains its frozen historical result.
- Analytics counts distinguish employees, KPI assignments, scorecards, and evaluations. “Awaiting approved data” is a subset of incomplete scorecards.
- Company-wide performance index, time-based risk status, and confidential small-group executive scores are unavailable until their business policies are approved.

The review database includes a realistic unfinished example: `DEMO_CLAIMS_SLA_2026`, **Claims settled within agreed service time**, in the `November 2026 E2E` period. It is directly assigned to synthetic employee `KPIE2E-E1` with an 85% target (assignment #89) and has no submitted actual. A published `DEMO_CLAIMS_TEMPLATE` is also available. Use this example for an achievement submission or add it to a new draft scorecard; keep your own newly created KPI codes unique.

An automated browser check also used synthetic assignment #36 and achievement #44. Its first submission (actual 80) was returned with a manager comment, then the employee resubmitted actual 90 and the manager approved it. The evidence is linked to the first historical revision. This completed example is available for inspecting decision history; use the unfinished assignment #89 for your own submission test.

For a completed end-to-end example, inspect assignment **#90**, scorecard **#84**, achievement **#45**, cycle **#33**, and evaluation **#38**. A synthetic administrator published the KPI and 100%-weighted scorecard; the employee submitted actual 90 with evidence; the department manager approved it. Scorecard #84 shows score 90 and 100% completeness. The employee and manager completed their assessments, the assigned HR reviewer finalized evaluation #38, and the employee acknowledged it. HR opened amendment **#39** while the original #38 retained its frozen score 90 and acknowledgement. The test KPI definition #104 was then archived to demonstrate that historical analytics still list archived definitions. Existing evaluation #3 is a separate disputed example. These records are for inspection; use assignment #89 to perform your own submission workflow.

## HR administrator walkthrough

1. Sign in as `kpi-admin@example.invalid` or `kpi-hr@example.invalid`. Open **KPI Management → KPI Library** (`/dashboard/kpi`). It contains the existing synthetic definitions. Use search; open a definition and inspect its pinned versions. Create a new draft with a unique code such as `REVIEW_20261106_01`, a numeric unit, direction, and monthly frequency. Save, edit the draft, then publish it. Expected: the published version appears and cannot be silently edited. A duplicate code or invalid measurement configuration is rejected.
2. Open **KPI Management → Periods** (`/dashboard/kpi/periods`). Select the existing `November 2026 E2E` period or create a new nonoverlapping synthetic period. Expected: the selected dates and frequency appear; invalid date order is rejected.
3. Open **KPI Management → Scorecards** (`/dashboard/kpi/scorecards`). Inspect an existing published card for the synthetic employee. To create another, first assign the new KPI and target, then choose an employee subject, matching period, published scoring policy, and active assignments. Set weights to exactly 100% and publish. Expected: draft weight total updates; a weighted card cannot publish at 99% or 101%.
4. Open **KPI Management → Performance Evaluations** and **Evaluation Cycles**. Inspect existing synthetic cycles and use a new test cycle for a full walkthrough. Assign the employee and responsible manager; choose whether HR review is required. Expected: the evaluation appears in employee and manager workspaces. A finalized evaluation cannot be edited directly.
5. Open **KPI Management → Analytics**. Compare the assignment status cards with the scorecard coverage cards. Apply a period and department filter. Expected: totals change with authorized data; missing actuals remain missing. The KPI definition filter includes archived definitions that have historical assignments.
6. Open **KPI Management → Reports**. Select **HR evaluation**, a period or cycle, then download PDF and Excel. Expected: the screen, PDF, and Excel show the same report summary for the selected page and filters. The report notes live versus frozen values and missing data. No official company-wide score appears.

## Manager walkthrough

1. Sign in as `kpi-manager@example.invalid`. Open **KPI Management → Assignments** (`/dashboard/kpi/assignments`). Choose the published KPI, synthetic employee `KPIE2E-E1` (employee ID 15), period, responsible manager, and a type-compatible target. Save. Expected: assignment appears in management and the employee's personal KPI list. Out-of-scope employee or other-company IDs are denied.
2. Open **KPI Management → Achievement Reviews** (`/dashboard/kpi/reviews`). Filter for submitted or returned entries. Open an employee submission, inspect the target and evidence reference, then approve or return it with a reason. Expected: approval records reviewer and time; return permits a new employee revision. You cannot approve your own achievement or a record outside your reporting scope.
3. Open **KPI Management → Performance Evaluations**. Open an evaluation assigned to you. Read the employee's self-assessment and approved scorecard, enter competency ratings and feedback, then submit. Expected: the manager decision is recorded; required ratings/comments are validated. If HR review is configured, the record proceeds to HR rather than finalizing itself.
4. Open **KPI Management → Analytics** and **Reports**. Filter to your permitted employee and period. Expected: a complete card scores only approved values; the report uses the same figures. A manager can view individual, department, and branch reports only within the backend scope; HR and executive reports are denied.

## Employee walkthrough

1. Sign in as `kpi-employee@example.invalid`. Open **My KPIs** (`/dashboard/me/kpi`). The page shows only directly assigned KPIs. Open one; compare its target, unit, reporting period, and current submission status.
2. For an assignment without an approved result, enter a type-compatible actual and comment, save a draft, attach a small permitted synthetic evidence file if needed, then submit. Expected: submitted data is read-only while pending. The manager's review inbox receives it. Evidence remains private; a different employee cannot download it.
3. After the manager returns a submission, reopen it, read the reason, correct the actual, and resubmit. Expected: the previous revision remains in history. After approval, the actual is read-only and the live scorecard updates.
4. Open **My Scorecards** (`/dashboard/me/scorecards`). Check an existing complete and incomplete card. Expected: approved actuals and weighted contributions display; missing required values show Awaiting Data, never a fabricated zero or final rating.
5. Open **My Evaluations** (`/dashboard/me/evaluations`). Complete a draft self-assessment with achievements, challenges, goals, and permitted competency ratings. Save, then submit. After manager and optional HR review and finalization, read the result and use **Acknowledge receipt** or **Dispute** with a comment. Expected: acknowledgement means receipt, and dispute does not rewrite the score.
6. Open **My KPI Report** (`/dashboard/me/kpi/reports`). Download PDF and Excel. Expected: only your records appear. Historical finalized score stays frozen even if a live achievement is later corrected.

## Executive management walkthrough

1. Sign in as `kpi-executive@example.invalid`. Open **KPI Management → Analytics**. Expected: authorized company-level assignment status is visible; individual appraisal details and small-group scores are withheld.
2. Open **KPI Management → Reports** and select **Executive summary**. Expected: aggregate coverage and outstanding status counts appear, with “Overall performance index not configured.” PDF and Excel exports contain the same permitted data. Individual and HR report API requests are denied.

## End-to-end checklist

Use a fresh synthetic code and period so the existing demonstrations stay intact.

1. **Administrator:** create and publish a KPI definition; choose its measurement type and unit.
2. **Administrator or manager:** create a reporting period if needed, assign the KPI to employee `KPIE2E-E1`, and set a target.
3. **Administrator or manager:** create a weighted scorecard using the assignment, validate weights sum to 100%, and publish it.
4. **Employee:** sign in, verify the target, save an achievement draft, attach permitted synthetic evidence, and submit.
5. **Manager:** sign in, review evidence, return the submission with a reason.
6. **Employee:** correct and resubmit. Confirm the previous revision remains visible.
7. **Manager:** approve. Confirm the scorecard now shows the approved actual and correct weighted contribution.
8. **Administrator:** create an evaluation cycle and enroll the employee with the correct manager and scorecard.
9. **Employee:** submit a self-assessment. **Manager:** submit competency ratings and feedback. **HR:** review if configured, approve, and finalize once required KPI data is complete.
10. **Employee:** read the result and acknowledge receipt or record a dispute.
11. **Administrator/manager/employee/executive:** inspect each permitted analytics view and report. Compare screen, PDF, and Excel for the same filters.
12. Repeat with an incomplete or rejected achievement. Expected: no final score for a card missing required approved actuals. Attempt to access another company or employee ID; expect access denied or no data.

If a page says **not enabled**, verify the local preview process has all six KPI phase flags set. If login lands on the wrong dashboard, sign out and use a fresh private session; the dashboard type is derived from the account's existing permissions. If a report is empty, choose a period with matching authorized data and check whether the KPI was assigned to the selected employee. For a reproducible failure, record the role, URL, filters, record ID, expected result, actual result, and time; do not include the password or private evidence content.
