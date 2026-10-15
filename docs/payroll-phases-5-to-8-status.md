# Payroll and payslips: phases 5–8 implementation status

This status records the code delivered for employee payslips, integrations, mobile access, and rollout verification. Production enablement still depends on company inputs and UAT.

## Phase 5 — Payslip delivery and lifecycle

- Payslip generation can be disabled with `PAYROLL_PAYSLIP_PUBLICATION_ENABLED` until the feature is ready.
- Generated PDFs are saved as private HR documents, linked to the payslip record, and downloaded through the authenticated employee endpoint.
- Employee list and detail responses include normalized period, employee, currency, earnings, deductions, tax, and net-pay fields expected by the web UI.
- The PDF separates earnings, deductions, and employer contributions and includes employee identity and pay period details.
- YTD summaries only count locked or paid payroll results.
- A retention job expires hidden payslip records and purges linked document files with an audit record. `PAYROLL_PAYSLIP_RETENTION_YEARS` controls retention.
- Payslip notification queue errors are recorded without blocking payroll generation.

## Phase 6 — Bank, accounting, and ERP workflows

- Existing bank batch creation, encrypted output, import/reconciliation, journal export, and ERP posting workflows remain available.
- Bank generation now refuses the generic placeholder format and requires a bank-approved `PAYROLL_BANK_FORMAT_CODE` plus a valid RSA recipient key. The current payload encoder still emits the generic encrypted CSV envelope; matching a bank-specific layout requires that bank's specification and a corresponding adapter.
- ERP is optional: journals can be posted and queried in HRMS's internal payroll journal ledger without an ERP endpoint. Provider URL/auth settings are validated if configured; explicit dry runs return a preview without marking a journal posted.

## Phase 7 — Mobile parity

- Android payroll now shows the employee's year-to-date summary and payslip list/details, and downloads/shares PDF copies using authenticated requests.
- Existing backend notification/report delivery paths remain in place; delivery provider credentials and templates must be configured in the deployment.

## Phase 8 — Verification and rollout

- Optional PDF password encryption is implemented using PDFKit. Set `PAYROLL_PAYSLIP_PASSWORD_PROTECTED=true` and configure `PAYROLL_PAYSLIP_PDF_PASSWORD` (8+ characters), or ensure employee numbers have at least 8 characters. Deliver any shared password through a separate secure channel.
- Deployment readiness reports bank format, ERP, statutory/retention sign-off, and cross-role UAT gates. Bank and ERP are optional; readiness stays false for pending Finance/legal sign-off or UAT.
- The database-backed payroll run E2E covers the generation flow, payslip fields, and stored-document association.
- TypeScript checks and the targeted payroll E2E are part of the verification performed for these changes.
- Run the migration in each deployment before enabling payslip publication. Complete cross-role UAT against independently reviewed payroll figures and verify retention/legal requirements before production rollout. Bank and ERP test transactions apply only if those optional integrations are enabled.

## Remaining implementation or sign-off

- Configure bank-specific file layout and secure delivery only if bank-ready files or direct transfers are required; configure an ERP endpoint only if external posting is required.
- Authorized Finance/payroll owners must approve statutory rates, effective dates, and the retention period.
- Run complete HR/Finance/Management UAT with real company calendar defaults and independently computed expected results.
- The bank output still needs a bank-specific adapter matching the actual approved file layout; setting a non-placeholder format code alone does not transform the generic CSV envelope.
