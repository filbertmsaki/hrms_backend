import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDepartmentPositions1789000000000 implements MigrationInterface {
  name = 'CreateDepartmentPositions1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "department_positions" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "department_id" integer NOT NULL,
        "position_id" integer NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_department_positions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_department_position_company_department_position"
          UNIQUE ("company_id", "department_id", "position_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_department_position_company"
      ON "department_positions" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_department_position_department"
      ON "department_positions" ("department_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_department_position_position"
      ON "department_positions" ("position_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "department_positions"
      ADD CONSTRAINT "FK_department_positions_company"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "department_positions"
      ADD CONSTRAINT "FK_department_positions_department"
      FOREIGN KEY ("department_id") REFERENCES "departments"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "department_positions"
      ADD CONSTRAINT "FK_department_positions_position"
      FOREIGN KEY ("position_id") REFERENCES "positions"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "department_positions"
      DROP CONSTRAINT "FK_department_positions_position"
    `);
    await queryRunner.query(`
      ALTER TABLE "department_positions"
      DROP CONSTRAINT "FK_department_positions_department"
    `);
    await queryRunner.query(`
      ALTER TABLE "department_positions"
      DROP CONSTRAINT "FK_department_positions_company"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_department_position_position"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."IDX_department_position_department"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."IDX_department_position_company"
    `);
    await queryRunner.query(`DROP TABLE "department_positions"`);
  }
}
