import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayrollStatutoryApprovalPermission1793200000000 implements MigrationInterface {
  name = 'AddPayrollStatutoryApprovalPermission1793200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" (
        "name", "display_name", "description", "scope", "is_system_generated"
      )
      SELECT
        'payroll:statutory:approve',
        'Approve statutory payroll rules',
        'Allow authorized Finance approvers to approve sourced statutory payroll rule versions',
        'company',
        true
      WHERE NOT EXISTS (
        SELECT 1 FROM "permissions" WHERE "name" = 'payroll:statutory:approve'
      )
    `);
    await queryRunner.query(`
      INSERT INTO "permission_role" ("rolesId", "permissionsId")
      SELECT role."id", permission."id"
      FROM "roles" role
      JOIN "permissions" permission
        ON permission."name" = 'payroll:statutory:approve'
      WHERE role."name" = 'COMPANY_ADMIN'
        AND role."company_id" IS NOT NULL
        AND role."is_system_generated" = true
      ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "permission_role"
      WHERE "permissionsId" IN (
        SELECT "id" FROM "permissions" WHERE "name" = 'payroll:statutory:approve'
      )
    `);
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "name" = 'payroll:statutory:approve'`,
    );
  }
}
