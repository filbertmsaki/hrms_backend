# Tanzania Mainland provisional payroll baseline

**Purpose:** provide a starting configuration for sandbox and UAT. This is not company Finance approval or legal advice. The statutory rules created by the payroll seed are `DRAFT`; an authorized Finance approver must check applicability, scope, source references, and independent figures before approving a rule. Do not use these drafts for live payroll until approved.

## Baseline values

Effective date: **1 July 2026** (FY 2026/27). Jurisdiction: **Tanzania Mainland**. Currency: **TZS**. Timezone: **Africa/Dar_es_Salaam**.

| Rule | Provisional value | Scope / handling |
| --- | --- | --- |
| PAYE | Resident monthly bands: 0-270,000: 0%; 270,000-520,000: 8% over 270,000; 520,000-760,000: 20,000 + 20% over 520,000; 760,000-1,000,000: 68,000 + 25% over 760,000; above 1,000,000: 128,000 + 30% over 1,000,000 | Resident employees. Non-resident flat-rate PAYE and special cases are not represented by these progressive bands. |
| NSSF | 20% joint contribution, seeded as 10% employee + 10% employer | Private sector Mainland NSSF participants. NSSF also describes 15% employer/5% employee and employer-paid 20% options; company arrangement may differ. Confirm which salary components constitute the employee contribution wage. |
| SDL | 3.5% employer levy | The calculator applies the 10-employee threshold using company headcount in the period and supports a Finance-approved employer exemption flag. Confirm employer classification and exemptions before approval. |
| WCF | 0.5% employer levy | The calculator uses basic salary plus recurring fixed-amount earnings as the basis. Review component setup to ensure it matches basic pay and regular fixed allowances. |
| Health insurance | No default payroll deduction | No unverified 3% + 3% NHIF contribution is seeded. Configure an applicable company or statutory scheme only after its current legal basis, rate, coverage, and effective date are confirmed. |
| Payroll calendar | Monthly; cutoff day 20; payment day 28 | Operational placeholders, not statutory dates. TZS and Dar es Salaam timezone are defaults. Adjust to company policy before use. |
| Payslip retention | 5 years after employee termination | Application default. Active employees' payslips are retained, then purged five years after the employee's recorded exit date. Set a longer period if tax, litigation, or company policy requires it. |

Sources: [Income Tax Act, Cap. 332 R.E. 2023](https://oagmis.oag.go.tz/portal/acts/revised/436/download); [Ministry of Finance, Medium Term Revenue Strategy 2025/26-2027/28](https://www.mof.go.tz/uploads/documents/en-1779189357-MEDIUM%20TERM%20REVENUE%20STRATEGY%20202526%20-%20202728%20%281%29.pdf); [NSSF contribution guidance](https://www.nssf.go.tz/pages/rate-of-contributions); [WCF official guidance](https://www.wcf.go.tz/); [WCF tariff amendment GN 478F](https://www.wcf.go.tz/uploads/documents/sw-1666602227-sw1658489842-GN%20No.%20478F%20Tariff%20Regulation.pdf); [Employment and Labour Relations Act, section 97](https://oagmis.oag.go.tz/portal/acts/revised/570/download).

## Accounting starting point

Use the HRMS internal payroll ledger defaults for UAT. They are system codes, not company chart-of-accounts numbers:

| Posting | Debit | Credit |
| --- | --- | --- |
| Earnings | `SYS_PAYROLL_EXPENSE` | `SYS_PAYROLL_PAYABLE` |
| Employee deductions | `SYS_PAYROLL_PAYABLE` | `SYS_PAYROLL_LIABILITY_<COMPONENT>` |
| Employer contributions / levies | `SYS_EMPLOYER_PAYROLL_EXPENSE` | `SYS_PAYROLL_LIABILITY_<COMPONENT>` |
| Net pay settlement | `SYS_PAYROLL_PAYABLE` | `SYS_INTERNAL_CASH_CLEARING` |

Do not replace these with invented company account numbers. Add company-specific mappings and dimensions only from the actual chart of accounts.

## UAT example for independent comparison

For one resident employee with monthly basic pay TZS 1,000,000, no other earnings or deductions, NSSF 10%/10%, and all amounts rounded to whole TZS:

- Employee NSSF: 1,000,000 * 10% = **100,000**.
- PAYE base after employee NSSF: 1,000,000 - 100,000 = **900,000**.
- PAYE: 68,000 + (900,000 - 760,000) * 25% = **103,000**.
- Net pay: 1,000,000 - 100,000 - 103,000 = **797,000**.
- Employer NSSF: **100,000**.
- Employer WCF in this basic-only example: 1,000,000 * 0.5% = **5,000**.
- Employer SDL, only if liable and not exempt: 1,000,000 * 3.5% = **35,000**.

With SDL applicable, expected employer cost for this example is **1,140,000**. This is a manually derived smoke-test figure, not Finance sign-off. Independently calculate representative cases, including allowance bases, headcount/exemptions, non-resident employees, proration, overtime, bonuses, and statutory band boundaries.

## Applying it

The payroll seed creates baseline statutory versions as drafts on a fresh install. On an existing company it adds dated draft rule versions, preserves rules approved by a company user, and retires only the old unapproved seed NHIF sample. Run `npm run seed:payroll-baseline` from `backend` with the intended deployment environment configured to apply it. Then inspect **Operations -> Payroll -> Configuration -> Schemes**, review the draft values and evidence, and have a different authorized Finance user approve each applicable version. Verify independent figures before locking or publishing payslips.

Hosted migrations, company chart-of-accounts mappings, and role-based UAT evidence remain deployment/company tasks.
