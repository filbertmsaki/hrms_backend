import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceScorecardConfigs1789400000000 implements MigrationInterface {
  name = 'AddPerformanceScorecardConfigs1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "performance_scorecard_configs" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "code" varchar(80) NOT NULL,
        "name" varchar(160) NOT NULL,
        "description" text,
        "is_default" boolean NOT NULL DEFAULT false,
        "status" varchar(30) NOT NULL DEFAULT 'ACTIVE',
        "effective_from" date,
        "effective_to" date,
        "components" jsonb NOT NULL,
        "created_by_company_user_id" integer,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_performance_scorecard_configs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_performance_scorecard_company_code" UNIQUE ("company_id", "code"),
        CONSTRAINT "CHK_performance_scorecard_effective_dates" CHECK ("effective_to" IS NULL OR "effective_from" IS NULL OR "effective_to" >= "effective_from")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_performance_scorecard_company_status_default"
       ON "performance_scorecard_configs" ("company_id", "status", "is_default")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_performance_scorecard_company_status_default"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "performance_scorecard_configs"`,
    );
  }
}
