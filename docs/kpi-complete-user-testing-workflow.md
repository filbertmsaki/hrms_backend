# KPI and Performance Management: complete user testing journey

> **Current checkout warning (2026-11-12):** During final documentation verification, the KPI route/component source files inspected earlier in this session disappeared from the current `hrms` working tree, which has unresolved Git changes, and `http://127.0.0.1:39993` did not respond. The paths and controls below reflect the implementation inspected before that change and the latest STATE.md, but **do not begin manual testing until the KPI frontend files and main application are restored/verified by the repository owner**. No files were restored or discarded while preparing this guide.

This is a **manual acceptance guide**, not a record of tests already passed. Mark each step only after you perform it. Use an authorized **synthetic employee** and a unique test prefix such as `UATMANUAL-202611`; do not change a real employee's performance record. The example is **Monthly Insurance Policy Renewals Completed**, target **20**, corrected actual **18**. These are test values, not company policy. Keep one reporting period, employee, KPI assignment, scorecard, and evaluation throughout.

**Journey:** HR setup → KPI definition → assignment and target → scorecard → employee achievement → manager return and approval → scorecard result → employee self-assessment → manager assessment → HR review and finalization → employee acknowledgement → analytics and reports.

The HRMS uses separate domain workflows. A reporting period and KPI definition can be created independently. A scorecard uses eligible assignments and a published scoring policy. An evaluation cycle is a separate record and enrollment needs a published personal scorecard for its period. Approved achievement values feed the **live** scorecard; finalization freezes an evaluation snapshot. An official combined KPI/competency rating is unavailable unless an approved policy is configured.

## Before you begin

Open the main local HRMS at **http://127.0.0.1:39993**. Confirm it is connected to the intended main local backend; if unavailable, ask the operator for the current URL. Do not use the older isolated-preview instructions in `kpi-local-user-testing-guide.md` (port 38890 and `hrms_kpi_dev_test`). The sidebar shows **KPI & Performance**; authorized HR/manager users see **KPI Management**, while employees use **My KPI & Performance** and its tabs **My Performance**, **My KPIs**, **My Scorecards**, **My Evaluations**, and **My KPI Report**. Management tabs include **KPI Library**, **Scorecards**, **Achievement Reviews**, **Performance Evaluations**, **Analytics**, and **Reports**. Configuration pages are also reachable at the routes below.

### Accounts and roles

| Test role | Known synthetic account | Used for |
|---|---|---|
| HR Manager / HR reviewer | `hr.kpi.review.20261110@example.test` | Configuration, enrollment, HR review, reporting |
| Branch Manager | `kpi.qa.manager@example.com` | Assigned employee's achievement and evaluation review |
| Employee in Claims | `kpi.qa.claims@example.com` | Main scenario; employee ID **4** at last documentation audit |
| Employee in Underwriting | `kpi.qa.underwriting@example.com` | Optional separate-assignment and reminder checks |
| Company Administrator | No separate synthetic account confirmed | Only needed if the HR Manager lacks a specific configuration permission |
| MANAGEMENT | No authorized synthetic account confirmed | Executive-only section; request one from an authorized administrator if needed |

Manager employee ID **3**, Claims employee ID **4**, and HR membership ID **9** were recorded in STATE.md. **Recheck them in Employees and against current account context before entering IDs.** HR setup and HR review may use the same HR Manager account if it has the required permissions; a second privileged account is not inherently required. The HR reviewer membership ID field defaults to the cycle creator, so leave it empty for this scenario. Credentials are held in existing private local secret files or your approved password manager; this guide contains no passwords. If an account cannot sign in, ask an authorized administrator to provide approved access. Do not reset a real user's password or create a privileged account just for this guide.

### Record tracker

| Record | Name / ID to record | Notes |
|---|---|---|
| Company, Claims department, branch | | |
| Test employee and reporting manager | | |
| Reporting period | | |
| Published KPI definition/version | | |
| Published scoring policy/version | | |
| Assignment and target revision | | |
| Published employee scorecard/version | | |
| Published evaluation template/version | | |
| Evaluation cycle and evaluation ID | | |
| Achievement and approved revision | | |
| Finalized evaluation snapshot | | |

Choose an existing **monthly period covering November 2026** if one exists; otherwise use label `November 2026 Policy Renewal Test`, start `2026-11-01`, end `2026-11-30`. Avoid a duplicate/overlapping period. If testing later, substitute one suitable test month and use it consistently. Before creating a new scoring policy, check for an **existing published, approved** policy. Do not publish an official policy merely to make this test pass. A one-KPI scorecard with weight **100%** needs no second KPI. Whether 18/20 yields a displayed 90% depends on the selected policy and its version; record the actual policy calculation rather than assuming a formula.

For **every step**, tick the heading when done and replace `NOT TESTED` with PASS, FAIL, or BLOCKED. Capture an ID or screenshot reference without putting private evidence in this document.

## Stage 1 — HR setup

### ☐ 1. Confirm the existing organizational relationship

**Log in as:** HR Manager.  
**Navigate to:** Existing HRMS **Employees**, **Departments**, and **Branches** pages; then **KPI & Performance → KPI Management** (`/dashboard/kpi`).  
**What to do:** Find the synthetic Claims employee and assigned Branch Manager. Confirm company, department, branch, reporting relationship, and active membership. Record their current IDs.  
**Example values:** Claims employee `kpi.qa.claims@example.com`; manager `kpi.qa.manager@example.com`.  
**Why you're doing it:** Assignments and reviews use the HRMS employee and organizational records, not separate KPI users.  
**Expected result:** Both appear in the same company and the manager is authorized for the employee's scope.  
**What changes for the next role:** HR can use these records for assignment and enrollment.  
**How to verify:** Compare employee details and current company selector; write IDs in the tracker.  
**If blocked:** If the employee or reporting scope is missing, ask an authorized HR administrator to correct the synthetic organizational record before continuing.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 2. Select or create the reporting period

**Log in as:** HR Manager.  
**Navigate to:** **KPI Management → Reporting Periods** (`/dashboard/kpi/periods`).  
**What to do:** Search for a suitable November 2026 monthly period. If absent, click **Create period**, choose Guided Wizard or Manual Mode, enter Frequency, Label, Start date, End date, review, then **Save period**.  
**Example values:** `November 2026 Policy Renewal Test`; `monthly`; `2026-11-01` to `2026-11-30`.  
**Why you're doing it:** The period scopes both the assignment and personal scorecard.  
**Expected result:** The saved period appears in the list and can be selected later.  
**What changes for the next role:** HR can attach the KPI assignment and evaluation cycle to this period.  
**How to verify:** Record the period ID and dates; confirm no duplicate period was created.  
**If blocked:** Fix date order/overlap or permissions. Reuse an existing valid period rather than creating a conflicting one.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 3. Create the KPI definition as a draft

**Log in as:** HR Manager.  
**Navigate to:** **KPI Management → KPI Library** (`/dashboard/kpi`), then **Create KPI → Guided Wizard**.  
**What to do:** Complete Basic Information and Measurement steps. Continue through Target and Period Planning (it explains that employee targets belong to assignments), review, and **Save Draft**. Manual Creation is an alternative for experienced users and uses the same API.  
**Example values:** Identifier `UATMANUAL_RENEWALS_202611`; Name `Monthly Insurance Policy Renewals Completed`; Description `Count of eligible policies renewed during the test month`; Category use an existing suitable category; Measurement type `numeric`/count; Unit `renewals`; Direction `higher`. Set Frequency `monthly` if requested.  
**Why you're doing it:** A definition says *what* is measured; it does not yet assign work or set one employee's target.  
**Expected result:** A draft appears in KPI Library with its version and measurement configuration.  
**What changes for the next role:** HR can publish the definition; employees still have no assignment.  
**How to verify:** Open **View & history** and record its definition and version IDs.  
**If blocked:** Use a unique identifier; complete required fields. Do not substitute a different measurement type just to bypass validation.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 4. Publish the KPI definition

**Log in as:** HR Manager.  
**Navigate to:** **KPI Library** (`/dashboard/kpi`), open the draft row.  
**What to do:** Check its details, then use **Publish** for the draft.  
**Example values:** The definition from step 3.  
**Why you're doing it:** Only a published version is eligible for assignment and a published version preserves its rules.  
**Expected result:** Status changes to published; the version remains visible in history.  
**What changes for the next role:** HR can select this KPI in the assignment flow.  
**How to verify:** Refresh the Library; confirm exact code, measurement, version and published state.  
**If blocked:** Correct required draft fields or ask an authorized publisher; do not create a duplicate definition.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 5. Check the scoring policy

**Log in as:** HR Manager.  
**Navigate to:** **KPI Management → Scoring Policies** (`/dashboard/kpi/scoring-policies`).  
**What to do:** Find an existing **published** policy suitable for a weighted employee scorecard. Open it and record its version, score cap, missing-result treatment, and measurement behavior. Do not change the policy.  
**Example values:** The existing approved policy you select; no invented default.  
**Why you're doing it:** The scorecard must use a stable published calculation policy.  
**Expected result:** A usable policy version is available to select in the Scorecard Builder.  
**What changes for the next role:** HR can configure a scorecard; the employee's actual will later be scored under this version.  
**How to verify:** Record policy name/version and note its calculation rule.  
**If blocked:** If no approved published policy exists, stop scorecard publication and finalization here; ask the policy owner to approve an appropriate test policy. **Create scoring policy** exists, but publishing a new official rule is a business decision.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 6. Assign the KPI and target to the test employee

**Log in as:** HR Manager.  
**Navigate to:** **KPI Management → Assignments** (`/dashboard/kpi/assignments`), then **Assign KPI**.  
**What to do:** In Guided Wizard, select the Claims employee, the published KPI, and the same reporting period; enter the employee-specific target. Review before confirming. Manual Mode provides direct entry.  
**Example values:** Claims employee from step 1; KPI from step 4; November period from step 2; target `20` renewals.  
**Why you're doing it:** A published definition alone does not tell a specific employee what to achieve. The target belongs to this assignment.  
**Expected result:** An active assignment with a target revision appears.  
**What changes for the next role:** The employee should see an assigned KPI and can prepare an achievement when the period permits it.  
**How to verify:** Open the assignment or **Targets** (`/dashboard/kpi/targets`); record assignment ID, period, employee, definition version, target and unit.  
**If blocked:** Check publication, period, company, duplicate assignment, manager scope, and target type. Do not force a duplicate.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 7. Build and publish the employee scorecard

**Log in as:** HR Manager.  
**Navigate to:** **KPI Management → Scorecards** (`/dashboard/kpi/scorecards`) → **Create Scorecard** (`/dashboard/kpi/scorecards/new`).  
**What to do:** Use Guided Builder: name the employee scorecard; select the same employee and period; add the eligible assignment; set its weight; select the published scoring policy; review; choose **Save and publish** if allowed, or save draft then publish from its details.  
**Example values:** Identifier `UATMANUAL_SCORECARD_202611`; Name `Claims Policy Renewal Test`; Type `employee`; owner employee ID from step 1; manager employee ID from step 1; one assignment at `100%` weight, marked required; policy from step 5.  
**Why you're doing it:** This links the assigned KPI, weight, period and immutable scoring policy. A one-KPI scorecard tests weighting without inventing a second KPI.  
**Expected result:** Published personal scorecard exists for the same employee and period. Before approval, its result should be incomplete/awaiting approved data.  
**What changes for the next role:** The employee can view **My Scorecards**; the evaluation cycle can later enroll this scorecard.  
**How to verify:** Record scorecard ID and published version; confirm required weight total is valid and that the assignment is included exactly once.  
**If blocked:** The builder requires an eligible assignment with target and a published policy. Return to steps 5–6.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 8. Prepare the appraisal template

**Log in as:** HR Manager.  
**Navigate to:** **KPI Management → Performance Evaluations → Appraisal templates** (`/dashboard/kpi/evaluation-templates`).  
**What to do:** Select an existing published test template if appropriate; otherwise use the template form to create a draft, enter competency codes and scale rows, select **Require HR review** for this test, then publish its version.  
**Example values:** Code `UATMANUAL_EVAL_TEMPLATE_202611`; Name `Monthly Claims Review Test`; competency `QUALITY:Quality of work`; use the supported `value:label` scale format shown in the form. These are synthetic examples only.  
**Why you're doing it:** Formal appraisal uses its own versioned template, separate from KPI definitions and scoring.  
**Expected result:** A published evaluation template version with HR review required.  
**What changes for the next role:** HR can create a cycle requiring employee, manager and HR stages.  
**How to verify:** Record template version; confirm `Require HR review` and permitted rating scale.  
**If blocked:** Use an already published authorized template or ask HR policy owner; do not invent an official competency scale.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 9. Create and open the evaluation cycle

**Log in as:** HR Manager.  
**Navigate to:** **KPI Management → Performance Evaluations → Evaluation Cycles** (`/dashboard/kpi/evaluation-cycles`).  
**What to do:** Use Guided Wizard or Manual Mode. Enter identifier, name, frequency, the **same reporting period**, published template, dates and optional soft deadlines. Leave HR reviewer membership ID blank to use the cycle creator. Choose **Create cycle draft**, then **Open cycle** on its row.  
**Example values:** `UATMANUAL_CYCLE_202611`, `November Claims Review Test`, `monthly`, same November period and dates.  
**Why you're doing it:** The evaluation cycle controls appraisal participation and deadlines; it does not replace the KPI period.  
**Expected result:** Cycle status becomes open. Optional deadlines remain soft unless approved policy says otherwise.  
**What changes for the next role:** HR can enroll the synthetic employee.  
**How to verify:** Record cycle ID and status; check period/template IDs.  
**If blocked:** Confirm the template is published and dates align with the chosen period. No hard cutoff should be assumed.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 10. Enroll the employee and manager

**Log in as:** HR Manager.  
**Navigate to:** **Evaluation Cycles** (`/dashboard/kpi/evaluation-cycles`) → **Assign an employee**.  
**What to do:** Choose the open cycle; enter Employee ID, Manager employee ID, and **Published employee scorecard ID**; click **Assign evaluation**.  
**Example values:** Reverified employee ID `4`, manager ID `3`, scorecard ID from step 7.  
**Why you're doing it:** Enrollment explicitly links the person, reviewer and published scorecard to the appraisal.  
**Expected result:** A new evaluation appears in Performance Evaluations and the employee's **My Evaluations**.  
**What changes for the next role:** The employee can prepare a self-assessment; the manager becomes responsible after submission.  
**How to verify:** Record evaluation ID; confirm same cycle, employee, manager, company and period.  
**If blocked:** Check open cycle, published personal scorecard, period match and reviewer scope. The form currently asks for numeric IDs; copy them from detail screens rather than guessing.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

**HR handoff check:** Period, published definition, assignment+target, published policy, published scorecard, published appraisal template, open cycle and evaluation enrollment all refer to the intended company/employee/period. Sign out before using the employee account.

## Stage 2 — Employee achievement

### ☐ 11. Understand your personal starting point

**Log in as:** Claims Employee.  
**Navigate to:** **KPI & Performance → My KPI & Performance → My Performance** (`/dashboard/me/kpi/overview`).  
**What to do:** Read **Your Next Actions**, the journey/status card, current KPI and evaluation panels.  
**Example values:** The same period and employee used above.  
**Why you're doing it:** This page should explain your task and distinguish waiting on HR/manager from work you can do.  
**Expected result:** The test assignment and personal next step appear; no HR-only creation controls appear.  
**What changes for the next role:** None yet; employee now knows where to submit.  
**How to verify:** Check employee identity and period, not company-wide totals.  
**If blocked:** Wrong account/company or missing enrollment/assignment; return to HR steps 1, 6 and 10.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 12. Inspect the assigned target

**Log in as:** Claims Employee.  
**Navigate to:** **My KPIs** (`/dashboard/me/kpi`), then open the assigned KPI.  
**What to do:** Read KPI name/description, reporting period, target, unit, direction, status and available actions.  
**Example values:** 20 renewals target, count/numeric, higher is better.  
**Why you're doing it:** The target is the planned expectation; the actual achievement is entered separately.  
**Expected result:** Only this employee's authorized assignment is shown.  
**What changes for the next role:** Employee can record actual results; manager has no review task until submission.  
**How to verify:** Assignment ID matches step 6 and target revision is current.  
**If blocked:** If no KPI is assigned, HR/manager must resolve assignment or period setup; any **Remind HR** action should appear only for a supported HR-owned blocker.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 13. Save a draft, attach evidence and submit

**Log in as:** Claims Employee.  
**Navigate to:** Open the assignment at `/dashboard/me/kpi/[assignmentId]`; choose **Guided** achievement flow (Manual Entry uses the same endpoint).  
**What to do:** Enter the actual and comments, **Save draft**, attach a small permitted synthetic PDF through the evidence control, review the saved evidence, then **Submit for review**. Use a document containing no real customer or policy data.  
**Example values:** Actual `17` renewals first; comment `Test submission; 18th renewal needs reconciliation`; evidence `synthetic-renewal-count.pdf` if file policy allows.  
**Why you're doing it:** Actuals and evidence support the manager's approval decision; a draft is editable, a submitted entry is read-only while under review.  
**Expected result:** Submission status becomes submitted/pending review; evidence is associated with the achievement.  
**What changes for the next role:** Assigned manager receives or can retrieve a review task.  
**How to verify:** Record achievement ID and revision; refresh to confirm comments and evidence persist.  
**If blocked:** Save the draft first; check measurement validation, permitted file type/size and target. If upload fails, record the exact error and do not claim evidence was attached.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 14. Check pending-score behavior

**Log in as:** Claims Employee.  
**Navigate to:** **My Scorecards** (`/dashboard/me/kpi/scorecards`) and **My Performance** (`/dashboard/me/kpi/overview`).  
**What to do:** Open the current published scorecard and inspect completeness/approved actual.  
**Example values:** Submitted `17`, not yet approved.  
**Why you're doing it:** Pending self-reported results must not become approved scorecard performance.  
**Expected result:** Awaiting approval/incomplete state; no final score based on `17`. My Performance should identify manager review as next responsibility.  
**What changes for the next role:** Manager must inspect the submitted achievement.  
**How to verify:** Compare status in My KPIs and My Scorecards after refresh.  
**If blocked:** If a score already includes pending `17`, record a FAIL and stop scoring/finalization; this needs investigation.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

## Stage 3 — Manager return, employee correction, approval

### ☐ 15. Open the pending manager review

**Log in as:** Branch Manager (sign out of employee account first).  
**Navigate to:** **KPI & Performance → KPI Management → Achievement Reviews** (`/dashboard/kpi/reviews`).  
**What to do:** Filter by pending status/period as needed; open the Claims employee's submission with **Review**. Inspect target, actual, comment, evidence and revision history.  
**Example values:** Achievement ID from step 13; target 20; submitted actual 17.  
**Why you're doing it:** Review authority is tied to the employee's reporting scope.  
**Expected result:** The assigned manager can inspect this record and evidence, not other employees' private records outside scope.  
**What changes for the next role:** Manager may approve or request correction.  
**How to verify:** Open the evidence through the authorized control, confirm the file is the synthetic document; record any access failure.  
**If blocked:** Check manager/branch scope and assignment linkage; HR may need an authorized reviewer reassignment, not a browser workaround.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 16. Return the achievement for correction

**Log in as:** Branch Manager.  
**Navigate to:** Open review detail at `/dashboard/kpi/reviews/[achievementId]`.  
**What to do:** If offered, click **Start review**, enter a concrete **Review comments** reason, then **Return for correction**.  
**Example values:** `Please reconcile the renewal register and update the count to 18 with corrected evidence.`  
**Why you're doing it:** A returned record lets the employee correct the submission without erasing its earlier version.  
**Expected result:** Status becomes returned for correction; decision/reason and reviewer are preserved.  
**What changes for the next role:** Employee may edit and resubmit a new revision.  
**How to verify:** Refresh review detail and history; check review decision timestamp.  
**If blocked:** A reason may be mandatory; check exact status and manager scope. Do not click Reject for this test.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 17. Correct and resubmit the returned entry

**Log in as:** Claims Employee (sign out and sign in).  
**Navigate to:** **My KPIs** (`/dashboard/me/kpi`) → returned assignment detail.  
**What to do:** Read manager feedback; update the actual, supporting comment and evidence if needed; **Save draft** and **Submit for review** again.  
**Example values:** Corrected actual `18` renewals; comment `Reconciled against synthetic renewal register.`  
**Why you're doing it:** The corrected revision is the one the manager can approve; the first submission remains traceable.  
**Expected result:** New revision submitted; prior `17` and return reason remain in history.  
**What changes for the next role:** Manager has a fresh review task.  
**How to verify:** Record new revision identifier; check evidence and history.  
**If blocked:** If status is still submitted/read-only, refresh; if it remains blocked, record exact status and ask manager to confirm the return action completed.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 18. Approve the corrected actual

**Log in as:** Branch Manager.  
**Navigate to:** **Achievement Reviews** (`/dashboard/kpi/reviews`) → corrected achievement detail.  
**What to do:** Inspect revised value/evidence/history and choose **Approve** with an appropriate review comment.  
**Example values:** Actual `18`; comment `Synthetic register reconciled; approved for test.`  
**Why you're doing it:** Only a manager-authorized, approved actual is eligible for scoring.  
**Expected result:** Approved status, reviewer, decision time and approved revision recorded; employee can no longer edit that approved revision.  
**What changes for the next role:** Employee and HR can inspect the live scorecard; employee can proceed with appraisal.  
**How to verify:** Refresh detail and list; ensure one approval event, no duplicate active review task.  
**If blocked:** Check correct manager scope and that the current revision is submitted/under review. Do not retry a successful approval.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 19. Reconcile the live scorecard

**Log in as:** Claims Employee.  
**Navigate to:** **My Scorecards** (`/dashboard/me/kpi/scorecards`) → current published scorecard detail.  
**What to do:** Compare target, approved actual, weight, weighted contribution, completeness and policy/version against the record tracker.  
**Example values:** Target 20, approved actual 18, weight 100%.  
**Why you're doing it:** This is the handoff from manager approval into performance calculation.  
**Expected result:** Scorecard reflects **18**, not returned **17**; it is complete if all required assignments have approved results. If the selected policy computes 18/20 as 90%, a one-KPI 100%-weighted score may show 90%; use the **actual policy calculation** as authority.  
**What changes for the next role:** Manager and HR can review approved KPI results in the evaluation.  
**How to verify:** Open calculation details; note policy version, approved achievement revision, weight and displayed result.  
**If blocked:** Missing approved result, required second KPI, or policy rule may keep it incomplete; resolve the actual prerequisite, not by treating missing data as zero.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

## Stage 4 — Formal evaluation

### ☐ 20. Save and submit the employee self-assessment

**Log in as:** Claims Employee.  
**Navigate to:** **My Evaluations** (`/dashboard/me/evaluations`) → evaluation from step 10; Guided or Manual Mode.  
**What to do:** Read the approved KPI section. Fill **Key achievements**, **Challenges**, **Observations**, **Development needs**, **Future goals**, **Overall comments**, and permitted competency reflections. Click **Save draft**, then **Submit to manager**.  
**Example values:** Key achievements `18 synthetic renewals`; Challenges `Two records needed reconciliation`; Development needs `Improve renewal-register checks`.  
**Why you're doing it:** The employee supplies context and a self-view; this does not overwrite the approved KPI actual.  
**Expected result:** Self-assessment persists and status moves to submitted/manager review.  
**What changes for the next role:** Assigned manager can complete the manager assessment.  
**How to verify:** Refresh evaluation detail; ensure fields persist and **Submit to manager** is no longer an editable draft action.  
**If blocked:** The submit button requires a saved draft; save first. Check cycle enrollment and current status if still unavailable.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 21. Save and submit the manager assessment

**Log in as:** Branch Manager.  
**Navigate to:** **KPI Management → Performance Evaluations** (`/dashboard/kpi/evaluations`) → same evaluation.  
**What to do:** Read approved KPI results and employee text; select competency ratings from the published template scale; fill **Strengths**, **Development needs**, **Manager feedback**, **Recommendations**. Click **Save manager draft**, then **Submit manager review**.  
**Example values:** Strengths `Consistent synthetic follow-up`; Feedback `18 of 20 test renewals recorded`; choose only ratings permitted by the template, without inventing an official combined rating.  
**Why you're doing it:** Manager assessment is a separate, attributed review of performance.  
**Expected result:** Manager data persists; evaluation status becomes manager submitted.  
**What changes for the next role:** HR reviewer receives/locates the HR review task because this test template requires it.  
**How to verify:** Refresh detail, confirm reviewer identity, saved ratings, comments, timestamp and status.  
**If blocked:** Complete all required scale fields and save the draft before submitting; confirm manager assignment and reporting scope.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 22. Record the HR review and approve

**Log in as:** HR Manager / designated HR reviewer.  
**Navigate to:** **Performance Evaluations** (`/dashboard/kpi/evaluations`) → same evaluation; also inspect existing action inbox if a task is shown.  
**What to do:** Inspect self and manager sections, KPI completeness and reviewer history. Enter **Review comment**; click **Record HR review**, then **Approve evaluation**.  
**Example values:** `Synthetic record complete; KPI result and manager review verified.`  
**Why you're doing it:** The published template requires an HR decision before finalization.  
**Expected result:** HR review decision is recorded, then status becomes approved; the review task is completed. KPI and competency results remain separate; **Combined rating not configured** is valid without an approved combination policy.  
**What changes for the next role:** HR can finalize, provided required KPI results are complete.  
**How to verify:** Refresh status/history and inbox task; confirm no duplicate active HR task.  
**If blocked:** Check designated HR membership, submitted manager review, template policy and scorecard completeness. `Return to manager` is for a genuine correction, not a shortcut.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 23. Finalize and record the frozen result

**Log in as:** HR Manager / authorized finalizer.  
**Navigate to:** Same evaluation at `/dashboard/kpi/evaluations/[evaluationId]`.  
**What to do:** Confirm approved status and complete required KPI measurements; click **Finalize** and confirm the dialog.  
**Example values:** The approved live scorecard from step 19.  
**Why you're doing it:** Finalization preserves a historical snapshot that later KPI corrections cannot silently rewrite.  
**Expected result:** Status finalized; snapshot records the applicable scorecard, policy/configuration and approved achievement revision.  
**What changes for the next role:** Employee may acknowledge receipt or record disagreement.  
**How to verify:** Record finalization time and snapshot result; compare with step 19.  
**If blocked:** The UI warns when required approved KPI data is missing; resolve that first. Do not bypass missing data with a made-up final score.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

## Stage 5 — Employee acknowledgement

### ☐ 24. Acknowledge receipt

**Log in as:** Claims Employee.  
**Navigate to:** **My Evaluations** (`/dashboard/me/evaluations`) → finalized evaluation.  
**What to do:** Read the result and manager feedback; enter optional **Acknowledgement comment**; click **Acknowledge receipt** and confirm.  
**Example values:** `Received and reviewed the synthetic evaluation.`  
**Why you're doing it:** Acknowledgement records receipt, **not agreement** with the result.  
**Expected result:** Acknowledgement status and timestamp appear; finalized score is unchanged.  
**What changes for the next role:** HR can see completion and acknowledgement in reporting.  
**How to verify:** Refresh evaluation detail; record acknowledgement time and check score remains frozen.  
**If blocked:** Only finalized evaluations offer this action. **Record disagreement** is a separate alternative while no acknowledgement/dispute is recorded; use another synthetic evaluation for that optional test.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

## Stage 6 — HR analytics and reports

### ☐ 25. Reconcile analytics with the workflow

**Log in as:** HR Manager.  
**Navigate to:** **KPI Management → Analytics** (`/dashboard/kpi/analytics`).  
**What to do:** Filter to the same company/period and Claims department or employee where authorized. Inspect assignment, approval, scorecard completeness and evaluation status summaries; switch to status/history views as offered.  
**Example values:** Period from step 2; employee from step 1; approved actual 18; one finalized and acknowledged synthetic evaluation.  
**Why you're doing it:** Organizational analytics should reconcile to source records without presenting an incomplete result as final.  
**Expected result:** Test records appear in the relevant counts; pending/returned revision history is distinct from the final approved result. No overall company index is invented.  
**What changes for the next role:** HR can generate detail/coverage reports; MANAGEMENT can inspect aggregate summaries if authorized.  
**How to verify:** Compare filtered counts with assignment, achievement and evaluation detail IDs; note whether counts include historical records.  
**If blocked:** Clear incompatible filters, check period/company and role. Zero data for a legitimate filter should be an empty state, not a fabricated zero score.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 26. Preview and download the individual report

**Log in as:** HR Manager.  
**Navigate to:** **KPI Management → Reports** (`/dashboard/kpi/reports`).  
**What to do:** Choose **Individual** report in Guided Report Builder or Manual Mode; select the same employee and period; **Generate report**; inspect live versus finalized values; click **Download PDF** and **Download Excel**.  
**Example values:** Claims employee, period from step 2.  
**Why you're doing it:** Screen and exports must show the same authorized source values and distinguish live scorecard from frozen appraisal.  
**Expected result:** PDF and XLSX downloads open; approved actual 18 and finalization information agree with the preview.  
**What changes for the next role:** Employee can view only their own **My KPI Report**; HR can check department/branch coverage.  
**How to verify:** Compare names, dates, applied filters, actual, completeness and historical result across screen/PDF/XLSX; note file names.  
**If blocked:** Preview must exist before download; check file permissions, popup/download settings and missing required filter. Never email confidential report files as a workaround.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 27. Check department, branch and HR evaluation reports

**Log in as:** HR Manager.  
**Navigate to:** **Reports** (`/dashboard/kpi/reports`).  
**What to do:** In turn select **Department**, **Branch**, and **HR evaluation** report types; apply the same period/department/branch/cycle; click **Generate report** for each, inspect coverage and outstanding actions, then download PDF/XLSX for at least one aggregate report.  
**Example values:** Claims department, test employee's branch, cycle from step 9.  
**Why you're doing it:** These reports answer different coverage questions and may have different denominators.  
**Expected result:** The synthetic finalized evaluation contributes to appropriate completion counts; coverage is not misrepresented as an overall performance score.  
**What changes for the next role:** MANAGEMENT can see permitted executive aggregate coverage.  
**How to verify:** Compare preview and exported totals, period and filters; record any small-group suppression or unavailable value.  
**If blocked:** The authorization/privacy policy may suppress a small group; record the displayed explanation rather than treating it as zero.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 28. Check the employee's personal report

**Log in as:** Claims Employee.  
**Navigate to:** **My KPI Report** (`/dashboard/me/kpi/reports`).  
**What to do:** Select the test period; generate the personal report and use available PDF/Excel downloads.  
**Example values:** Same period, approved actual 18.  
**Why you're doing it:** The employee should see their own permitted performance information without HR-wide report controls.  
**Expected result:** Personal data matches the HR individual report for shared fields; no other employee appears.  
**What changes for the next role:** None; this is a personal access check.  
**How to verify:** Compare common figures with step 26 and inspect download contents.  
**If blocked:** If report is unavailable, verify employee identity, period and scorecard publication; do not use an HR account to mask an employee authorization defect.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

## Stage 7 — Executive management

### ☐ 29. Inspect aggregate executive reporting

**Log in as:** Authorized MANAGEMENT synthetic account, **if one is provided**.  
**Navigate to:** **KPI Management → Analytics** (`/dashboard/kpi/analytics`) and **Reports** (`/dashboard/kpi/reports`), where shown for that account.  
**What to do:** Choose executive/aggregate summary and same period. Inspect eligible/complete scorecards, achievement and evaluation coverage and department/branch summaries. Attempt a direct individual report/detail URL only if this is an approved security test.  
**Example values:** Same November test period; no individual employee filter.  
**Why you're doing it:** MANAGEMENT access is intended for authorized aggregate visibility, not automatic access to confidential personal appraisals.  
**Expected result:** Aggregate-only permitted information; no invented overall company index; confidential employee detail requests denied without explicit permission.  
**What changes for the next role:** None; this concludes the main role journey.  
**How to verify:** Record visible report types and the exact access-denied response for a restricted direct URL.  
**If blocked:** No known authorized synthetic MANAGEMENT account is documented. Ask an administrator to provide an existing approved account or create a synthetic one through normal authorized procedures; mark this step BLOCKED until then.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

## Advanced exception tests — separate synthetic records only

Do these after the main journey. Never mutate the completed main evaluation merely to test a failure state. Each item remains **NOT TESTED** until you perform it.

### ☐ 30. Missing setup and shared HR reminder

**Log in as:** Synthetic Employee A, then synthetic Employee B in the same affected company/scope; HR Manager afterward.  
**Navigate to:** **My Performance** (`/dashboard/me/kpi/overview`); HR uses the existing notification/action inbox and the linked setup page.  
**What to do:** Use an approved synthetic period/scope with a genuine HR-owned missing definition, period, assignment or scorecard step. Read the blocker; if **Remind HR** is offered, send it once as A, refresh as B and inspect **Reminder Already Sent**; HR opens **Resolve Now**.  
**Example values:** A and B affected by the *same* unresolved period-level setup; not two different employee-specific assignment issues.  
**Why you're doing it:** Shared blockers should create one active HR reminder, while individual issues remain separate.  
**Expected result:** A sees recorded reminder; B sees HR already notified; HR gets one actionable task; resolution updates status after refresh. No email/SMS delivery is implied.  
**What changes for the next role:** HR owns the setup; employees act only once it is complete.  
**How to verify:** Compare issue scope/period and inbox task count; check the next action changes after HR resolves the real dependency.  
**If blocked:** Do not invent a blocker or send reminders to real HR staff. If no authorized synthetic fixture exists, mark BLOCKED and ask for one.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 31. Unpublished, missing-target and incomplete-scorecard states

**Log in as:** HR Manager for setup, then synthetic Employee.  
**Navigate to:** **KPI Library**, **Assignments/Targets**, **My KPIs**, **My Scorecards**.  
**What to do:** With separate disposable test records, inspect a draft definition (should not be assignable), an assignment missing required target (submission blocked), and a published scorecard with a required KPI still pending approval.  
**Example values:** Unique `UATMANUAL_EXCEPTION_*` codes, never the main finalized record.  
**Why you're doing it:** A missing prerequisite must be explained; pending is not zero.  
**Expected result:** Action is unavailable with the real reason and responsible role; incomplete scorecard has no misleading final score.  
**What changes for the next role:** HR/manager completes prerequisite or employee waits for approval.  
**How to verify:** Compare published state, target revision, achievement status and scorecard completeness.  
**If blocked:** If the backend forbids creating a targetless assignment, test validation in the form instead and record that the invalid state cannot persist.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 32. Rejection and approved correction

**Log in as:** Synthetic Employee, then assigned Manager, then HR if correction authorization is needed.  
**Navigate to:** **My KPIs** → assignment; **Achievement Reviews** → submission detail.  
**What to do:** Create a **separate** synthetic submission, reject it with a written reason, then verify it contributes no approved score. On another approved synthetic achievement, use the supported authorized correction/supersession process; check revision history.  
**Example values:** Actual `10` for rejected case; `18` then `19` for approved-correction case.  
**Why you're doing it:** Rejected/pending values must not score; approved values must not be silently overwritten.  
**Expected result:** Rejection is recorded and excluded; correction produces an auditable new revision, preserving the old approval.  
**What changes for the next role:** Employee sees feedback; authorized reviewer handles corrected record.  
**How to verify:** Compare approval events, revision IDs and live scorecard; do not alter the main finalized snapshot.  
**If blocked:** Do not edit an approved record directly; record the exact supported correction action and required authorization.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 33. Missing enrollment, reviewer reassignment and pending evaluation

**Log in as:** HR Manager, then Manager/Employee as applicable.  
**Navigate to:** **Evaluation Cycles**, **Performance Evaluations** → separate synthetic evaluation.  
**What to do:** Confirm an unenrolled employee has no actionable self-evaluation. On an in-progress evaluation, enter a written HR reason and use **Reassign HR reviewer** (or **Reassign reviewer** for manager), then check the new reviewer/task.  
**Example values:** Different approved HR reviewer membership ID; reason `Synthetic reviewer availability change`.  
**Why you're doing it:** Explicit enrollment and reviewer authority control the workflow.  
**Expected result:** No self-assessment without enrollment; reassignment preserves audit history and directs the task to the authorized replacement.  
**What changes for the next role:** Newly assigned reviewer owns the next review.  
**How to verify:** Compare old/new reviewer IDs, status history and action inbox visibility.  
**If blocked:** No second authorized HR reviewer account is currently confirmed; request one through normal administration and mark reassignment BLOCKED until available.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 34. Dispute and amendment without rewriting history

**Log in as:** Employee on a **second finalized synthetic evaluation**, then authorized HR.  
**Navigate to:** **My Evaluations** → finalized detail; HR **Performance Evaluations** → same detail.  
**What to do:** Employee chooses **Record disagreement** with a comment (instead of acknowledgement). HR checks the approved result, enters a reason and, if authorized, clicks **Open amendment**.  
**Example values:** Dispute `I disagree with the synthetic manager narrative`; amendment reason `Correct synthetic narrative after review`.  
**Why you're doing it:** A dispute records disagreement, and an amendment creates an audited path without silently changing a finalized snapshot.  
**Expected result:** Dispute status appears; original finalized result persists; amendment history is separate.  
**What changes for the next role:** HR handles the amendment under existing policy.  
**How to verify:** Record old snapshot ID/score before action and compare afterward; confirm approval history remains visible.  
**If blocked:** The main evaluation was acknowledged, so it cannot also demonstrate the alternative dispute action; use another finalized synthetic evaluation.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

### ☐ 35. Permissions, company isolation and private downloads

**Log in as:** Synthetic Employee, Manager and HR accounts in turn; a second-company synthetic account only if explicitly available.  
**Navigate to:** My KPIs/Scorecards/Evaluations/Reports; direct URLs to another synthetic employee's record/evidence/report; management Analytics and Reviews routes.  
**What to do:** Attempt read-only access to other employees' private IDs and restricted HR pages; do not edit any record.  
**Example values:** Use only synthetic record IDs documented in the tracker.  
**Why you're doing it:** Backend authorization must protect direct routes and downloads, not just hide sidebar links.  
**Expected result:** Employee cannot read another employee's private data; manager access is limited to reporting scope; cross-company requests are denied; MANAGEMENT does not automatically see confidential appraisal detail.  
**What changes for the next role:** None; this is an access-control check.  
**How to verify:** Record HTTP status/visible access-denied message without copying private content.  
**If blocked:** A true cross-company test needs an authorized second-company synthetic account; do not create one or borrow real-user credentials without approval.  
**Test result:** NOT TESTED. **Notes / IDs / screenshot:** __________

## Troubleshooting while testing

| Symptom | First check | Safe response |
|---|---|---|
| Sign-in cannot reach service | Local frontend/backend addresses and health; browser network panel | Ask operator to restart main services; do not reset passwords |
| Expected menu missing | Signed-in role, company selector and membership | Use the intended test role; do not treat a hidden menu as proof of backend denial |
| KPI missing for employee | Published definition, assignment employee/period/target | Return to steps 4 and 6; refresh personal page |
| Scorecard missing/incomplete | Published scorecard, assignment, policy, approval status | Check step 7 and 19; do not enter a fake score |
| Submit button disabled | Draft save, required fields, current status, target | Read field errors and workflow blocker; record exact text |
| Manager review absent | Employee submission status and manager reporting scope | Check review filters and assigned reviewer; contact HR for authorized reassignment |
| HR finalization disabled | Required KPI approval and HR review stage | Resolve incomplete inputs, then revisit; no policy bypass |
| Report download fails | Preview generated, filters, role, browser download permission | Retry once and note HTTP error; avoid sharing confidential export |
| Reminder already sent | Same unresolved issue key | Wait for HR action; do not try another account to spam HR |

## Final acceptance record

- [ ] Main journey steps 1–28 completed and marked PASS, or precise FAIL/BLOCKED reason recorded.
- [ ] MANAGEMENT step 29 tested with an authorized account, or account prerequisite recorded.
- [ ] Exception steps 30–35 tested only with permitted synthetic records; untestable cases explicitly BLOCKED.
- [ ] One period, employee, assignment, scorecard, evaluation and policy version were tracked consistently.
- [ ] Pending/returned/rejected values did not become approved scorecard results.
- [ ] Finalized snapshot and acknowledgement were checked separately from the live scorecard.
- [ ] PDF/XLSX values were compared with the on-screen report.
- [ ] Any defect includes role, route, record ID, exact error, screenshot reference and time; no passwords/private evidence attached.

**Manual acceptance decision:** ☐ Accept ☐ Accept with issues ☐ Reject ☐ Not yet tested  
**Tester / date:** __________  **Issue references:** __________

An optional future in-app onboarding tour could link these existing screens and explain the next role action. It should use real authorized records and should not create mock performance data in the main application.
