# Employee creation and optional onboarding

`POST /api/employees` commits the user/company membership, employee profile,
initial assignments and employee audit in one transaction. Optional onboarding
runs afterward in its own transaction. A failed onboarding operation cannot
turn a committed employee creation into an error response.

| Employee input | Onboarding behavior |
| --- | --- |
| `onboarding` omitted or null | Skip onboarding |
| `onboarding.auto_start: false` | Skip onboarding, regardless of `submit` |
| `onboarding.submit: false` | Save a draft without checking approvers |
| `onboarding: {}` or `onboarding.submit: true` | Check all steps and submit if eligible; otherwise save a draft with a warning |

Flags accept JSON booleans. Both flags default to true when the onboarding
object is present. A valid submission initially has status `submitted`.

Employee creation returns HTTP 201 with the employee's `id`, `employee_no` and
`company_user_id` at the top level, plus:

```json
{
  "onboarding_request": { "id": 55, "status": "draft", "onboarding_no": "ONB-2026-000001" },
  "warning": "Required workflow step at order 1 has no eligible approver. Employee created; onboarding saved as draft.",
  "warning_details": [{
    "id": 11,
    "step_order": 1,
    "name": "HR Document Collection",
    "assigned_role_id": 7,
    "assigned_user_id": null,
    "assigned_department_id": null
  }]
}
```

`onboarding_request` is null if onboarding is skipped or cannot be created.
`warning` is null on success and `warning_details` is an empty array when there
are no failed required steps. Unexpected onboarding failures use a generic
warning. If loading the full employee profile fails after commit, the response
still contains the saved employee identifiers and names.

An eligible approver is an active membership in the same company: first the
explicitly assigned user, then active members of the assigned role if that user
is unavailable, then the assigned department's active employee manager with an
active membership. An explicitly assigned active user does not need an
additional HR role. Every required step is checked before any approval is saved;
all failed required steps appear in `warning_details`.

Retrying the same company user returns HTTP 409 with the existing profile:

```json
{
  "statusCode": 409,
  "message": "This company user already has an employee profile",
  "employee_id": 123,
  "employee": { "id": 123, "employee_no": "000123", "first_name": "Jane", "last_name": "Doe" }
}
```

`POST /api/onboarding/requests` requires `employee_id`. Its `submit` flag defaults
to true. `submit: false` bypasses approver checks; missing required approvers on
submission return HTTP 201 with the draft request, `warning` and
`warning_details`. Other creation errors roll back the request transaction.
An active-request conflict returns HTTP 409 with `onboarding_request_id` and an
`onboarding_request` summary containing `id`, `employee_id`, `onboarding_no` and
`status`.

Regression coverage is in `employee-create.integration.spec.ts` (real HTTP
controllers and validation with in-memory persistence) and
`onboarding-workflow.service.spec.ts` (approver eligibility and preflight).
