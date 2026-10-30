import { MigrationInterface, QueryRunner } from 'typeorm';

/** Ensure every company Employee role can access only its owner's published payslips. */
export class BackfillEmployeePayslipSelfPermission1796600000000 implements MigrationInterface {
  name = 'BackfillEmployeePayslipSelfPermission1796600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "permissions" ("name", "display_name", "description", "scope", "is_system_generated")
       VALUES ($1, $2, $3, 'company', true)
       ON CONFLICT ("name") DO NOTHING`,
      [
        'payroll:payslips:self',
        'View own payslips',
        'Allows an employee to view and download only their own published payslips.',
      ],
    );

    await queryRunner.query(
      `INSERT INTO "permission_role" ("rolesId", "permissionsId")
       SELECT role."id", permission."id"
       FROM "roles" role
       JOIN "permissions" permission
         ON permission."name" = 'payroll:payslips:self'
       WHERE UPPER(role."name") = 'EMPLOYEE'
         AND role."company_id" IS NOT NULL
       ON CONFLICT DO NOTHING`,
    );
  }

  async down(): Promise<void> {
    // Preserve the self-service grant on rollback so existing employees do not lose access.
  }
}
