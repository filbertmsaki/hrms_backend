import { MigrationInterface, QueryRunner } from 'typeorm';

const PERMISSION = 'self_service_requests:manager_review';

/**
 * 1797300000000 granted manager_review to roles holding manager_team:read.
 * Older company role rows for DEPARTMENT_MANAGER / BRANCH_MANAGER predate that
 * permission, so grant by role name as well.
 */
export class GrantManagerReviewToManagerRoles1797400000000 implements MigrationInterface {
  name = 'GrantManagerReviewToManagerRoles1797400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "permission_role" ("rolesId", "permissionsId")
       SELECT role."id", permission."id"
       FROM "roles" role
       JOIN "permissions" permission ON permission."name" = $1
       WHERE UPPER(role."name") IN ('DEPARTMENT_MANAGER', 'BRANCH_MANAGER')
         AND role."company_id" IS NOT NULL
       ON CONFLICT DO NOTHING`,
      [PERMISSION],
    );
  }

  async down(): Promise<void> {
    // 1797300000000 owns the permission; its down() removes every grant.
  }
}
