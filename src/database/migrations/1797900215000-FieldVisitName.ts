import { MigrationInterface, QueryRunner } from 'typeorm';

export class FieldVisitName1797900215000 implements MigrationInterface {
  name = 'FieldVisitName1797900215000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "field_visit_plan_items" ADD COLUMN IF NOT EXISTS "visit_name" varchar(200)',
    );
    await queryRunner.query(
      'ALTER TABLE "field_visits" ADD COLUMN IF NOT EXISTS "visit_name" varchar(200)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "field_visits" DROP COLUMN IF EXISTS "visit_name"',
    );
    await queryRunner.query(
      'ALTER TABLE "field_visit_plan_items" DROP COLUMN IF EXISTS "visit_name"',
    );
  }
}
