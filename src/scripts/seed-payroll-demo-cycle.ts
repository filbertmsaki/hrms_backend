import { createHash, randomInt } from 'node:crypto';
import { AppDataSource } from '../database/data-source';

type Row = Record<string, unknown>;
type DemoEmployee = {
  id: number;
  employee_no: string;
  first_name: string;
  last_name: string;
  payroll_number: string;
  base_salary: string;
  housing_amount: string;
};
type DemoInput = {
  component_code: string;
  source_reference: string;
  amount: string;
};
type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
};

const COMPANY_SLUG = 'hrms-payroll-demo';
const PERIOD_CODE = 'PAYDEMO-2026-10';
const RUN_NO = 'PAYDEMO-2026-10-SIM-01';
const SIMULATION_MARKER = {
  demo: true,
  demo_module: 'payroll',
  synthetic: true,
  statutory_values: 'random training estimates; not legally approved',
  external_payments: false,
  external_journal_posting: false,
};

async function rows<T extends Row>(
  query: Queryable,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await query.query(sql, params)) as T[];
}

function amount(value: number) {
  return Math.round(value * 100) / 100;
}

function money(value: number) {
  return value.toFixed(2);
}

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function run() {
  if (process.env.PAYROLL_DEMO_CYCLE_CONFIRM !== 'YES') {
    throw new Error(
      'Set PAYROLL_DEMO_CYCLE_CONFIRM=YES to create a synthetic demo-only payroll cycle.',
    );
  }
  console.log('[PayrollDemoCycle] Connecting to configured database.');
  await AppDataSource.initialize();
  console.log('[PayrollDemoCycle] Opening isolated demo transaction.');
  const runner = AppDataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    console.log('[PayrollDemoCycle] Validating demo tenant and period.');
    const [company] = await rows<{
      id: number;
      metadata: Record<string, unknown> | null;
    }>(
      runner,
      'SELECT id, metadata FROM companies WHERE slug = $1 FOR UPDATE',
      [COMPANY_SLUG],
    );
    if (
      !company ||
      company.metadata?.demo !== true ||
      company.metadata?.demo_module !== 'payroll' ||
      company.metadata?.resettable !== true
    ) {
      throw new Error(
        'Refusing to seed: isolated payroll demo tenant is missing.',
      );
    }
    const [existingRun] = await rows<{ id: number }>(
      runner,
      `SELECT id FROM payroll_runs WHERE company_id = $1 AND run_no = $2`,
      [company.id, RUN_NO],
    );
    if (existingRun) {
      throw new Error(
        `Synthetic demo run ${RUN_NO} already exists. Reset the isolated demo tenant before creating another randomized cycle.`,
      );
    }
    const [period] = await rows<{
      id: number;
      start_date: string;
      end_date: string;
    }>(
      runner,
      `SELECT id, start_date, end_date FROM payroll_periods
        WHERE company_id = $1 AND period_code = $2 FOR UPDATE`,
      [company.id, PERIOD_CODE],
    );
    if (!period) throw new Error(`Demo period ${PERIOD_CODE} is missing.`);
    const [admin] = await rows<{ company_user_id: number }>(
      runner,
      `SELECT membership.id AS company_user_id
         FROM company_users membership
         JOIN users account ON account.id = membership.user_id
        WHERE membership.company_id = $1
          AND membership.status = 'active'
          AND account.email = 'payroll.admin@demo.invalid'`,
      [company.id],
    );
    if (!admin) throw new Error('Payroll demo admin membership is missing.');

    const employees = await rows<DemoEmployee>(
      runner,
      `SELECT employee.id, employee.employee_no, employee.first_name,
              employee.last_name, profile.payroll_number,
              compensation.base_salary::text AS base_salary,
              COALESCE(compensation.component_overrides->'DEMO_HOUSING'->>'amount','0') AS housing_amount
         FROM employees employee
         JOIN employee_payroll_profiles profile
           ON profile.company_id = employee.company_id
          AND profile.employee_id = employee.id
          AND profile.payroll_enabled = true
         JOIN LATERAL (
           SELECT version.base_salary, version.component_overrides
             FROM employee_compensation_versions version
            WHERE version.company_id = employee.company_id
              AND version.employee_id = employee.id
            ORDER BY version.effective_from DESC, version.version DESC
            LIMIT 1
         ) compensation ON true
        WHERE employee.company_id = $1
          AND employee.metadata->>'demo_module' = 'payroll'
        ORDER BY employee.employee_no`,
      [company.id],
    );
    if (employees.length !== 6) {
      throw new Error(
        `Expected 6 payroll demo employees; found ${employees.length}.`,
      );
    }

    const inputsByEmployee = new Map<number, DemoInput[]>();
    const inputRows = await rows<DemoInput & { employee_id: number }>(
      runner,
      `SELECT employee_id, component_code, source_reference, amount::text
         FROM payroll_inputs
        WHERE company_id = $1 AND payroll_period_id = $2
          AND source_module = 'PAYROLL_DEMO' AND status = 'APPROVED'`,
      [company.id, period.id],
    );
    for (const input of inputRows) {
      const group = inputsByEmployee.get(input.employee_id) ?? [];
      group.push(input);
      inputsByEmployee.set(input.employee_id, group);
    }
    if (inputRows.length !== 3) {
      throw new Error(
        `Expected 3 approved demo inputs; found ${inputRows.length}.`,
      );
    }

    const calculated = employees.map((employee) => {
      const inputs = inputsByEmployee.get(employee.id) ?? [];
      const byCode = new Map(
        inputs.map((input) => [input.component_code, input]),
      );
      const basic = Number(employee.base_salary);
      const housing = Number(employee.housing_amount);
      const bonus = Number(byCode.get('DEMO_BONUS')?.amount ?? 0);
      const deduction = Number(byCode.get('DEMO_DEDUCTION')?.amount ?? 0);
      const reimbursement = Number(
        byCode.get('DEMO_REIMBURSEMENT')?.amount ?? 0,
      );
      const gross = amount(basic + housing + bonus);
      const pensionRate = randomInt(5, 11) / 100;
      const taxRate = randomInt(4, 12) / 100;
      const employeePension = amount(gross * pensionRate);
      const trainingTax = amount(gross * taxRate);
      const employeeDeductions = amount(
        employeePension + trainingTax + deduction,
      );
      const employerContribution = amount(gross * 0.1);
      const net = amount(gross - employeeDeductions + reimbursement);
      const employerCost = amount(gross + reimbursement + employerContribution);
      return {
        employee,
        inputs,
        basic,
        housing,
        bonus,
        deduction,
        reimbursement,
        gross,
        taxable: gross,
        employeePension,
        trainingTax,
        employeeDeductions,
        employerContribution,
        net,
        employerCost,
        pensionRate,
        taxRate,
      };
    });
    console.log(
      '[PayrollDemoCycle] Building randomized synthetic payroll results.',
    );
    const total = (field: keyof (typeof calculated)[number]) =>
      amount(
        calculated.reduce((sum, item) => sum + Number(item[field] ?? 0), 0),
      );
    const totals = {
      gross: total('gross'),
      taxable: total('taxable'),
      deductions: total('employeeDeductions'),
      employerContributions: total('employerContribution'),
      net: total('net'),
      employerCost: total('employerCost'),
    };
    const configurationSnapshot = {
      ...SIMULATION_MARKER,
      simulation_id: `SIM-${randomInt(100000, 999999)}`,
      formula: 'random training pension/tax estimates applied to gross pay',
      rates: 'randomized per employee; not statutory rules',
      approval: 'simulated workflow state; no human approval asserted',
    };
    const runSnapshot = {
      inputs: inputRows,
      employee_count: employees.length,
      simulated_at: new Date().toISOString(),
    };
    const runHash = digest({ configurationSnapshot, runSnapshot, totals });
    const [payrollRun] = await rows<{ id: number }>(
      runner,
      `INSERT INTO payroll_runs (
         company_id, payroll_period_id, run_no, run_type, status,
         calculation_version, employee_count, gross_total, taxable_total,
         deduction_total, employer_contribution_total, net_pay_total,
         total_employer_cost, input_snapshot, configuration_snapshot,
         calculation_hash, started_at, calculated_at, approved_at, locked_at,
         created_by_company_user_id, version, created_at, updated_at
       ) VALUES (
         $1::int,$2::int,$3::varchar,'REGULAR','PAID',1,$4::int,
         $5::numeric,$6::numeric,$7::numeric,$8::numeric,$9::numeric,
         $10::numeric,$11::jsonb,$12::jsonb,$13::varchar,
         now(),now(),now(),now(),$14::int,1,now(),now()
       ) RETURNING id`,
      [
        company.id,
        period.id,
        RUN_NO,
        employees.length,
        money(totals.gross),
        money(totals.taxable),
        money(totals.deductions),
        money(totals.employerContributions),
        money(totals.net),
        money(totals.employerCost),
        JSON.stringify(runSnapshot),
        JSON.stringify(configurationSnapshot),
        runHash,
        admin.company_user_id,
      ],
    );

    const bankFile = ['employee_no,amount,currency'];
    for (const item of calculated) {
      const employeeSnapshot = {
        employee_no: item.employee.employee_no,
        first_name: item.employee.first_name,
        last_name: item.employee.last_name,
      };
      const compensationSnapshot = {
        base_salary: money(item.basic),
        housing: money(item.housing),
        currency: 'TZS',
      };
      const resultSnapshot = {
        ...SIMULATION_MARKER,
        random_demo_rates: {
          employee_pension: item.pensionRate,
          training_tax: item.taxRate,
        },
        amounts: {
          basic: money(item.basic),
          housing: money(item.housing),
          bonus: money(item.bonus),
          deduction: money(item.deduction),
          reimbursement: money(item.reimbursement),
        },
      };
      const resultHash = digest({
        employeeSnapshot,
        compensationSnapshot,
        resultSnapshot,
      });
      const [result] = await rows<{ id: number }>(
        runner,
        `INSERT INTO employee_payroll_results (
           company_id, payroll_run_id, payroll_period_id, employee_id, status,
           employee_snapshot, compensation_snapshot, statutory_snapshot,
           input_snapshot, calculation_snapshot, gross_pay, taxable_pay,
           employee_deductions, employer_contributions, net_pay, employer_cost,
           calculation_hash, warnings, errors, created_at
         ) VALUES (
           $1::int,$2::int,$3::int,$4::int,'PAID',$5::jsonb,$6::jsonb,
           $7::jsonb,$8::jsonb,$9::jsonb,$10::numeric,$11::numeric,
           $12::numeric,$13::numeric,$14::numeric,$15::numeric,$16::varchar,
           '[]'::jsonb,'[]'::jsonb,now()
         ) RETURNING id`,
        [
          company.id,
          payrollRun.id,
          period.id,
          item.employee.id,
          JSON.stringify(employeeSnapshot),
          JSON.stringify(compensationSnapshot),
          JSON.stringify({
            ...SIMULATION_MARKER,
            employee_pension: money(item.employeePension),
            training_tax: money(item.trainingTax),
          }),
          JSON.stringify(item.inputs),
          JSON.stringify(resultSnapshot),
          money(item.gross),
          money(item.taxable),
          money(item.employeeDeductions),
          money(item.employerContribution),
          money(item.net),
          money(item.employerCost),
          resultHash,
        ],
      );
      const lineItems = [
        [
          'DEMO_BASIC',
          'Demo basic salary',
          'EARNING',
          item.basic,
          10,
          'COMPENSATION',
          null,
        ],
        [
          'DEMO_HOUSING',
          'Demo housing allowance',
          'EARNING',
          item.housing,
          20,
          'COMPENSATION',
          null,
        ],
        [
          'DEMO_BONUS',
          'Demo one-time bonus',
          'EARNING',
          item.bonus,
          30,
          'PAYROLL_DEMO',
          item.inputs.find((input) => input.component_code === 'DEMO_BONUS')
            ?.source_reference ?? null,
        ],
        [
          'DEMO_DEDUCTION',
          'Demo authorized deduction',
          'DEDUCTION',
          item.deduction,
          40,
          'PAYROLL_DEMO',
          item.inputs.find((input) => input.component_code === 'DEMO_DEDUCTION')
            ?.source_reference ?? null,
        ],
        [
          'DEMO_REIMBURSEMENT',
          'Demo expense reimbursement',
          'REIMBURSEMENT',
          item.reimbursement,
          50,
          'PAYROLL_DEMO',
          item.inputs.find(
            (input) => input.component_code === 'DEMO_REIMBURSEMENT',
          )?.source_reference ?? null,
        ],
      ] as const;
      for (const [
        code,
        name,
        type,
        value,
        order,
        sourceType,
        sourceReference,
      ] of lineItems) {
        if (value === 0) continue;
        await runner.query(
          `INSERT INTO employee_payroll_line_items (
             company_id,payroll_run_id,employee_payroll_result_id,employee_id,
             component_code,component_name,component_type,amount,taxable_amount,
             employer_amount,calculation_order,source_type,source_reference,
             calculation_snapshot
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12,$13::jsonb)`,
          [
            company.id,
            payrollRun.id,
            result.id,
            item.employee.id,
            code,
            name,
            type,
            money(value),
            type === 'EARNING' ? money(value) : '0.00',
            order,
            sourceType,
            sourceReference,
            JSON.stringify(SIMULATION_MARKER),
          ],
        );
      }
      await runner.query(
        `INSERT INTO payslips (
           company_id,employee_id,payroll_run_id,employee_payroll_result_id,
           payslip_no,snapshot,result_hash,status,published_at,created_at
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'PUBLISHED',now(),now())`,
        [
          company.id,
          item.employee.id,
          payrollRun.id,
          result.id,
          `${RUN_NO}-${item.employee.employee_no}`,
          JSON.stringify({ ...resultSnapshot, result: item, currency: 'TZS' }),
          resultHash,
        ],
      );
      bankFile.push(`${item.employee.employee_no},${money(item.net)},TZS`);
    }

    const reconciliationAmount = amount(
      totals.gross + total('reimbursement') + totals.employerContributions,
    );
    const journalEntries = [
      {
        account: 'DEMO_PAYROLL_EXPENSE',
        debit: money(totals.gross),
        credit: '0.00',
      },
      {
        account: 'DEMO_REIMBURSEMENT_EXPENSE',
        debit: money(total('reimbursement')),
        credit: '0.00',
      },
      {
        account: 'DEMO_EMPLOYER_CONTRIBUTION_EXPENSE',
        debit: money(totals.employerContributions),
        credit: '0.00',
      },
      { account: 'DEMO_NET_PAYABLE', debit: '0.00', credit: money(totals.net) },
      {
        account: 'DEMO_EMPLOYEE_DEDUCTIONS_PAYABLE',
        debit: '0.00',
        credit: money(totals.deductions),
      },
      {
        account: 'DEMO_EMPLOYER_CONTRIBUTIONS_PAYABLE',
        debit: '0.00',
        credit: money(totals.employerContributions),
      },
    ];
    const journalDebit = amount(
      journalEntries.reduce((sum, line) => sum + Number(line.debit), 0),
    );
    const journalCredit = amount(
      journalEntries.reduce((sum, line) => sum + Number(line.credit), 0),
    );
    if (
      journalDebit !== journalCredit ||
      journalDebit !== reconciliationAmount
    ) {
      throw new Error('Synthetic journal failed its internal balance check.');
    }
    const fileContent = bankFile.join('\n');
    await runner.query(
      `INSERT INTO payroll_bank_batches (
         company_id,payroll_run_id,batch_no,bank_format_code,record_count,
         total_amount,snapshot,file_content,file_hash,status,created_at
       ) VALUES ($1,$2,$3,'DEMO_CSV',$4,$5,$6::jsonb,$7,$8,'GENERATED',now())`,
      [
        company.id,
        payrollRun.id,
        `${RUN_NO}-BANK`,
        employees.length,
        money(totals.net),
        JSON.stringify({
          ...SIMULATION_MARKER,
          payment_status: 'simulated only',
        }),
        fileContent,
        digest(fileContent),
      ],
    );
    await runner.query(
      `INSERT INTO payroll_journal_batches (
         company_id,payroll_run_id,batch_no,debit_total,credit_total,
         entries,external_reference,status,created_at
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'GENERATED',now())`,
      [
        company.id,
        payrollRun.id,
        `${RUN_NO}-JOURNAL`,
        money(journalDebit),
        money(journalCredit),
        JSON.stringify({ ...SIMULATION_MARKER, entries: journalEntries }),
        `${RUN_NO}-SIMULATED`,
      ],
    );
    await runner.query(
      `INSERT INTO payroll_payment_imports (
         company_id,payroll_run_id,bank_batch_id,provider_key,payment_reference,
         payment_date,record_count,matched_count,partial_count,failed_count,
         unmatched_count,expected_amount,paid_amount,variance_amount,status,
         snapshot,created_by_company_user_id,created_at
       ) SELECT $1,$2,batch.id,'DEMO_SIMULATOR',$3,$4::date,$5,$5,0,0,0,
                $6,$6,0,'MATCHED',$7::jsonb,$8,now()
           FROM payroll_bank_batches batch
          WHERE batch.company_id = $1 AND batch.payroll_run_id = $2`,
      [
        company.id,
        payrollRun.id,
        `${RUN_NO}-PAYMENT-SIMULATED`,
        '2026-10-28',
        employees.length,
        money(totals.net),
        JSON.stringify({
          ...SIMULATION_MARKER,
          matched_count: employees.length,
        }),
        admin.company_user_id,
      ],
    );
    await runner.query(
      `UPDATE payroll_periods SET status = 'PAID'
        WHERE id = $1 AND company_id = $2`,
      [period.id, company.id],
    );
    await runner.commitTransaction();
    console.log('[PayrollDemoCycle] Synthetic demo cycle committed.');
    console.log(
      JSON.stringify(
        {
          company_id: company.id,
          period_code: PERIOD_CODE,
          run_no: RUN_NO,
          payroll_run_id: payrollRun.id,
          employee_count: employees.length,
          totals: {
            gross: money(totals.gross),
            deductions: money(totals.deductions),
            net: money(totals.net),
            employer_contributions: money(totals.employerContributions),
            employer_cost: money(totals.employerCost),
          },
          synthetic: true,
          statutory_values: 'random training estimates; not legally approved',
          external_payments: false,
          external_journal_posting: false,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const failedQuery =
      typeof error === 'object' && error !== null && 'query' in error
        ? (error as { query?: unknown }).query
        : undefined;
    if (typeof failedQuery === 'string') {
      console.error('[PayrollDemoCycle] Failed SQL:', failedQuery);
    }
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
    await AppDataSource.destroy();
  }
}

void run().catch((error: unknown) => {
  console.error(
    '[PayrollDemoCycle] Failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
