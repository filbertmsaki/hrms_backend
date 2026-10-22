import { MigrationInterface, QueryRunner } from 'typeorm';

/** Complete employee self-service access and provision Finance/Management role templates. */
export class CompleteUserCategoryRoleGrants1795000000000 implements MigrationInterface {
  name = 'CompleteUserCategoryRoleGrants1795000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const grants: Record<string, string[]> = {
      EMPLOYEE: ['payroll:payslips:self'],
      FINANCE: [
        'view_company_dashboard',
        'data_scope:company',
        'payroll:config:read',
        'payroll:inputs:read',
        'payroll:inputs',
        'payroll:inputs:approve',
        'payroll:periods:read',
        'payroll:periods',
        'payroll:runs:read',
        'payroll:runs',
        'payroll:runs:process',
        'payroll:runs:approve',
        'payroll:runs:lock',
        'payroll:payslips',
        'payroll:payslips:read',
        'payroll:banking',
        'payroll:accounting',
        'payroll:reports',
        'payroll:statutory:approve',
        'employee_finance:accounts:read',
        'employee_finance:applications:read',
        'employee_finance:applications:finance-approve',
        'employee_finance:disbursements',
        'employee_finance:disbursements:approve',
        'employee_finance:payroll',
        'employee_finance:repayments',
        'employee_finance:repayments:approve',
        'employee_finance:reports',
        'employee_finance:settlements',
        'employee_finance:settlements:approve',
      ],
      MANAGEMENT: [
        'view_company_dashboard',
        'view_company_data',
        'data_scope:company',
        'dashboard:management',
        'analytics:dashboards:management',
        'analytics:datasets:read',
        'analytics:metrics:read',
        'analytics:reports',
        'performance_aggregates:read',
        'performance_dashboards:read',
        'performance_kpis:all:read',
        'performance_reports:read',
        'work_activities:hr:read',
        'field_visits:hr:read',
        'field_locations:read',
        'payroll:reports',
      ],
    };

    const permissionNames = Array.from(new Set(Object.values(grants).flat()));
    for (const name of permissionNames) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("name", "display_name", "description", "scope", "is_system_generated")
         VALUES ($1, $1, $2, 'company', true)
         ON CONFLICT ("name") DO NOTHING`,
        [name, `Permission for user category access: ${name}`],
      );
    }

    for (const [roleName, rolePermissions] of Object.entries(grants)) {
      if (roleName !== 'EMPLOYEE') {
        await queryRunner.query(
          `INSERT INTO "roles" ("name", "display_name", "description", "company_id", "is_system_generated")
           SELECT $1::varchar, $2::varchar, $3::text, company."id", true
           FROM "companies" company
           WHERE NOT EXISTS (
             SELECT 1 FROM "roles" existing
             WHERE existing."company_id" = company."id" AND existing."name" = $1::varchar
           )`,
          [
            roleName,
            roleName === 'FINANCE' ? 'Finance' : 'Management',
            roleName === 'FINANCE'
              ? 'Processes payroll, staff loan deductions and repayments, and salary payment reports.'
              : 'Company-wide read-only access to management dashboards, performance summaries, productivity, and reports.',
          ],
        );
      }

      await queryRunner.query(
        `INSERT INTO "permission_role" ("rolesId", "permissionsId")
         SELECT role."id", permission."id"
         FROM "roles" role
         JOIN "permissions" permission ON permission."name" = ANY($2::text[])
         WHERE role."name" = $1 AND role."company_id" IS NOT NULL
         ON CONFLICT DO NOTHING`,
        [roleName, rolePermissions],
      );
    }
  }

  async down(): Promise<void> {
    // Keep role grants on rollback to avoid removing access configured after deployment.
  }
}
