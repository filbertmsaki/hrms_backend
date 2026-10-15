# Payroll production sign-off and UAT

Use this record to prepare payroll for live use. Do not treat example statutory seed data or environment defaults as Finance approval. The provisional Tanzania Mainland sandbox values and their implementation limits are documented in [payroll-tanzania-provisional-baseline.md](payroll-tanzania-provisional-baseline.md).

## Deployment migration record

The workspace has three migration targets configured locally:

| Profile | Database target | Result |
| --- | --- | --- |
| Development | `localhost:5432/hrms_db` | Pending migrations applied; verified through migration `AddPayrollStatutoryApprovalPermission1793200000000`. |
| Test | `127.0.0.1:5432/hrms_test_db` | Pending migrations applied; verified through migration `AddPayrollStatutoryApprovalPermission1793200000000`. |
| Local production profile | `localhost:5432/hrms_db` | No migrations pending through `AddPayrollStatutoryApprovalPermission1793200000000`. This profile points to the same host/database as local development, so it is not evidence that a separate production server was migrated. |
| UAT deployment | Not configured in this workspace | Pending. `.env.uat.local` has no database settings. Supply the UAT runtime database environment; do not run against the development fallback. |

For each hosted deployment, take the deployment's normal database backup, inject its database connection settings through the deployment secret store, and run the migration command from `backend` with the correct `APP_ENV` (for example `APP_ENV=uat npm run migration:run`). Confirm with `APP_ENV=uat npm run migration:show`; the last payroll migration must be `AddPayrollStatutoryApprovalPermission1793200000000`. Repeat for the production runtime environment. Do not put database passwords in this document or commit them to environment files.

The migration queue included `AddPayrollDocumentTypes1792900000000`, `EmployeeFinanceLoanPhases1To4179300000000`, `SplitInternalAndBankReadyPayrollBatches1793100000000`, and `AddPayrollStatutoryApprovalPermission1793200000000`.

## Finance and payroll owner sign-off

Complete these fields from approved source documents. Attach or reference the evidence in the company's controlled records.

| Decision | Approved value/evidence | Owner | Approval date |
| --- | --- | --- | --- |
| Jurisdiction and statutory schemes (PAYE, pension, WCF, other applicable items) |  |  |  |
| Rates, bands, thresholds, ceilings, calculation methods |  |  |  |
| Effective-from / effective-to dates and source references |  |  |  |
| Currency; default currently shown in sample config is `TZS` |  |  |  |
| Timezone; default currently shown is `Africa/Dar_es_Salaam` |  |  |  |
| Pay frequency, cutoff day, payment day; sample defaults are monthly, 20, and 28 |  |  |  |
| Overtime, leave without pay, bonus, proration, rounding, negative/net-shortfall handling |  |  |  |
| Payslip/document retention; application default is five years after the employee's recorded termination date |  |  |  |

### Enter the approved setup in HRMS

1. Open **Operations → Payroll → Configuration → Calendars**. Edit the intended default calendar with the approved cutoff/payment days, timezone, and currency. Add a reason for changes. Current period generation is monthly; if Finance approves another frequency, stop and extend period generation before using it. Existing periods keep their stored dates.
2. Open **Configuration → Schemes**. Create any missing statutory schemes, then create a draft rule version for each approved rate or band schedule. Enter the effective dates and the official source/evidence reference. The draft rule appears in the **Statutory rule versions** review list.
3. Grant `payroll:statutory:approve` to the approved Finance approver role. Have a different authorized Finance user inspect the source and values, then select **Approve rule**. The system records the approver and time. Rule approval is blocked without a source reference or when the creator tries to approve their own rule.
4. Set `PAYROLL_PAYSLIP_RETENTION_YEARS` in the deployment secret/config store to the approved period, then restart/redeploy the backend. Keep the approval evidence in the controlled company record.

## Internal accounting defaults to review

The payroll journal supports company mappings by payroll component code. A configured company mapping replaces the corresponding internal default. Finance should use the company's chart of accounts and dimensions to decide whether to configure each mapping.

| Component category | Internal debit | Internal credit |
| --- | --- | --- |
| Earnings | `SYS_PAYROLL_EXPENSE` | `SYS_PAYROLL_PAYABLE` |
| Employee deductions | `SYS_PAYROLL_PAYABLE` | `SYS_PAYROLL_LIABILITY_<COMPONENT>` |
| Employer contributions / levies | `SYS_EMPLOYER_PAYROLL_EXPENSE` | `SYS_PAYROLL_LIABILITY_<COMPONENT>` |
| Informational components | `SYS_PAYROLL_INFORMATIONAL` | `SYS_PAYROLL_INFORMATIONAL` |
| Net pay settlement | `SYS_PAYROLL_PAYABLE` | `SYS_INTERNAL_CASH_CLEARING` |

Enter approved debit and credit account codes for each payroll component, plus any branch, department, cost-centre, or payroll-group dimensions. Do not map to guessed account codes. Internal posting to the HRMS payroll ledger remains available without an ERP connection.

In HRMS, open **Operations → Payroll → Configuration → Mappings** and create or update one mapping per component code using Finance-approved debit and credit codes. Review the mapping list, then generate a parallel UAT journal and check its dimensions and balanced totals.

| Component code | Debit account | Credit account | Required dimensions | Finance reviewer/date |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## Cross-role UAT

Use a non-production company and a period with approved configuration. Finance or an independent reviewer should calculate expected values outside the payroll engine from the approved rules and source inputs. Preserve the signed calculation sheet in the controlled UAT record.

| Role | UAT actions | Pass evidence | Result / reviewer / date |
| --- | --- | --- | --- |
| HR | Confirm in-scope employees, active compensation, attendance, leave, overtime, employee deductions, and approved one-off inputs; check employee results and payslip access. | Employee count and input totals reconcile; each tested payslip agrees with its locked result; employee access is scoped correctly. |  |
| Finance | Check statutory rules against approval evidence; independently calculate representative employees and the full payroll total; review component lines, account mappings, balanced journal, internal payment list, and payment-import reconciliation. | Independent figures reconcile within the documented rounding policy; journal debits equal credits; all mapping exceptions are resolved or documented. |  |
| Management | Review the run summary, exceptions, approvals, and audit trail; complete the Management approval as a distinct approver after HR and Finance. | Correct approval order and separation of duties; no unexplained exceptions; approvals bind to the final calculation. |  |

Include representative cases for regular pay, joiner/leaver proration, overtime, leave without pay, statutory band boundaries, deductions, employer contributions, zero/negative or insufficient net pay handling, and corrected/rejected inputs as applicable. Recalculate after any correction and verify prior approvals are invalidated. Do not lock or publish UAT payslips until the expected figures are signed off.

### Independent figure comparison

| Employee reference (avoid names in shared records) | Gross earnings | Employee deductions | Employer contributions | Net pay | Independent expected net | Difference | Explanation / reviewer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
|  |  |  |  |  |  |  |  |

## Optional bank-ready workflow

No bank setup is needed for the internal payment list, internal payment tracking, or internal journal ledger. Only if bank-ready files or direct bank integration are wanted, obtain the bank-approved file specification, encryption/public-key exchange, secure transfer method, and confirmation/statement format. Implement/configure the matching provider adapter and complete a bank sandbox test before live transfer. ERP remains optional.

## Release decision

Release is ready only after the hosted UAT and production database migrations are verified, Finance/legal sign-off is recorded, company account mappings are reviewed, and HR, Finance, and Management have signed the UAT evidence above. Optional bank setup is not a release requirement for internal payroll operations.
