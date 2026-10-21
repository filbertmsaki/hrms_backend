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

function temporaryPassword() {
  return `Demo-${randomBytes(18).toString('base64url')}!`;
}

export async function seedPayrollDemo(dataSource: DataSource) {
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
      const password = temporaryPassword();
      const userRows = await queryRows<{ id: number }>(
        query,
        `INSERT INTO users (user_no, first_name, last_name, phone, email, password, status, user_type,
          is_email_verified, must_set_password, activated_at, account_provisioning_status,
          created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', 'COMPANY_USER', true, true, now(), 'active', now(), now())
         ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
          updated_at = now()
         RETURNING id`,
        [
          `PAYDEMO-${role.key.toUpperCase()}`,
          role.first,
          role.last,
          `+255700${String(100000 + ROLES.indexOf(role)).slice(-6)}`,
          role.email,
          await hashPassword(password),
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
        const permissionId = permissionIds.get(permission);
        if (permissionId) {
          await query.query(
            `INSERT INTO company_user_permissions (company_user_id, permission_id, created_at)
             VALUES ($1, $2, now()) ON CONFLICT (company_user_id, permission_id) DO NOTHING`,
            [membershipId, permissionId],
          );
        }
      }
      roleUsers.set(role.key, { membershipId, employeeId: null });
      if (accountWasNew)
        credentials.push({
          role: role.key,
          email: role.email,
          temporaryPassword: password,
        });
    }

    const employeeRows = new Map<string, number>();
    for (const role of ROLES.filter((entry) => entry.employee)) {
      const account = roleUsers.get(role.key)!;
      const employeeNo = `PAYDEMO-${role.key.toUpperCase()}`;
      const userIdRows = await queryRows<{ user_id: number }>(
        query,
        'SELECT user_id FROM company_users WHERE id = $1',
        [account.membershipId],
      );
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
          account.membershipId,
          employeeNo,
          role.first,
          role.last,
          {
            demo: true,
            demo_module: 'payroll',
            role: role.key,
            user_id: Number(userIdRows[0].user_id),
          },
        ],
      );
      employeeRows.set(role.key, Number(rows[0].id));
      account.employeeId = Number(rows[0].id);
    }
    const managerId = employeeRows.get('manager')!;
    const employeeId = employeeRows.get('employee')!;
    await query.query('UPDATE employees SET reports_to = $1 WHERE id = $2', [
      managerId,
      employeeId,
    ]);

    await query.query(
      `INSERT INTO payroll_components (company_id, code, name, component_type, frequency, calculation_method,
        tax_treatment, taxable_percentage, pensionable, health_insurance_applicable, included_in_gross,
        included_in_net, included_in_employer_cost, subject_to_proration, allow_manual_input,
        allow_negative_amount, calculation_order, is_system_component, status, version)
       VALUES ($1,'DEMO_BONUS','Demo one-time bonus','EARNING','ONE_TIME','EXTERNAL_INPUT','TAXABLE',100,
        false,false,true,true,true,false,true,false,30,false,'ACTIVE',1)
       ON CONFLICT (company_id, code) DO UPDATE SET status = 'ACTIVE'`,
      [companyId],
    );
    for (const [key, employeeIdValue] of employeeRows) {
      const membershipId = roleUsers.get(key)!.membershipId;
      await query.query(
        `INSERT INTO employee_payroll_profiles (company_id, employee_id, payroll_number, currency,
          pay_frequency, payroll_enabled, payroll_hold, effective_from, created_by_company_user_id,
          updated_by_company_user_id, version, created_at, updated_at)
         VALUES ($1,$2,$3,'TZS','MONTHLY',true,false,'2026-01-01',$4,$4,1,now(),now())
         ON CONFLICT (company_id, employee_id) DO UPDATE SET payroll_enabled = true, updated_at = now()`,
        [
          companyId,
          employeeIdValue,
          `PAYDEMO-${key.toUpperCase()}`,
          membershipId,
        ],
      );
      await query.query(
        `INSERT INTO employee_compensation_versions (company_id, employee_id, movement_id, base_salary,
          currency, salary_structure_code, component_overrides, pay_frequency, effective_from, effective_to,
          status, revision_reference, justification, approved_by_company_user_id, created_by_company_user_id,
          payroll_sync_status, version, created_at, updated_at)
         VALUES ($1,$2,null,'1000000.00','TZS','PAYDEMO-STD',$3,'MONTHLY','2026-01-01',null,'ACTIVE',
          'PAYROLL-DEMO-SEED','Synthetic payroll demo compensation',$4,$4,'SYNCED',1,now(),now())
         ON CONFLICT DO NOTHING`,
        [
          companyId,
          employeeIdValue,
          { DEMO_HOUSING: { amount: '250000.00' } },
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
    await query.query(
      `INSERT INTO payroll_periods (company_id, payroll_calendar_id, period_code, period_year, period_month,
        start_date, end_date, cutoff_date, payment_date, status)
       VALUES ($1,$2,'PAYDEMO-2026-10',2026,10,'2026-10-01','2026-10-31','2026-10-20','2026-10-28','OPEN')
       ON CONFLICT (company_id, payroll_calendar_id, period_year, period_month) DO UPDATE
       SET period_code = EXCLUDED.period_code`,
      [companyId, calendarId],
    );

    await query.commitTransaction();
    return {
      companyId,
      slug: DEMO_SLUG,
      users: credentials,
      employeeIds: Object.fromEntries(employeeRows),
    };
  } catch (error) {
    await query.rollbackTransaction();
    throw error;
  } finally {
    await query.release();
  }
}
