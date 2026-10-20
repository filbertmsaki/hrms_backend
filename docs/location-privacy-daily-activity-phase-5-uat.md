# Location Privacy and Daily Work Activity: Phase 5 UAT

Phase 5 is the controlled acceptance gate for these two HRMS modules. It uses an isolated UAT company and synthetic activity content. UAT completion does not approve company privacy or activity policy, and does not authorize production deployment.

## 1. Prepare the isolated UAT environment

1. Provision a dedicated UAT database and set `APP_ENV=uat`.
2. Add the connection values to `backend/.env.uat.local` or the approved secret store. The database name must contain `uat` and must not contain `prod`.
3. Confirm a UAT company, active employee account, assigned manager account, and department are present. Do not use production employee IDs or credentials.
4. Have HR and Privacy/Data Protection record the company policy decisions in [location-privacy-and-daily-activity-policy-approval.md](./location-privacy-and-daily-activity-policy-approval.md). Select UAT-specific values and ensure any policy with department-head escalation enabled has an active department manager with a linked HRMS account.
5. Run migrations against the verified UAT database only:

```powershell
cd backend
$env:APP_ENV = 'uat'
npm run migration:run
```

## 2. Load synthetic Daily Activity data

Choose an active UAT employee with a department, linked account, assigned manager, and manager account. The fixture is idempotent and tags every generated record with `HRMS_DAILY_ACTIVITY_UAT_DEMO_V1`. It creates a demo category, a narrowly scoped high-priority demo policy, one draft report, one completed activity entry, a field-visit location event at the synthetic coordinate `0,0` (Null Island), and a versioned `DEMO_APPROVED` location notice when the company has no active notice. This coordinate is deliberately not an employee location; do not use it as proof of GPS accuracy. The notice is sample UAT content, not company or legal approval. The fixture does not create users or assign roles or employee acknowledgements; the employee records acknowledgement through the web or native screen during acceptance.

```powershell
$env:APP_ENV = 'uat'
$env:DAILY_ACTIVITY_DEMO_CONFIRM = 'YES'
$env:DAILY_ACTIVITY_DEMO_COMPANY_ID = '<uat-company-id>'
$env:DAILY_ACTIVITY_DEMO_EMPLOYEE_ID = '<uat-employee-id>'
# Optional; defaults to today's UTC date. Choose an unused date for this employee.
$env:DAILY_ACTIVITY_DEMO_DATE = 'YYYY-MM-DD'
npm run seed:daily-activity-uat-demo
```

The command refuses to run unless the environment is UAT, the database name contains `uat`, and `DAILY_ACTIVITY_DEMO_CONFIRM=YES`. If an employee already has a non-demo report on the selected date, it fails without changing that report; select another date.

## 3. Employee-to-manager acceptance

Use separate employee, assigned-manager, HR, and unauthorized test accounts:

1. Employee opens **Activities → My Activities**, selects the seeded date, confirms the completed synthetic activity, adds a summary, and submits the draft.
2. Confirm the report enters manager review, preserves its activity date and snapshot, and creates a manager action item.
3. Manager opens **Activities → Reviews**, returns the report with a correction comment. Confirm the employee can edit and resubmit and the report history records the return.
4. Manager approves the resubmitted report. Confirm the final status, manager identity, timestamp, audit history, and closed review action.
5. Confirm an employee cannot view or edit another employee's report, an unrelated manager cannot review it, and an unauthorized user cannot read or configure activity policies.
6. Confirm HR reports show the same category, activity date, completion state, submission-late state, and final manager decision as the report detail.

## 4. Reminder and escalation acceptance

The demo policy has a one-hour manager review target and department-head escalation disabled by default. In UAT only, an authorized policy owner may enable escalation after policy sign-off, with a test delay and a department manager account configured.

- Submit a report and leave it pending beyond the manager target. Confirm the manager receives one review action even after repeated scheduler runs.
- With escalation enabled, leave a separate report pending beyond the configured escalation delay. Confirm one action is assigned to the active primary department manager. If the manager is missing, inactive, or has no account, confirm no action is routed to an unrelated user and record the setup defect.
- Approve or reject the report and confirm open review and escalation actions close.
- Test a submission immediately before and after the configured cutoff in the approved IANA timezone. Confirm the late flag and delay minutes match the cutoff, including a date boundary.

## 5. Location privacy acceptance

The demo location fixture uses only the synthetic coordinate `0,0`, so map and permissioned location-read auditing can be reviewed without storing a real person's location. For device-level GPS accuracy acceptance, also use the approved UAT attendance or field-visit mobile flow with a UAT test device; do not enter a home address or use a production record.

1. Employee opens **Employees → Location privacy notice**, reads the versioned demo notice, and acknowledges it. Confirm an acknowledgement record is stored for the employee and exact notice version. Verify the live location screen is gated until acknowledgement; attendance and field-visit GPS capture reject submissions until acknowledgement.
2. As an authorized manager, open the attendance location report or field-visit map. Confirm precise location appears only to the approved permission set.
3. Confirm each authorized location read creates an access audit entry with actor, company, record, timestamp, and request context.
4. As an unauthorized user, attempt the same read and verify access is denied and precise coordinates are not returned.
5. Verify location retention is disabled until the approved retention period and purge process are configured. Test legal holds and the two-person purge approval using synthetic UAT records only.
6. Record the map tile provider, employee notice, permission result, audit evidence, retention settings, and review owner in the approval record.

## 6. Exit criteria and evidence

Attach the migration result, seed output, report and review IDs, role/account matrix, reminder/escalation action IDs, location access audit evidence, denied-access result, report-to-dashboard reconciliation, exceptions, and remediation owner. HR and Privacy/Data Protection must sign the company approval record. Phase 5 is complete only after the UAT owner confirms every applicable acceptance step and records any policy-dependent exclusion. Production secrets, production deployment, live employee verification, and the first live cycle remain separate release activities.

After Phase 5 is signed, follow [Phase 6 go-live and hypercare](./location-privacy-daily-activity-phase-6-go-live-hypercare.md).
