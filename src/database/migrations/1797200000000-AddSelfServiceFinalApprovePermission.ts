import { MigrationInterface, QueryRunner } from 'typeorm';

const PERMISSION = 'self_service_requests:final_approve';

/**
 * HR final approval of attendance corrections and profile updates was keyed
 * on role names. Grant the new permission to the roles that held that power.
 */
export class AddSelfServiceFinalApprovePermission1797200000000 implements MigrationInterface {
  name = 'AddSelfServiceFinalApprovePermission1797200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "permissions" ("name", "display_name", "description", "scope", "is_system_generated")
       VALUES ($1, $2, $3, 'company', true)
       ON CONFLICT ("name") DO NOTHING`,
      [
        PERMISSION,
        'Final-approve self-service requests',
        'Allow HR to see all attendance correction and profile update requests and give final approval, including before manager review',
      ],
    );

    await queryRunner.query(
      `INSERT INTO "permission_role" ("rolesId", "permissionsId")
       SELECT role."id", permission."id"
       FROM "roles" role
       JOIN "permissions" permission ON permission."name" = $1
       WHERE UPPER(role."name") IN ('COMPANY_ADMIN', 'HR_MANAGER', 'HR_OFFICER')
         AND role."company_id" IS NOT NULL
       ON CONFLICT DO NOTHING`,
      [PERMISSION],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "permission_role"
       WHERE "permissionsId" IN (SELECT "id" FROM "permissions" WHERE "name" = $1)`,
      [PERMISSION],
    );
    await queryRunner.query(`DELETE FROM "permissions" WHERE "name" = $1`, [
      PERMISSION,
    ]);
  }
}
