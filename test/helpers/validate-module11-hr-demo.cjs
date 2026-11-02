const fs = require('node:fs');
const path = require('node:path');

const fixturePath = path.join(__dirname, '..', 'fixtures', 'module11-hr-demo-scenarios.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
};

if (fixture.classification !== 'SYNTHETIC_TEST_DATA_NOT_COMPANY_POLICY') {
  fail('fixture must remain clearly classified as synthetic test data');
}

const employees = new Set(fixture.synthetic_employees.map((employee) => employee.ref));
for (const scenario of fixture.scenarios) {
  if (!employees.has(scenario.employee_ref)) fail(`${scenario.ref} has unknown employee_ref`);
}

const compOff = fixture.scenarios.find((scenario) => scenario.ref === 'DEMO-COMP-OFF-001');
const expectedCredit = compOff.source.approved_minutes / fixture.policy_assumptions_for_demo_only.compensatory_off.conversion_minutes_per_day;
if (expectedCredit !== compOff.expected_credit_days) fail('comp-off conversion does not match expected credit');
if (compOff.source.overtime_payment_status !== 'NOT_PAID') fail('comp-off source cannot also be marked overtime-paid');
if (compOff.redemption.days > compOff.expected_credit_days) fail('comp-off redemption exceeds the synthetic credit');

const encashment = fixture.scenarios.find((scenario) => scenario.ref === 'DEMO-ENCASH-001');
const payable = encashment.approved_days * encashment.daily_rate_tzs;
if (payable !== encashment.expected_payable_amount_tzs) fail('encashment amount does not reconcile');
if (encashment.requested_days > fixture.policy_assumptions_for_demo_only.encashment.maximum_days) fail('encashment exceeds demo policy maximum');
if (encashment.available_days_before_request - encashment.requested_days < fixture.policy_assumptions_for_demo_only.encashment.minimum_retained_balance_days) fail('encashment breaches demo retained-balance requirement');

const crossYear = fixture.scenarios.find((scenario) => scenario.ref === 'DEMO-CROSS-YEAR-001');
const actualByYear = Object.fromEntries(Object.entries(Object.groupBy(crossYear.included_dates, (date) => date.slice(0, 4))).map(([year, dates]) => [year, dates.length]));
if (JSON.stringify(actualByYear) !== JSON.stringify(crossYear.expected_usage_by_year)) fail('cross-year balance allocation does not reconcile');
const payrollTotal = crossYear.payroll_periods.reduce((sum, period) => sum + period.days, 0);
if (payrollTotal !== crossYear.included_dates.length) fail('cross-period payroll totals do not reconcile');

if (process.exitCode) process.exit(process.exitCode);
console.log(`PASS: ${fixture.scenarios.length} synthetic HR scenarios reconcile; no database accessed.`);
