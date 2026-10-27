const fs = require('node:fs');
const path = require('node:path');

const fixturePath = path.join(__dirname, '..', 'fixtures', 'module11-phase2-synthetic.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const balanceTypes = new Set(['opening', 'accrual', 'consumption', 'adjustment', 'expiry']);
const reservationTypes = new Set(['reservation', 'reservation_release']);

function close(actual, expected, label) {
  if (Math.abs(actual - expected) > 1e-9) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

for (const employee of fixture.employees) {
  const refs = new Set();
  let balance = 0;
  let reserved = 0;

  for (const txn of employee.transactions) {
    if (refs.has(txn.ref)) throw new Error(`Duplicate synthetic transaction ref: ${txn.ref}`);
    refs.add(txn.ref);

    if (balanceTypes.has(txn.type)) balance += txn.days;
    else if (reservationTypes.has(txn.type)) reserved += txn.days;
    else throw new Error(`Unknown transaction type: ${txn.type}`);
  }

  close(balance, employee.expected.ledger_balance_days, `${employee.employee_ref} ledger balance`);
  close(reserved, employee.expected.reserved_days, `${employee.employee_ref} reserved balance`);
  close(balance - reserved, employee.expected.available_days, `${employee.employee_ref} available balance`);
  if (refs.size !== employee.expected.transaction_count) {
    throw new Error(`${employee.employee_ref} transaction count mismatch`);
  }
}

const approved = fixture.requests.filter((r) => r.status === 'approved');
const paidDays = approved
  .filter((r) => r.leave_type_ref === 'SYNTH-TYPE-PAID')
  .reduce((sum, r) => sum + (r.period_allocation['2026-10'] || 0), 0);
const unpaidDays = approved
  .filter((r) => r.leave_type_ref === 'SYNTH-TYPE-UNPAID')
  .reduce((sum, r) => sum + (r.period_allocation['2026-10'] || 0), 0);

close(paidDays, fixture.payroll_expectations.approved_paid_leave_days, 'October paid leave');
close(unpaidDays, fixture.payroll_expectations.approved_unpaid_leave_days, 'October unpaid leave');

console.log('Synthetic fixture structure and expected arithmetic are internally consistent.');
console.log('This does not verify application services, database behavior, payroll integration, or approved policy.');

