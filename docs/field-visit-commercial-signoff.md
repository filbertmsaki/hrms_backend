# Field visit commercial fields: sales sign-off

The module stores employee-reported potential sales value and optional premium value separately. Amounts are non-negative decimal values with independent three-letter currency codes. These values are operational visit data; they do not create a quote, policy, commission, or accounting entry.

Before a production rollout, Sales and Finance should confirm:

| Decision | Current behavior | Sign-off needed |
| --- | --- | --- |
| Meaning of potential value | Expected sales opportunity value | Confirm sales definition and reporting use |
| Meaning of premium value | Optional separate premium amount | Confirm whether premium applies to all opportunity types and allowed currencies |
| Actual value | Existing field, manager or integration owned | Confirm who records realized value and when |
| Opportunity statuses | Existing lifecycle enum | Confirm valid stage transitions and ownership |
| Currency | ISO-style three-character text; not validated against a company currency list | Confirm supported currencies and whether conversion/reporting is needed |
| Source system/reference | Optional trace fields | Confirm CRM integration and duplicate handling |

Real Postgres e2e test instructions: run `npm run test:e2e -- --runInBand --runTestsByPath test/field-visit-commercial.e2e-spec.ts` against the isolated `hrms_test_db` database after migrations. Never point this test at production or shared UAT data.
