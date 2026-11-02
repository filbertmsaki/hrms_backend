import { MigrationInterface, QueryRunner } from 'typeorm';

export class AssignStartingSalaryApprovers1796100000000 implements MigrationInterface {
  name = 'AssignStartingSalaryApprovers1796100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_compensation_versions"
      ADD COLUMN "assigned_approver_company_user_id" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_compensation_versions"
      ADD CONSTRAINT "FK_compensation_assigned_approver"
      FOREIGN KEY ("assigned_approver_company_user_id")
      REFERENCES "company_users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_compensation_assigned_approver"
      ON "employee_compensation_versions" ("assigned_approver_company_user_id", "status")
    `);
    await queryRunner.query(`
      INSERT INTO "permissions" ("name", "display_name", "description", "scope", "is_system_generated", "created_at", "updated_at")
      VALUES (
        'payroll:salary:approve',
        'Approve starting salaries',
        'Allow independently reviewing and approving assigned starting salaries',
        'company',
        false,
        now(),
        now()
      )
      ON CONFLICT ("name") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "permission_role" ("rolesId", "permissionsId")
      SELECT DISTINCT role_profile."rolesId", salary_permission."id"
      FROM "permission_role" role_profile
      INNER JOIN "permissions" profile_permission
        ON profile_permission."id" = role_profile."permissionsId"
      CROSS JOIN "permissions" salary_permission
      WHERE profile_permission."name" = 'payroll:profiles'
        AND salary_permission."name" = 'payroll:salary:approve'
      ON CONFLICT ("rolesId", "permissionsId") DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "permission_role"
      WHERE "permissionsId" IN (
        SELECT "id" FROM "permissions" WHERE "name" = 'payroll:salary:approve'
      )
    `);
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "name" = 'payroll:salary:approve'`,
    );
    await queryRunner.query(`DROP INDEX "IDX_compensation_assigned_approver"`);
    await queryRunner.query(`
      ALTER TABLE "employee_compensation_versions"
      DROP CONSTRAINT "FK_compensation_assigned_approver"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_compensation_versions"
      DROP COLUMN "assigned_approver_company_user_id"
    `);
  }
}
