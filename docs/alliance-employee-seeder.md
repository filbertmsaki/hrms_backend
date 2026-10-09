# Alliance employee seeder

This explicit seeder provisions four active employee profiles and login accounts for Alliance Insurance. It is not included in the default `seed:run` chain. It assumes the normal company, role, organization, shift, and timetable seeds and migrations have already run.

## Run

Set `EMPLOYEE_IMPORT_DEFAULT_PASSWORD` in the environment to the initial password, then run:

```powershell
npm run seed:alliance-employees
```

The variable is required and is never printed. Newly created accounts store a hash using the application's password utility, are marked active and verified, and require a password change at first login. Existing accounts keep their password and profile fields; conflicting inactive accounts or employee/account links stop the transaction. The operation sends no emails or notifications.

## Effective role access

| Employee | Role | Effective access |
| --- | --- | --- |
| Emmy Malekela | `HR_MANAGER` | Existing HR Manager role, including employee lifecycle, HR operations, approvals and HR performance administration. Its existing `data_scope:company` mapping is company-wide within Alliance. No company admin role is granted. |
| Jasson Kalemera | `IT_MANAGER` | Mirrors existing `DEPARTMENT_MANAGER` permissions: employee self-service and team approvals, scoped to the Information Technology department. No IT administrator or account/security administration permissions. |
| Bosco Odillo | `EMPLOYEE` | Existing employee self-service permissions, scoped to own records. Reports to Jasson within IT. |
| Janki Sinha | `CLAIMS_MANAGER` | Mirrors existing `DEPARTMENT_MANAGER` permissions: employee self-service and team approvals, scoped to Claims. |

The manager roles include the same module/action/approval permission IDs as `DEPARTMENT_MANAGER`; department access is explicitly assigned to the manager's department and normal data-scope enforcement remains in effect. The HR Manager role intentionally retains its already-defined company scope. New manager roles are company-scoped and created only if absent. If a same-name role already has a different permission set, seeding stops rather than rewriting it.

## Provisioned records

Each employee gets an active user and company membership, role assignment, employee record, primary HQ branch/department/position assignments, and an active assignment to Alliance's `STD-OFFICE` timetable. This timetable satisfies the application's activation readiness check. Device and biometric setup are optional and are not created. Employee numbers are `AIC-EMP-1001` through `AIC-EMP-1004`; sample hire and confirmation date is 2026-01-05.

## Verify

After running, verify in the database or through the application:

1. Each listed email resolves to one `users` row with `status='active'`, `user_type='COMPANY_USER'`, and one active `company_users` membership for `alliance-insurance`.
2. Each has an `employees` row with `employment_status='active'`, expected employee number, primary branch/department/position, and matching `company_user_id`.
3. Each has an active company role assignment: `HR_MANAGER`, `IT_MANAGER`, `EMPLOYEE`, or `CLAIMS_MANAGER` respectively. Bosco's `reports_to` is Jasson's employee ID.
4. Each has an active `employee_timetables` row for the active Alliance `STD-OFFICE` timetable.
5. Compare role-permission IDs in `permission_role` to `DEPARTMENT_MANAGER` for IT_MANAGER and CLAIMS_MANAGER. Compare HR_MANAGER and EMPLOYEE to their existing role mappings. Check effective permissions through the normal authorization endpoint/session, which combines role mappings and inherited permissions.
6. Sign in using each email and the configured initial password. Newly created accounts should be prompted to change it. Confirm self-service screens for all four and department team screens only for Jasson (IT) and Janki (Claims); HR screens for Emmy; own-record screens for Bosco.

Permission assignments grant capabilities; company/department/reporting-line checks continue to constrain which records each capability can reach.
