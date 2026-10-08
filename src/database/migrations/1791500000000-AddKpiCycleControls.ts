import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKpiCycleControls1791500000000 implements MigrationInterface {
  name = 'AddKpiCycleControls1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."performance_period_type_enum" ADD VALUE IF NOT EXISTS 'CUSTOM'`,
    );
    await queryRunner.query(`ALTER TABLE "performance_periods"
      ADD COLUMN "kpi_phase" varchar(32),
      ADD COLUMN "goal_setting_deadline" date,
      ADD COLUMN "mid_cycle_review_date" date,
      ADD COLUMN "final_review_deadline" date,
      ADD COLUMN "allow_parallel" boolean NOT NULL DEFAULT true,
      ADD COLUMN "max_weightage" decimal(7,2) NOT NULL DEFAULT 100,
      ADD COLUMN "score_cap" decimal(7,2) NOT NULL DEFAULT 120,
      ADD COLUMN "cooling_period_days" integer NOT NULL DEFAULT 0,
      ADD COLUMN "kpi_reopen_reason" text`);
    await queryRunner.query(`INSERT INTO "permissions" ("name", "display_name", "description", "scope", "is_system_generated", "created_at", "updated_at") VALUES
      ('performance_kpis:assign', 'Assign team KPIs', 'Assign KPIs within reporting scope', 'company', true, now(), now()),
      ('performance_periods:reopen', 'Reopen KPI cycles', 'Reopen locked KPI cycles with a reason', 'company', true, now(), now())
      ON CONFLICT ("name") DO NOTHING`);
    await queryRunner.query(`INSERT INTO "permission_role" ("rolesId", "permissionsId")
      SELECT existing."rolesId", target.id
      FROM "permission_role" existing
      JOIN "permissions" source ON source.id = existing."permissionsId" AND source.name = 'performance_kpis:review'
      JOIN "permissions" target ON target.name = 'performance_kpis:assign'
      WHERE EXISTS (
        SELECT 1 FROM "permission_role" team
        JOIN "permissions" team_permission ON team_permission.id = team."permissionsId"
        WHERE team."rolesId" = existing."rolesId" AND team_permission.name = 'performance_kpis:team:read'
      )
      ON CONFLICT DO NOTHING`);
    await queryRunner.query(`INSERT INTO "permission_role" ("rolesId", "permissionsId")
      SELECT existing."rolesId", target.id
      FROM "permission_role" existing
      JOIN "permissions" source ON source.id = existing."permissionsId" AND source.name = 'performance_kpis:all:read'
      JOIN "permissions" target ON target.name = 'performance_periods:reopen'
      WHERE EXISTS (
        SELECT 1 FROM "permission_role" cycle
        JOIN "permissions" cycle_permission ON cycle_permission.id = cycle."permissionsId"
        WHERE cycle."rolesId" = existing."rolesId" AND cycle_permission.name = 'performance_periods:close'
      )
      ON CONFLICT DO NOTHING`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "performance_periods"
      DROP COLUMN "kpi_reopen_reason",
      DROP COLUMN "cooling_period_days",
      DROP COLUMN "score_cap",
      DROP COLUMN "max_weightage",
      DROP COLUMN "allow_parallel",
      DROP COLUMN "final_review_deadline",
      DROP COLUMN "mid_cycle_review_date",
      DROP COLUMN "goal_setting_deadline",
      DROP COLUMN "kpi_phase"`);
  }
}
