# Mainland Tanzania leave: rule map, operations and sign-off

Status: implemented and verified on a scratch database. **Not enabled.** No employee uses these rules until HR posts a signed cutover snapshot and assigns them (see [Enablement gates](#enablement-gates)). Background and history: [mainland-leave-rollout.md](mainland-leave-rollout.md); plan: [mainland-leave-remaining-implementation.md](mainland-leave-remaining-implementation.md).

Legal references are to the Employment and Labour Relations Act, Cap. 366, R.E. 2023 (2019 R.E. section in brackets). Rows marked **company choice** or **legal to confirm** are not legal conclusions; they need HR/legal confirmation before enablement.

## How rules are configured

- Rules live in an approved, immutable **policy revision** (`leave_policy_revisions.rules`), created from a draft (`leave_policy_draft_revisions`) and approved by someone other than the draft's author. Template: `src/modules/hr/leave/config/mainland-policy-2027.draft.json`.
- **Effective dates:** every calculation picks the revision effective on the date being calculated (request start date, accrual day, exit date). A new revision never rewrites earlier postings. To change a rule, approve a new revision with a later effective date; withdraw a mistaken one (it stays in history).
- Employees reach a policy through an effective-dated **assignment** (`leave_policy_assignments`) plus a **leave profile** (`leave_employee_profiles`: jurisdiction, FTE, prior employment spells, optional cycle anchor). Missing jurisdiction or FTE blocks assignment; nothing defaults to Mainland or full-time.
- `leave_type_codes` maps each rule family to the company's leave type codes; leave types not mapped stay on the legacy engine.

## Rule map

Key paths are under the revision's `rules`. "Evidence" is what the system requires or records. "Payroll" is the effect on pay.

### Annual leave — s.32 (s.31)

| Rule | Key | Default | Evidence / control | Payroll | Reference |
| --- | --- | --- | --- | --- | --- |
| 28 days per leave cycle | `annual.entitlement_days`, `annual.cycle_length_months` | 28, 12 | — | Paid at full rate | s.32(1) |
| Cycle anchored on current hire date | `annual.cycle_anchor` | `current_hire_date` | Profile `cycle_anchor_date` overrides for migrated staff | — | s.32; anchor is company choice |
| Calendar days, public holidays counted | `annual.count_basis`, `annual.include_public_holidays` | `calendar_days`, true | — | — | company choice, legal to confirm |
| Daily accrual | `annual.accrual_method` | `daily` | Posted by the daily job; future accrual shown as projection only | — | company choice |
| Carry-over usable 6 months, extendable to 12 | `annual.carry_over_expiry_months`, `annual.approved_extension_months` | 6, 12 | Extension needs HR action + reason (audited) | — | s.32 (leave within 6 / up to 12 months), legal to confirm |
| Expiry flags, never silently forfeits | `annual.expiry_action` | `flag` | Flagged days stay usable/payable until HR forfeits (reason, audited) | Flagged days are paid on exit | company choice |
| Expiry warnings | `carry_over_warning_days` | 60, 30, 7 | Sent once each to HR and manager | — | company choice |
| Oldest credit used first | `annual.consumption_order` | `oldest_first` | Reservation rows record source cycle | — | company choice |
| No borrowing; advance leave off | `annual.advance_leave_enabled`, `annual.advance_leave_requires_hr_approval` | false, true | Booking limited to accrual projected to the request's last day less pending/future leave | — | company choice |
| No cash-out while employed | `annual.cash_out_while_employed` | false | — | — | s.32, legal to confirm |
| Occasional leave uses annual balance | `annual.occasional_leave_deducts_annual`, `leave_type_codes.occasional` | true | — | — | company choice |

### First six months, part-time, rehire

| Rule | Key | Default | Evidence / control | Payroll | Reference |
| --- | --- | --- | --- | --- | --- |
| 1.5 days per completed month until 6 months | `early_service.months`, `early_service.annual_days_per_completed_month` | 6, 1.5 | — | — | company benefit |
| True-up to normal accrual at 6 months | `early_service.true_up_to_first_cycle_accrual` | true | One `TRUE_UP` ledger row; days already taken are kept | — | company choice |
| Sick cap 7 paid days per spell before 6 months | `early_service.sick_paid_days_per_employment_spell` | 7 | Excess becomes unpaid | Unpaid days deducted | s.33 eligibility, legal to confirm |
| Prior employment changes eligibility only | `early_service.rehire_exception_changes_cycle_anchor`, `early_service.rehire_lookback_months` | false, 12 | Spells recorded on the profile; gaps never accrue | — | company choice |
| Prorate by FTE | `part_time.prorate_by_fte` | true | FTE from the profile in effect | — | company choice |

### Sick leave — s.33 (s.32)

| Rule | Key | Default | Evidence / control | Payroll | Reference |
| --- | --- | --- | --- | --- | --- |
| 126 working days per 36-month cycle | `sick.entitlement_days`, `sick.cycle_length_months`, `sick.count_basis` | 126, 36, `working_days` | Rest days and public holidays excluded | — | s.33 |
| 63 days full pay, 63 half pay | `sick.pay_tiers` | 63 @ 1.0, 126 @ 0.5 | Each ledger row carries its pay rate; pre-cutover days fill the ladder first | Pay rate per day from the ledger | s.33 |
| Beyond 126 days unpaid and flagged | `sick.beyond_tiers_pay_rate`, `sick.beyond_tiers_incapacity_flag` | 0, true | HR flag `SICK_BEYOND_ENTITLEMENT` | Unpaid | s.33; incapacity process is HR's |
| Medical certificate | `sick.medical_certificate_required`, `sick.hr_override_requires_reason` | true, true | Override needs reason (audited) | — | s.33 |
| Workers' compensation days excluded | `sick.exclude_workers_compensation_days` | true | — | — | company choice, legal to confirm |

### Maternity — s.34 (s.33)

| Rule | Key | Default | Evidence / control | Payroll | Reference |
| --- | --- | --- | --- | --- | --- |
| 84 days single birth, 100 multiple | `maternity.single_birth_days`, `maternity.multiple_birth_days`, `maternity.count_basis` | 84, 100, `calendar_days` | Birth life event (verified) | Paid per company/NSSF arrangement | s.34 |
| Extra 84 days if the child dies within 1 year | `maternity.child_death_extra_days`, `maternity.child_death_window_months` | 84, 12 | Child-death life event linked to birth; same term | — | s.34 |
| Maximum 4 paid terms across all spells | `maternity.maximum_paid_terms` | 4 | Historical terms recorded on life events; fifth blocked, HR notified (`MATERNITY_TERM_LIMIT`) | — | s.34 |
| 3 months' notice | `maternity.notice_months` | 3 | Warning, not a block | — | s.34 |
| Start up to 4 weeks before expected birth | `maternity.earliest_start_weeks_before_expected_birth`, `maternity.early_start_requires_certificate` | 4, true | Earlier start needs `MATERNITY_EARLY_START` override with certificate | — | s.34 |
| No work within 6 weeks of birth | `maternity.return_restriction_weeks_after_birth`, `maternity.return_requires_fitness_certificate`, `maternity.override_requires_certificate_and_reason` | 6, true, true | Mobile clock-in and manual "present" blocked; `RETURN_TO_WORK` override needs certificate + reason; device punches flagged to HR | — | s.34 |
| Record NSSF benefit reference | `maternity.record_nssf_reference` | true | Stored on the life event | — | NSSF arrangement |

### Paternity and compassionate — s.35 (s.34)

| Rule | Key | Default | Evidence / control | Payroll | Reference |
| --- | --- | --- | --- | --- | --- |
| 3 working days, start within 7 days of birth (birth = day 0) | `paternity.entitlement_days`, `paternity.start_window_days_after_birth`, `paternity.count_basis` | 3, 7, `working_days` | Birth life event; leave may continue past day 7 | Full pay | s.35 |
| Optional company benefit (off) | `paternity.company_benefit_enabled`, `paternity.company_benefit_days`, `paternity.company_benefit_start_window_days` | false, 5, 30 | — | — | company benefit |
| 4 working days per annual cycle for listed events | `compassionate.entitlement_days`, `compassionate.cycle_basis`, `compassionate.events` | 4, `annual`, 7 events | Life event of a listed type | Full pay | s.35 |
| Retrospective application within 5 working days of return | `compassionate.retroactive_return_window_working_days` | 5 | — | — | company choice |

### Unpaid leave and unauthorized absence

| Rule | Key | Default | Evidence / control | Payroll | Reference |
| --- | --- | --- | --- | --- | --- |
| Approval required; max 30 working days per 12 months | `unpaid.approval_required`, `unpaid.maximum_days_per_12_months` | true, 30 | — | Unpaid | company choice |
| Blocks over 30 calendar days pause annual accrual for the whole block | `unpaid.pause_annual_accrual`, `unpaid.pause_for_blocks_longer_than_calendar_days`, `unpaid.pause_whole_block` | true, 30, true | — | — | company choice, legal to confirm |
| Unapproved absence unpaid | `unauthorized_absence.pay_rate` | 0 | ABSENT working days not covered by approved leave, a public holiday or an exemption | `UNAUTH_ABSENCE` deduction, once per date | company choice, legal to confirm |
| Flag HR after more than 5 consecutive working days | `unauthorized_absence.flag_after_consecutive_working_days` | 5 | Daily job HR flag; a holiday inside the run does not break it | — | company choice |

### Termination and public-holiday work

| Rule | Key | Default | Evidence / control | Payroll | Reference |
| --- | --- | --- | --- | --- | --- |
| Annual leave only paid out on exit | `termination.annual_payout_enabled` | true | Offboarding creates one "Annual leave settlement (Mainland)" item; other types are not paid | `LEAVE_ENCASHMENT` item in final settlement | s.32, legal to confirm |
| Daily rate = monthly basic / 26 | `termination.monthly_wage_divisor` | 26 | Wage from the compensation version effective on the exit date (non-monthly frequencies converted; hourly/daily need HR input) | Amount on the item | company choice, legal to confirm |
| Payout recorded on the ledger | — | — | When payroll marks the final settlement PAID, a `PAYOUT` row is posted once per settlement item; the leave exit settlement becomes `paid` | — | — |
| Excess leave is a draft recovery, never deducted | `termination.excess_recovery_status` | `draft` | Leave exit settlement `recovery_draft`; Finance approval and legal confirmation required | No automatic deduction | legal to confirm |
| Holiday work paid at 2× basic hourly | `public_holiday_work.pay_multiplier` | 2 | Worked minutes on non-working public holidays (Mainland calendar, branch-aware) | `HOLIDAY_WORK` earning; those minutes are removed from holiday overtime so nothing is paid twice | s.26 (s.24), legal to confirm |
| Hourly = monthly basic / scheduled monthly hours, fallback 195 | `public_holiday_work.fallback_monthly_hours`; payroll overtime policy `configuration.scheduled_monthly_hours` | 195 | If no scheduled hours are configured, 195 is used; if no wage can be resolved, the existing overtime pays as before | — | company choice |

### Holidays — s.26 (s.24)

| Rule | Where | Control |
| --- | --- | --- |
| Rest of 2026 and all of 2027 seeded for Mainland | `config/mainland-holidays.ts`; Operations → "Seed" | Zanzibar-only holidays excluded; reseeding never overwrites or recreates rows HR edited or deleted |
| Lunar dates provisional | `is_provisional` on `attendance_holidays` | Eid al-Fitr, Eid al-Adha and Maulid stay provisional until HR confirms them |
| HR check of holiday dates | Operations → holiday review; `GET /api/leave/mainland/holidays/review`, `POST /api/leave/mainland/holidays/:id/confirm` | Provisional holidays in the next 60 days are marked "Needs check". Confirming records reason and evidence, can move the date, clears the flag, and lists leave requests touching the old or new date for HR to review (they are not recalculated automatically) |

## Cutover (opening balances)

- Built from leave requests (the source of truth), not from the legacy `leave_balances` cache.
- Each row has exceptions HR must resolve with a reason before a second person can approve. The exceptions:
  - missing request dates;
  - prior cycle overdrawn;
  - carry-over already expired;
  - older cycles not reconstructed;
  - `no_legacy_balance_reference`;
  - `legacy_balance_year_does_not_cover_cutover`;
  - `legacy_balance_differs_by_<days>`, for differences over 0.5 days after allowing for pending and future leave;
  - `request_<id>_spans_cutover`.
- Approval seals the rows with SHA-256 and freezes them. Posting is idempotent and refuses rows whose source requests changed. Before posting, a snapshot can be voided; after posting, it is reversed with new rows. History is never edited.
- **Requests that cross the cutover.** Routing is by start date, so such a request stays on legacy rules.
  - Existing requests are flagged `request_<id>_spans_cutover`. HR should cancel and re-book them as two requests, or record why the legacy booking stands.
  - If a spanning request is pending at cutover, its post-cutover days are reserved on the Mainland ledger. That reservation is not released by the legacy approval, so it must be resolved before posting.
  - New submissions that would cross an employee's Mainland start date are rejected with a request to split them.

## Operations runbook

- **Daily job:** 01:15 Africa/Dar_es_Salaam. Each run is recorded in `leave_cycle_job_runs` with status, attempts and errors.
  - A failed run is retried from Operations → "Run / retry today". Reruns are safe because postings are idempotent.
  - Catch-up after downtime happens automatically on the next run.
- **Monitoring:**
  - Alert on any run that isn't `succeeded` by 03:00, or that has errors in `stats.errors`.
  - Check the holiday review weekly for "Needs check".
  - Watch HR flags: unauthorized absence, return-to-work, sick beyond entitlement, maternity term limit.
  - Watch leave exit settlements left in `pending_payroll`, `needs_wage` or `recovery_draft`.
  - Watch for `Mainland payout posting failed` errors in the application log. Recover with the payroll event replay below.
- **Payroll replay:** if the PAID event was lost, re-emit `payroll.final_settlement.paid` for the settlement, or call `LeaveExitSettlementService.onFinalSettlementPaid`. Posting is idempotent per settlement item.
- **Reconciliation:**
  - Report totals come from the ledger.
  - The independent check is the sum of `leave_ledger_entries.amount_days` (dimension `balance`) per employee and family, which equals the reported balance as of a date.
  - CSV exports are available on every report.

## Data migration and rollback

- Migrations `1797900013000` to `1797900018000` are additive (new tables, triggers and columns). Run them on a scratch `_e2e` database first. Never run them against `hrms_db` or UAT without the release process.
- **Disable:** remove or end-date the Mainland assignments. Employees return to the legacy engine for new requests; ledger history stays.
- **Wrong opening balances:** reverse the cutover snapshot (posts reversal rows), fix, rebuild, re-approve and repost.
- **Wrong rule:** approve a corrected revision effective from the right date. Postings made before it stay as they were, and corrections go through `ADJUSTMENT` rows.
- Processed payroll is never changed by any of these steps.

## Known limitations

- Requests crossing the cutover keep legacy rules (flagged and blocked as above; not split automatically).
- Moving a holiday does not recalculate leave already booked; affected requests are listed for HR.
- Holiday-work pay uses the payroll overtime policy's `configuration.scheduled_monthly_hours` when set, otherwise 195. Per-employee schedules are not read.
- Termination payout is recorded when the final settlement is marked PAID. Today that path is the payroll demo payment; a real bank payment integration must emit the same event.
- Hourly or daily paid employees need a monthly wage conversion provided by HR before termination or holiday-work pay can be calculated (reported as `needs_wage`).

## Enablement gates

Enable Mainland rules only when every item is signed:

| Gate | Owner | Evidence |
| --- | --- | --- |
| Policy revision content and rule interpretations above (every "legal to confirm") | HR + legal | Approved revision (four-eyes) with approval reason |
| Lunar holiday dates confirmed or accepted as provisional | HR | Holiday review shows no "Needs check" |
| Cutover reconciliation reviewed; every exception resolved with a reason | HR | Approved snapshot, SHA-256, evidence file |
| Leave pay allocation, unauthorized absence and holiday-work lines reconciled on a parallel payroll run | Finance | Payroll comparison by employee and period |
| Termination payout and recovery-draft handling | Finance + legal | Sample settlements; recovery drafts approved or rejected |
| Migrations, permissions, scheduler and user journeys verified outside production | Engineering | Scratch/UAT run log |

Only after all gates: post the cutover and assign employees with an effective date on or after 2027-01-01.
