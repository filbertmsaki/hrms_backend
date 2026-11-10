import { MigrationInterface, QueryRunner } from 'typeorm';

const PERMISSION = 'self_service_requests:manager_review';

/**
 * Line and department managers review attendance corrections and profile
 * updates for their own team but never held a permission that reached the
 * approval endpoints. Grant it to every role that can open the manager team
 * workspace, which covers DEPARTMENT_MANAGER, BRANCH_MANAGER and custom
 * manager roles.
 */
export class AddSelfServiceManagerReviewPermission1797300000000 implements MigrationInterface {
  name = 'AddSelfServiceManagerReviewPermission1797300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "permissions" ("name", "display_name", "description", "scope", "is_system_generated")
       VALUES ($1, $2, $3, 'company', true)
       ON CONFLICT ("name") DO NOTHING`,
      [
        PERMISSION,
        'Review team self-service requests',
        'Allow line and department managers to review attendance correction and profile update requests from their own team',
      ],
    );

    await queryRunner.query(
      `INSERT INTO "permission_role" ("rolesId", "permissionsId")
       SELECT DISTINCT role."id", permission."id"
       FROM "roles" role
       JOIN "permission_role" granted ON granted."rolesId" = role."id"
       JOIN "permissions" manager_permission
         ON manager_permission."id" = granted."permissionsId"
        AND manager_permission."name" = 'manager_team:read'
       JOIN "permissions" permission ON permission."name" = $1
       WHERE role."company_id" IS NOT NULL
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
