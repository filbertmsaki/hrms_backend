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

## Location, device, and selfie controls

The attendance policy now exposes company-configurable controls for allowing location exceptions to enter manager review, requiring a private selfie at check-in and/or check-out, and blocking a registered mobile device already used by another employee. These controls default off so rollout does not silently change existing employee behavior. When location exception review is enabled, GPS/Wi-Fi failures are stored as pending overrides only when the employee submits a reason; otherwise the punch is rejected. Authorized reviewers can load a punch's private selfie. Attendance maps make no third-party tile requests by default; when the organization configures an approved tile URL and attribution, the provider receives ordinary tile requests for the displayed map area.

Before enabling these controls, the company privacy/HR owner must record: notice and lawful purpose for GPS capture; allowed GPS accuracy and retention; whether check-in/check-out selfies are required and the selfie retention period; which GPS/Wi-Fi failures can be overridden; device replacement/revocation ownership; who can view location and selfie evidence; and how an employee may request correction or removal. The code does not call a third-party reverse-geocoding service, so coordinates are not sent to one. Do not configure an external geocoding provider without a separate privacy review.

| Company setting | Code default | Required owner decision |
| --- | --- | --- |
| `allow_location_exception_override` | `false` | Whether GPS/Wi-Fi failures may enter manager review |
| `require_selfie_for_check_in` | `false` | Whether check-in evidence requires a selfie |
| `require_selfie_for_check_out` | `false` | Whether check-out evidence requires a selfie |
| `prevent_mobile_device_sharing` | `false` | Whether device identifiers are exclusive to one employee; Android ID and iOS vendor ID are OS-scoped identifiers, not hardware attestation |
| Selfie retention | `ATTENDANCE_SELFIE_RETENTION_DAYS=0`, purge off | Approved period and deletion/hold process |
| GPS/address retention | Not configured | Approved period and deletion/hold process |
| Offline punch submissions | `allow_offline_punches=false`, maximum age defaults to 24 hours (range 1–72) | Whether delayed mobile punches are allowed and their maximum age |

The policy fields, device enrollment/release workflow, and enforcement are implemented. The app uses Android ID or iOS vendor ID where available, falling back to a random app-scoped ID; neither identifier proves device integrity. Raw-log, selfie, attendance-location and field-visit-location retention support per-record legal holds and a one-time purge/anonymization approval that must be granted by a different operator. Location retention defaults to disabled and requires both the deployment retention setting and a matching company approval. Offline punch queuing is available in the Android/iOS app when the company policy enables it: queued records use a SQLCipher database with its key in secure storage, preserve their idempotency ID, and submit sequentially for manager review. QR checkpoint punches remain online-only. A native app rebuild is required to include the SQLCipher configuration. The server limits offline age to the company policy and holds these punches for review; device clock integrity cannot be proven for offline captures.

These controls provide a way to enforce and record operational decisions, but they do not constitute company approval. HR, Privacy, Security, IT, and Payroll owners must still approve the policy values and retain the sign-off evidence before enabling settings or purge.

## Approval record

Complete this table in the company change record before enabling policy settings or retention purge. Store the linked approval evidence in the approved records system; do not treat a blank row or a code default as approval.

| Decision area | Approving owner | Decision / approved values | Evidence reference | Date |
| --- | --- | --- | --- | --- |
| Attendance schedules, grace, lateness, overtime, holiday and payroll rules | HR + Payroll | ____________________ | ____________________ | ____________________ |
| GPS purpose, accuracy, retention, map tiles and employee notice | Privacy / HR | ____________________ | ____________________ | ____________________ |
| Selfie requirement, access and retention | Privacy / HR | ____________________ | ____________________ | ____________________ |
| Location exception review and remote attendance rules | HR / Security | ____________________ | ____________________ | ____________________ |
| Device enrollment, sharing and replacement | IT / Security | ____________________ | ____________________ | ____________________ |
| Offline punch maximum age and manager review | HR / IT | ____________________ | ____________________ | ____________________ |
| Legal hold authority and retention purge approval | Legal / Records owner | ____________________ | ____________________ | ____________________ |

## UAT scenarios

For each active policy and shift family, record the expected and actual outcomes for: just before/at/after grace and lateness thresholds; half-day and absent thresholds; early leave; overnight shifts; break deduction; overtime start, rounding, daily cap, and approval; scheduled and unscheduled rest days; each holiday mode; and remote attendance on shifts that allow and disallow it. Include a correction and recalculation case for overtime and holiday work.
