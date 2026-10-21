import { AppDataSource } from '../database/data-source';

type QueryRow = Record<string, unknown>;

async function queryRows<T extends QueryRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return await AppDataSource.query(sql, params);
}

async function run() {
  await AppDataSource.initialize();
  try {
    const [company] = await queryRows<{
      id: number;
      metadata: Record<string, unknown> | null;
    }>('SELECT id, metadata FROM companies WHERE slug = $1', [
      'hrms-payroll-demo',
    ]);
    if (
      !company ||
      company.metadata?.demo !== true ||
      company.metadata?.demo_module !== 'payroll' ||
      company.metadata?.resettable !== true
    ) {
      throw new Error(
        'Isolated resettable payroll demo tenant is missing or invalid.',
      );
    }

    const roles = await queryRows<{
      role_key: string;
      user_count: number;
      permission_count: number;
    }>(
      `SELECT role.name AS role_key,
              COUNT(DISTINCT membership.id)::int AS user_count,
              COUNT(DISTINCT user_permission.permission_id)::int AS permission_count
         FROM roles role
         LEFT JOIN company_user_roles user_role ON user_role.role_id = role.id
         LEFT JOIN company_users membership
           ON membership.id = user_role.company_user_id
          AND membership.company_id = role.company_id
          AND membership.status = 'active'
         LEFT JOIN company_user_permissions user_permission
           ON user_permission.company_user_id = membership.id
         WHERE role.company_id = $1 AND role.name LIKE 'PAYROLL_DEMO_%'
         GROUP BY role.name ORDER BY role.name`,
      [company.id],
    );
    const users = await queryRows<{
      role_key: string;
      email: string;
      linked_elsewhere: boolean;
    }>(
      `SELECT role.name AS role_key, account.email,
              EXISTS (
                SELECT 1 FROM company_users other_membership
                 WHERE other_membership.user_id = account.id
                   AND other_membership.company_id <> $1
              ) AS linked_elsewhere
         FROM roles role
         JOIN company_user_roles user_role ON user_role.role_id = role.id
         JOIN company_users membership
           ON membership.id = user_role.company_user_id
          AND membership.company_id = role.company_id
         JOIN users account ON account.id = membership.user_id
        WHERE role.company_id = $1 AND role.name LIKE 'PAYROLL_DEMO_%'
        ORDER BY role.name`,
      [company.id],
    );
    const [employeeCounts] = await queryRows<{
      employees: number;
      payroll_profiles: number;
      compensation_versions: number;
    }>(
      `SELECT COUNT(DISTINCT employee.id)::int AS employees,
              COUNT(DISTINCT profile.employee_id)::int AS payroll_profiles,
              COUNT(DISTINCT compensation.employee_id)::int AS compensation_versions
         FROM employees employee
         LEFT JOIN employee_payroll_profiles profile
           ON profile.company_id = employee.company_id
          AND profile.employee_id = employee.id
         LEFT JOIN employee_compensation_versions compensation
           ON compensation.company_id = employee.company_id
          AND compensation.employee_id = employee.id
        WHERE employee.company_id = $1
          AND employee.metadata->>'demo_module' = 'payroll'`,
      [company.id],
    );
    const [period] = await queryRows<{
      period_code: string;
      payroll_inputs: number;
    }>(
      `SELECT period.period_code,
              (SELECT COUNT(*)::int FROM payroll_inputs input
                WHERE input.company_id = period.company_id
                  AND input.payroll_period_id = period.id
                  AND input.source_module = 'PAYROLL_DEMO'
                  AND input.status = 'APPROVED') AS payroll_inputs
         FROM payroll_periods period
         JOIN payroll_calendars calendar
           ON calendar.id = period.payroll_calendar_id
          AND calendar.company_id = period.company_id
        WHERE period.company_id = $1 AND calendar.code = 'PAYDEMO-MONTHLY'
        ORDER BY period.id DESC LIMIT 1`,
      [company.id],
    );
    const [catalog] = await queryRows<{
      component_count: number;
      salary_structure_count: number;
    }>(
      `SELECT (SELECT COUNT(*)::int FROM payroll_components
                WHERE company_id = $1 AND code LIKE 'DEMO_%' AND status = 'ACTIVE') AS component_count,
              (SELECT COUNT(*)::int FROM salary_structures
                WHERE company_id = $1 AND code = 'PAYDEMO-STD' AND status = 'ACTIVE') AS salary_structure_count`,
      [company.id],
    );

    const requiredRoles = [
      'PAYROLL_DEMO_EMPLOYEE',
      'PAYROLL_DEMO_MANAGER',
      'PAYROLL_DEMO_HR',
      'PAYROLL_DEMO_FINANCE',
      'PAYROLL_DEMO_ADMIN',
      'PAYROLL_DEMO_AUDITOR',
    ];
    const roleMap = new Map(roles.map((role) => [role.role_key, role]));
    const roleChecks = requiredRoles.map((key) => ({
      role: key,
      exists: roleMap.has(key),
      has_user: Number(roleMap.get(key)?.user_count ?? 0) > 0,
      has_permissions: Number(roleMap.get(key)?.permission_count ?? 0) > 0,
    }));
    const checks = {
      isolated_demo_company: true,
      six_demo_roles_complete:
        roleChecks.length === 6 &&
        roleChecks.every(
          (role) => role.exists && role.has_user && role.has_permissions,
        ),
      reserved_users_not_linked_elsewhere: users.every(
        (user) => !user.linked_elsewhere,
      ),
      six_scenario_employees: Number(employeeCounts.employees) === 6,
      payroll_profiles_for_all: Number(employeeCounts.payroll_profiles) === 6,
      compensation_for_all: Number(employeeCounts.compensation_versions) === 6,
      five_demo_components: Number(catalog.component_count) === 5,
      active_demo_salary_structure:
        Number(catalog.salary_structure_count) === 1,
      seeded_demo_period: Boolean(period?.period_code),
      three_approved_scenario_inputs: Number(period?.payroll_inputs ?? 0) === 3,
    };
    const report = {
      company_id: company.id,
      company_slug: 'hrms-payroll-demo',
      read_only: true,
      passed: Object.values(checks).every(Boolean),
      checks,
      role_checks: roleChecks,
      users,
      employee_counts: employeeCounts,
      period: period ?? null,
      catalog,
      statutory_rules:
        'Not verified by this demo fixture; company Finance approval remains separate.',
    };
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 2;
  } finally {
    await AppDataSource.destroy();
  }
}

void run().catch((error: unknown) => {
  console.error(
    '[PayrollDemoVerify] Failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
