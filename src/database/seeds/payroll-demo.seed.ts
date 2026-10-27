import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { hashPassword } from '../../common/utils/hash.util';

const DEMO_SLUG = 'hrms-payroll-demo';
type QueryRow = Record<string, unknown>;

async function queryRows<T extends QueryRow>(
  query: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await query.query(sql, params)) as T[];
}
const ROLES = [
  {
    key: 'employee',
    name: 'PAYROLL_DEMO_EMPLOYEE',
    display: 'Payroll Demo Employee',
    first: 'Demo',
    last: 'Employee',
    email: 'payroll.employee@demo.invalid',
    employee: true,
  },
  {
    key: 'manager',
    name: 'PAYROLL_DEMO_MANAGER',
    display: 'Payroll Demo Manager',
    first: 'Demo',
    last: 'Manager',
    email: 'payroll.manager@demo.invalid',
    employee: true,
  },
  {
    key: 'hr',
    name: 'PAYROLL_DEMO_HR',
    display: 'Payroll Demo HR',
    first: 'Demo',
    last: 'HR',
    email: 'payroll.hr@demo.invalid',
    employee: false,
  },
  {
    key: 'finance',
    name: 'PAYROLL_DEMO_FINANCE',
    display: 'Payroll Demo Finance',
    first: 'Demo',
    last: 'Finance',
    email: 'payroll.finance@demo.invalid',
    employee: false,
  },
  {
    key: 'payroll_admin',
    name: 'PAYROLL_DEMO_ADMIN',
    display: 'Payroll Demo Payroll Admin',
    first: 'Demo',
    last: 'Payroll Admin',
    email: 'payroll.admin@demo.invalid',
    employee: false,
  },
  {
    key: 'auditor',
    name: 'PAYROLL_DEMO_AUDITOR',
    display: 'Payroll Demo Auditor',
    first: 'Demo',
    last: 'Auditor',
    email: 'payroll.auditor@demo.invalid',
    employee: false,
  },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  employee: ['payroll:payslips:self'],
  manager: ['payroll:runs:read', 'payroll:runs:approve'],
  hr: ['payroll:runs:read', 'payroll:final-settlements'],
  finance: [
    'payroll:runs:read',
    'payroll:runs:approve',
    'payroll:statutory:approve',
    'payroll:final-settlements',
  ],
  payroll_admin: [
    'payroll:runs',
    'payroll:runs:read',
    'payroll:runs:process',
    'payroll:runs:approve',
    'payroll:runs:lock',
    'payroll:banking',
    'payroll:accounting',
    'payroll:reports',
    'payroll:final-settlements',
  ],
  auditor: ['payroll:runs:read', 'payroll:reports'],
};

const PAYROLL_SCENARIOS = [
  {
    key: 'employee',
    first: 'Demo',
    last: 'Employee',
    salary: '1000000.00',
    housing: '250000.00',
    employeeNo: 'PAYDEMO-EMPLOYEE',
  },
  {
    key: 'manager',
    first: 'Demo',
    last: 'Manager',
    salary: '1600000.00',
    housing: '400000.00',
    employeeNo: 'PAYDEMO-MANAGER',
  },
  {
    key: 'standard',
    first: 'Asha',
    last: 'Sample',
    salary: '850000.00',
    housing: '125000.00',
    employeeNo: 'PAYDEMO-STANDARD',
  },
  {
    key: 'bonus',
    first: 'Baraka',
    last: 'Sample',
    salary: '1250000.00',
    housing: '200000.00',
    employeeNo: 'PAYDEMO-BONUS',
  },
  {
    key: 'deduction',
    first: 'Neema',
    last: 'Sample',
    salary: '950000.00',
    housing: '150000.00',
    employeeNo: 'PAYDEMO-DEDUCTION',
  },
  {
    key: 'reimbursement',
    first: 'Juma',
    last: 'Sample',
    salary: '1100000.00',
    housing: '175000.00',
    employeeNo: 'PAYDEMO-REIMBURSEMENT',
  },
];

function temporaryPassword() {
  return `Demo-${randomBytes(18).toString('base64url')}!`;
}

export async function seedPayrollDemo(dataSource: DataSource) {
  const demoTestPassword = process.env.PAYROLL_DEMO_TEST_PASSWORD?.trim();
  const isTestEnvironment =
    (process.env.APP_ENV ?? process.env.NODE_ENV ?? '').toLowerCase() ===
    'test';
  if (demoTestPassword && !isTestEnvironment) {
    throw new Error(
      'PAYROLL_DEMO_TEST_PASSWORD can only be used when APP_ENV=test or NODE_ENV=test.',
    );
  }
  const query = dataSource.createQueryRunner();
  await query.connect();
  await query.startTransaction();
  const credentials: Array<{
    role: string;
    email: string;
    temporaryPassword: string;
  }> = [];
  try {
    const companies = await queryRows<{
      id: number;
      metadata: Record<string, unknown> | null;
    }>(query, `SELECT id, metadata FROM companies WHERE slug = $1 FOR UPDATE`, [
      DEMO_SLUG,
    ]);
    let companyId: number;
    if (companies.length === 0) {
      const rows = await queryRows<{ id: number }>(
        query,
        `INSERT INTO companies (name, slug, status, metadata, created_at, updated_at)
         VALUES ('HRMS Payroll Demo', $1, 'active', $2, now(), now()) RETURNING id`,
        [
          DEMO_SLUG,
          {
            demo: true,
            demo_module: 'payroll',
            resettable: true,
            source: 'payroll-demo.seed',
          },
        ],
      );
      companyId = Number(rows[0].id);
    } else {
      const metadata = companies[0].metadata ?? {};
      if (
        metadata.demo !== true ||
        metadata.demo_module !== 'payroll' ||
        metadata.resettable !== true
      ) {
        throw new Error(
          'The payroll demo slug exists but is not marked as an isolated resettable demo tenant.',
        );
      }
      companyId = Number(companies[0].id);
    }

    const permissionRows = await queryRows<{ id: number; name: string }>(
      query,
      `SELECT id, name FROM permissions WHERE name = ANY($1::varchar[])`,
      [[...new Set(Object.values(ROLE_PERMISSIONS).flat())]],
    );
    const permissionIds = new Map<string, number>(
      permissionRows.map((item) => [item.name, Number(item.id)]),
    );
    const requiredPermissions = new Set(Object.values(ROLE_PERMISSIONS).flat());
    const missingPermissions = [...requiredPermissions].filter(
      (permission) => !permissionIds.has(permission),
    );
    if (missingPermissions.length > 0) {
      throw new Error(
        `Payroll demo setup requires the permission seed first. Missing: ${missingPermissions.join(', ')}.`,
      );
    }
    const roleUsers = new Map<
      string,
      { membershipId: number; employeeId: number | null }
    >();
    for (const role of ROLES) {
      const roleRows = await queryRows<{ id: number }>(
        query,
        `INSERT INTO roles (name, display_name, description, company_id, is_system_generated, created_at, updated_at)
         VALUES ($1, $2, 'Synthetic least-privilege payroll demo role', $3, false, now(), now())
         ON CONFLICT (company_scope_key, name) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id`,
        [role.name, role.display, companyId],
      );
      const roleId = Number(roleRows[0].id);
      const existingUserRows = await queryRows<{ id: number }>(
        query,
        'SELECT id FROM users WHERE email = $1',
        [role.email],
      );
      const accountWasNew = existingUserRows.length === 0;
      if (!accountWasNew) {
        const foreignMemberships = await queryRows<{ id: number }>(
          query,
          `SELECT id FROM company_users WHERE user_id = $1 AND company_id <> $2`,
          [existingUserRows[0].id, companyId],
        );
        if (foreignMemberships.length > 0) {
          throw new Error(
            `Reserved payroll demo account ${role.email} is already linked to another company. Refusing to reuse it.`,
          );
        }
      }
      const password = demoTestPassword ?? temporaryPassword();
      const userRows = await queryRows<{ id: number }>(
        query,
        `INSERT INTO users (user_no, first_name, last_name, phone, email, password, status, user_type,
          is_email_verified, must_set_password, activated_at, account_provisioning_status,
          created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', 'COMPANY_USER', true, $7, now(), 'active', now(), now())
         ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
          password = CASE WHEN $8::boolean THEN EXCLUDED.password ELSE users.password END,
          must_set_password = CASE WHEN $8::boolean THEN false ELSE users.must_set_password END,
          updated_at = now()
         RETURNING id`,
        [
          `PD-${role.key.toUpperCase()}`,
          role.first,
          role.last,
          `+255700${String(100000 + ROLES.indexOf(role)).slice(-6)}`,
          role.email,
          await hashPassword(password),
          !demoTestPassword,
          Boolean(demoTestPassword),
        ],
      );
      const userId = Number(userRows[0].id);
      const membershipRows = await queryRows<{ id: number }>(
        query,
        `INSERT INTO company_users (company_id, user_id, status, is_default, created_at, updated_at)
         VALUES ($1, $2, 'active', true, now(), now())
         ON CONFLICT (company_id, user_id) DO UPDATE SET status = 'active'
         RETURNING id`,
        [companyId, userId],
      );
      const membershipId = Number(membershipRows[0].id);
      await query.query(
        `INSERT INTO company_user_roles (company_user_id, role_id, created_at)
         VALUES ($1, $2, now()) ON CONFLICT (company_user_id, role_id) DO NOTHING`,
        [membershipId, roleId],
      );
      for (const permission of ROLE_PERMISSIONS[role.key]) {
        const permissionId = permissionIds.get(permission)!;
        await query.query(
          `INSERT INTO company_user_permissions (company_user_id, permission_id, created_at)
           VALUES ($1, $2, now()) ON CONFLICT (company_user_id, permission_id) DO NOTHING`,
          [membershipId, permissionId],
        );
      }
      roleUsers.set(role.key, { membershipId, employeeId: null });
      if (accountWasNew && !demoTestPassword)
        credentials.push({
          role: role.key,
          email: role.email,
          temporaryPassword: password,
        });
    }

    const employeeRows = new Map<string, number>();
    for (const scenario of PAYROLL_SCENARIOS) {
      const account = roleUsers.get(scenario.key);
      const userIdRows = account
        ? await queryRows<{ user_id: number }>(
            query,
            'SELECT user_id FROM company_users WHERE id = $1',
            [account.membershipId],
          )
        : [];
      const rows = await queryRows<{ id: number }>(
        query,
        `INSERT INTO employees (company_id, company_user_id, employee_no, first_name, last_name, gender,
          employment_status, employment_type, hire_date, notes, metadata, version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'unspecified', 'active', 'full_time', '2024-01-01',
          'Synthetic payroll demo employee', $6, 1, now(), now())
         ON CONFLICT (company_id, employee_no) DO UPDATE SET company_user_id = EXCLUDED.company_user_id,
          metadata = EXCLUDED.metadata, updated_at = now() RETURNING id`,
        [
          companyId,
          account?.membershipId ?? null,
          scenario.employeeNo,
          scenario.first,
          scenario.last,
          {
            demo: true,
            demo_module: 'payroll',
            role: scenario.key,
            user_id: userIdRows[0] ? Number(userIdRows[0].user_id) : null,
          },
        ],
      );
      employeeRows.set(scenario.key, Number(rows[0].id));
      if (account) account.employeeId = Number(rows[0].id);
    }
    const managerId = employeeRows.get('manager')!;
    const employeeId = employeeRows.get('employee')!;
    await query.query('UPDATE employees SET reports_to = $1 WHERE id = $2', [
      managerId,
      employeeId,
    ]);

    const components = [
      [
        'DEMO_BASIC',
        'Demo basic salary',
        'EARNING',
        'RECURRING',
        'FIXED_AMOUNT',
        'TAXABLE',
        100,
        true,
        false,
        true,
        true,
        true,
        false,
        10,
      ],
      [
        'DEMO_HOUSING',
        'Demo housing allowance',
        'EARNING',
        'RECURRING',
        'FIXED_AMOUNT',
        'TAXABLE',
        100,
        false,
        false,
        true,
        true,
        true,
        false,
        20,
      ],
      [
        'DEMO_BONUS',
        'Demo one-time bonus',
        'EARNING',
        'ONE_TIME',
        'EXTERNAL_INPUT',
        'TAXABLE',
        100,
        false,
        false,
        true,
        true,
        true,
        true,
        30,
      ],
      [
        'DEMO_DEDUCTION',
        'Demo authorized deduction',
        'DEDUCTION',
        'ONE_TIME',
        'EXTERNAL_INPUT',
        'NON_TAXABLE',
        0,
        false,
        false,
        false,
        true,
        false,
        true,
        40,
      ],
      [
        'DEMO_REIMBURSEMENT',
        'Demo expense reimbursement',
        'REIMBURSEMENT',
        'ONE_TIME',
        'EXTERNAL_INPUT',
        'NON_TAXABLE',
        0,
        false,
        false,
        false,
        true,
        false,
        true,
        50,
      ],
    ] as const;
    const componentIds = new Map<string, number>();
    for (const [
      code,
      name,
      componentType,
      frequency,
      calculationMethod,
      taxTreatment,
      taxablePercentage,
      pensionable,
      healthInsurance,
      includedGross,
      includedNet,
      includedCost,
      manualInput,
      calculationOrder,
    ] of components) {
      const componentRows = await queryRows<{ id: number }>(
        query,
        `INSERT INTO payroll_components (company_id, code, name, component_type, frequency, calculation_method,
        tax_treatment, taxable_percentage, pensionable, health_insurance_applicable, included_in_gross,
        included_in_net, included_in_employer_cost, subject_to_proration, allow_manual_input,
        allow_negative_amount, calculation_order, is_system_component, status, version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,$14,false,$15,false,'ACTIVE',1)
         ON CONFLICT (company_id, code) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE'
         RETURNING id`,
        [
          companyId,
          code,
          name,
          componentType,
          frequency,
          calculationMethod,
          taxTreatment,
          taxablePercentage,
          pensionable,
          healthInsurance,
          includedGross,
          includedNet,
          includedCost,
          manualInput,
          calculationOrder,
        ],
      );
      componentIds.set(code, Number(componentRows[0].id));
    }
    const structureRows = await queryRows<{ id: number }>(
      query,
      `INSERT INTO salary_structures (company_id, code, name, version_number, currency, effective_from,
         effective_to, is_locked, status, metadata, created_by_company_user_id, created_at, updated_at)
       VALUES ($1,'PAYDEMO-STD','Payroll Demo Salary Structure',1,'TZS','2026-01-01',null,false,'ACTIVE',$2,null,now(),now())
       ON CONFLICT (company_id, code, version_number) DO UPDATE SET metadata = EXCLUDED.metadata
       RETURNING id`,
      [companyId, { demo: true, demo_module: 'payroll' }],
    );
    const structureId = Number(structureRows[0].id);
    for (const [code, order] of [
      ['DEMO_BASIC', 10],
      ['DEMO_HOUSING', 20],
    ] as const) {
      await query.query(
        `INSERT INTO salary_structure_components (company_id, salary_structure_id, component_id,
           default_amount, default_rate, calculation_order, configuration)
         VALUES ($1,$2,$3,'0.00',null,$4,$5)
         ON CONFLICT (salary_structure_id, component_id) DO UPDATE
           SET configuration = EXCLUDED.configuration`,
        [
          companyId,
          structureId,
          componentIds.get(code),
          order,
          { demo: true, demo_module: 'payroll' },
        ],
      );
    }
    for (const [key, employeeIdValue] of employeeRows) {
      const membershipId = roleUsers.get(key)?.membershipId ?? null;
      const scenario = PAYROLL_SCENARIOS.find((item) => item.key === key)!;
      await query.query(
        `INSERT INTO employee_payroll_profiles (company_id, employee_id, payroll_number, currency,
          pay_frequency, payroll_enabled, payroll_hold, effective_from, created_by_company_user_id,
          updated_by_company_user_id, version, created_at, updated_at)
         VALUES ($1,$2,$3,'TZS','MONTHLY',true,false,'2026-01-01',$4,$4,1,now(),now())
         ON CONFLICT (company_id, employee_id) DO UPDATE SET payroll_enabled = true, updated_at = now()`,
        [companyId, employeeIdValue, scenario.employeeNo, membershipId],
      );
      await query.query(
        `INSERT INTO employee_compensation_versions (company_id, employee_id, movement_id, base_salary,
          currency, salary_structure_code, component_overrides, pay_frequency, effective_from, effective_to,
          status, revision_reference, justification, approved_by_company_user_id, created_by_company_user_id,
          payroll_sync_status, version, created_at, updated_at)
         VALUES ($1,$2,null,$3,'TZS','PAYDEMO-STD',$4,'MONTHLY','2026-01-01',null,'ACTIVE',
          'PAYROLL-DEMO-SEED','Synthetic payroll demo compensation',$5,$5,'SYNCED',1,now(),now())
         ON CONFLICT DO NOTHING`,
        [
          companyId,
          employeeIdValue,
          scenario.salary,
          { DEMO_HOUSING: { amount: scenario.housing } },
          membershipId,
        ],
      );
    }
    const calendarRows = await queryRows<{ id: number }>(
      query,
      `INSERT INTO payroll_calendars (company_id, code, name, frequency, cutoff_day, payment_day, timezone, currency, is_default, status)
       VALUES ($1,'PAYDEMO-MONTHLY','Payroll Demo Monthly','MONTHLY',20,28,'Africa/Dar_es_Salaam','TZS',true,'ACTIVE')
       ON CONFLICT (company_id, code) DO UPDATE SET status = 'ACTIVE' RETURNING id`,
      [companyId],
    );
    const calendarId = Number(calendarRows[0].id);
    const periodRows = await queryRows<{ id: number }>(
      query,
      `INSERT INTO payroll_periods (company_id, payroll_calendar_id, period_code, period_year, period_month,
        start_date, end_date, cutoff_date, payment_date, status)
       VALUES ($1,$2,'PAYDEMO-2026-10',2026,10,'2026-10-01','2026-10-31','2026-10-20','2026-10-28','OPEN')
       ON CONFLICT (company_id, payroll_calendar_id, period_year, period_month) DO UPDATE
       SET period_code = EXCLUDED.period_code
       RETURNING id`,
      [companyId, calendarId],
    );
    const periodId = Number(periodRows[0].id);
    const groupRows = await queryRows<{ id: number }>(
      query,
      `INSERT INTO payroll_groups (
         company_id, code, name, frequency, payroll_calendar_id, currency,
         policy, status, created_at, updated_at
       ) VALUES ($1,'PAYDEMO-GROUP','Synthetic payroll demo group','MONTHLY',
         $2,'TZS',$3::jsonb,'ACTIVE',now(),now())
       ON CONFLICT (company_id, code) DO UPDATE SET
         payroll_calendar_id = EXCLUDED.payroll_calendar_id,
         policy = EXCLUDED.policy, status = 'ACTIVE', updated_at = now()
       RETURNING id`,
      [
        companyId,
        calendarId,
        JSON.stringify({
          demo: true,
          demo_module: 'payroll',
          synthetic_only: true,
        }),
      ],
    );
    const payrollGroupId = Number(groupRows[0].id);
    for (const employeeIdValue of employeeRows.values()) {
      await query.query(
        `INSERT INTO payroll_group_assignments (
           company_id, payroll_group_id, employee_id, effective_from,
           effective_to, status, metadata, created_at, updated_at
         ) VALUES ($1,$2,$3,'2026-01-01',null,'ACTIVE',$4::jsonb,now(),now())
         ON CONFLICT (company_id, payroll_group_id, employee_id, effective_from)
         DO UPDATE SET effective_to = null, status = 'ACTIVE',
           metadata = EXCLUDED.metadata, updated_at = now()`,
        [
          companyId,
          payrollGroupId,
          employeeIdValue,
          JSON.stringify({ demo: true, demo_module: 'payroll' }),
        ],
      );
    }
    const demoMappings = [
      ['DEMO_BASIC', 'DEMO_PAYROLL_EXPENSE', 'DEMO_PAYROLL_CLEARING'],
      ['DEMO_HOUSING', 'DEMO_PAYROLL_EXPENSE', 'DEMO_PAYROLL_CLEARING'],
      ['DEMO_BONUS', 'DEMO_PAYROLL_EXPENSE', 'DEMO_PAYROLL_CLEARING'],
      ['DEMO_DEDUCTION', 'DEMO_PAYROLL_CLEARING', 'DEMO_DEDUCTION_LIABILITY'],
      [
        'DEMO_REIMBURSEMENT',
        'DEMO_REIMBURSEMENT_EXPENSE',
        'DEMO_PAYROLL_CLEARING',
      ],
    ] as const;
    for (const [
      componentCode,
      debitAccountCode,
      creditAccountCode,
    ] of demoMappings) {
      await query.query(
        `INSERT INTO payroll_accounting_mappings (
           company_id, component_code, debit_account_code,
           credit_account_code, dimensions
         ) VALUES ($1,$2,$3,$4,$5::jsonb)
         ON CONFLICT (company_id, component_code) DO UPDATE SET
           debit_account_code = EXCLUDED.debit_account_code,
           credit_account_code = EXCLUDED.credit_account_code,
           dimensions = EXCLUDED.dimensions`,
        [
          companyId,
          componentCode,
          debitAccountCode,
          creditAccountCode,
          JSON.stringify({ demo: true, demo_module: 'payroll' }),
        ],
      );
    }
    const payrollAdminMembershipId =
      roleUsers.get('payroll_admin')!.membershipId;
    const demoInputs = [
      {
        employeeKey: 'bonus',
        componentCode: 'DEMO_BONUS',
        sourceReference: 'PAYDEMO-BONUS-2026-10',
        amount: '70000.00',
      },
      {
        employeeKey: 'deduction',
        componentCode: 'DEMO_DEDUCTION',
        sourceReference: 'PAYDEMO-DEDUCTION-2026-10',
        amount: '25000.00',
      },
      {
        employeeKey: 'reimbursement',
        componentCode: 'DEMO_REIMBURSEMENT',
        sourceReference: 'PAYDEMO-REIMBURSEMENT-2026-10',
        amount: '45000.00',
      },
    ];
    for (const input of demoInputs) {
      await query.query(
        `INSERT INTO payroll_inputs (company_id, payroll_period_id, employee_id, component_code,
           source_module, source_reference, amount, currency, status, payload,
           created_by_company_user_id, approved_by_company_user_id, approved_at, created_at)
         SELECT $1::int,$2::int,$3::int,$4::varchar,'PAYROLL_DEMO',$5::varchar,
                $6::numeric,'TZS','APPROVED',$7::jsonb,$8::int,$8::int,now(),now()
          WHERE NOT EXISTS (
            SELECT 1 FROM payroll_inputs existing
             WHERE existing.company_id = $1
               AND existing.payroll_period_id = $2
               AND existing.employee_id = $3
               AND existing.source_module = 'PAYROLL_DEMO'
               AND existing.source_reference = $5::varchar
          )`,
        [
          companyId,
          periodId,
          employeeRows.get(input.employeeKey),
          input.componentCode,
          input.sourceReference,
          input.amount,
          { demo: true, demo_module: 'payroll' },
          payrollAdminMembershipId,
        ],
      );
    }

    await query.commitTransaction();
    return {
      companyId,
      slug: DEMO_SLUG,
      users: credentials,
      employeeIds: Object.fromEntries(employeeRows),
      periodId,
      scenarioInputs: demoInputs.length,
    };
  } catch (error) {
    await query.rollbackTransaction();
    throw error;
  } finally {
    await query.release();
  }
}
