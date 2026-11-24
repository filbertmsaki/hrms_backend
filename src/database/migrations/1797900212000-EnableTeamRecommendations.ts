import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnableTeamRecommendations1797900212000 implements MigrationInterface {
  name = 'EnableTeamRecommendations1797900212000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "team_recommendations" (
        "id" SERIAL PRIMARY KEY,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "employee_id" integer NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
        "submitted_by_company_user_id" integer NOT NULL REFERENCES "company_users"("id") ON DELETE RESTRICT,
        "recommendation_type" varchar(24) NOT NULL,
        "rationale" text NOT NULL,
        "proposal" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "proposed_effective_date" date NULL,
        "status" varchar(16) NOT NULL DEFAULT 'SUBMITTED',
        "reviewed_by_company_user_id" integer NULL REFERENCES "company_users"("id") ON DELETE SET NULL,
        "reviewed_at" timestamptz NULL,
        "reviewer_comment" text NULL,
        "revises_id" integer UNIQUE REFERENCES team_recommendations(id) ON DELETE RESTRICT,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_team_recommendations_type"
          CHECK ("recommendation_type" IN ('PROMOTION', 'TRANSFER', 'DISCIPLINARY')),
        CONSTRAINT "CHK_team_recommendations_status"
          CHECK ("status" IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'RETURNED', 'WITHDRAWN'))
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_team_recommendations_queue" ON "team_recommendations" ("company_id", "status", "employee_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_team_recommendations_author" ON "team_recommendations" ("company_id", "submitted_by_company_user_id")',
    );
    await queryRunner.query(`INSERT INTO permissions (name, display_name, description, scope, is_system_generated) VALUES
      ('manager_recommendations:submit','Submit team recommendations','Propose promotion, transfer or disciplinary review for reporting employees','company',true),
      ('manager_recommendations:review','Review manager recommendations','Review team recommendations within the assigned employee scope','company',true)
      ON CONFLICT (name) DO NOTHING`);
    await queryRunner.query(`INSERT INTO permission_role ("rolesId","permissionsId")
      SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.company_id IS NOT NULL AND r.is_system_generated AND
      ((p.name='manager_recommendations:submit' AND r.name IN ('COMPANY_ADMIN','HR_MANAGER','DEPARTMENT_MANAGER','BRANCH_MANAGER'))
      OR (p.name='manager_recommendations:review' AND r.name IN ('COMPANY_ADMIN','HR_MANAGER'))) ON CONFLICT DO NOTHING`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Older application versions cannot read the live table. Preserve submitted HR records on rollback.
    const ids =
      "SELECT id FROM permissions WHERE name IN ('manager_recommendations:submit','manager_recommendations:review')";
    await queryRunner.query(
      `DELETE FROM permission_role WHERE "permissionsId" IN (${ids})`,
    );
    await queryRunner.query(
      `DELETE FROM permission_user WHERE "permissionsId" IN (${ids})`,
    );
    await queryRunner.query(
      `DELETE FROM company_user_permissions WHERE permission_id IN (${ids})`,
    );
    await queryRunner.query(`DELETE FROM permissions WHERE id IN (${ids})`);
  }
}
