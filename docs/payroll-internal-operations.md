# Internal payroll operations

Payroll can be calculated, approved, paid-tracked, and accounted for inside HRMS without a bank or ERP connection. Provider-specific transfer and posting are optional.

## Payroll run workflow

1. Configure the company calendar, employee compensation, statutory rules, payment instructions, and accounting mappings.
2. Create a payroll run, process it, resolve blockers, and approve it in the configured HR/Finance/Management order.
3. Lock the run. This freezes the approved payroll result used by payslips, payment batches, and journals.
4. Generate payslips and an internal payment list. The internal CSV contains employee number/name, currency, net amount, and a stable payment reference; it does not include bank account numbers. A separate bank-ready batch can be created when the optional bank configuration is available.
5. Record payment results by importing a statement/confirmation file or entering employee, amount, status, date, and reference. Exact matches mark employees paid. Partial, failed, duplicate, and unmatched rows remain visible for follow-up. The run becomes paid only when every payroll result is confirmed.
6. Generate the balanced accounting journal. Explicit company component mappings take priority; absent mappings use `SYS_*` internal payroll accounts and are marked `INTERNAL_DEFAULT` on entries. Finance should replace these with company accounts when maintaining a chart of accounts.
7. Post the journal to HRMS's internal journal ledger. An ERP endpoint, when configured, is an optional external posting step.

## Optional provider workflows

- **Bank-ready file:** Separate from the internal payment list. It requires verified employee bank data, an RSA recipient key, and the bank-approved file format. The current encoder produces an encrypted CSV envelope; a provider-specific layout/transport adapter requires the bank's file specification.
- **ERP posting:** If a secure ERP URL/auth mode is configured, HRMS posts the balanced journal and records the provider response. Without it, the journal can be posted internally in HRMS.

## Audit and controls

Internal batch generation/download, payment imports/reconciliation, journal generation/export/posting, and optional provider calls are company-scoped and audited. Payroll run approval and locking controls are unchanged. Do not share exported payment files outside approved channels.

## Production verification gates

Before live payroll, Finance/payroll owners still need to approve statutory rates/effective dates, retention and account mapping choices; verify the internal expected results; and complete role-based UAT. External bank/ERP credentials are not prerequisites for internal workflows.
