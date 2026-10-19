# Office attendance policy baseline

This document records the behavior currently implemented for the Office Attendance module. The configured values are company-owned settings; this document does not approve any particular grace period, overtime rate, or holiday pay treatment.

## Current rule behavior

- Schedule resolution prefers a date-specific shift schedule, a published employee roster, a shift or rotation assignment, an employee timetable, then company defaults.
- Late, half-day, and absent thresholds are measured after the configured check-in grace period. The configured thresholds must be ordered from late to half-day to absent.
- Early departure uses the shift end, grace-out minutes, and early-leave threshold.
- Work minutes subtract recorded or scheduled breaks and use the configured rounding mode.
- Normal-day overtime is measured after the scheduled end and the overtime start delay. A shift must allow overtime; configured daily caps, cumulative monthly caps, and approval review are applied.
- Work on holidays and rest days counts as overtime, subject to the configured daily maximum and rounding.
- Holiday attendance mode controls holiday classification, including optional holidays with attendance. Attendance calculation records minutes and status; payroll owns the monetary overtime multiplier configuration. Attendance shift and policy multiplier fields do not alter the calculated daily overtime minutes.
- Remote attendance must be explicitly declared on the punch and is accepted only when the resolved shift permits it. Existing location, Wi-Fi, and checkpoint rules continue to apply. The selected mode is included in the raw punch payload.

## Company decisions still required

HR and Payroll owners must confirm the actual values for grace periods, lateness and absence thresholds, rounding, overtime start delay, daily and monthly caps, approval requirements, holiday treatment, and payroll multipliers. The code defaults and seeded values are not a substitute for that approval.

After a backdated adjustment to an earlier date in a month with a monthly overtime cap, recalculate the employee's remaining attendance dates for that month in date order so later summaries reflect the updated cap balance.

## UAT scenarios

For each active policy and shift family, record the expected and actual outcomes for: just before/at/after grace and lateness thresholds; half-day and absent thresholds; early leave; overnight shifts; break deduction; overtime start, rounding, daily cap, and approval; scheduled and unscheduled rest days; each holiday mode; and remote attendance on shifts that allow and disallow it. Include a correction and recalculation case for overtime and holiday work.
