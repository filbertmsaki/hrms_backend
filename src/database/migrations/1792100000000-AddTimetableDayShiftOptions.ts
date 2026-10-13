import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTimetableDayShiftOptions1792100000000 implements MigrationInterface {
  name = 'AddTimetableDayShiftOptions1792100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "timetable_day_shift_options" ("id" SERIAL NOT NULL, "timetable_day_id" integer NOT NULL, "shift_id" integer NOT NULL, "priority_order" integer NOT NULL DEFAULT 0, "max_employees" integer, "is_primary" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_timetable_day_shift_options" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_timetable_day_shift_option" ON "timetable_day_shift_options" ("timetable_day_id", "shift_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_timetable_day_shift_options_day_priority" ON "timetable_day_shift_options" ("timetable_day_id", "priority_order")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_timetable_day_shift_options_primary" ON "timetable_day_shift_options" ("timetable_day_id") WHERE "is_primary" = true`,
    );
    await queryRunner.query(
      `ALTER TABLE "timetable_day_shift_options" ADD CONSTRAINT "FK_timetable_day_shift_options_day" FOREIGN KEY ("timetable_day_id") REFERENCES "timetable_days"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "timetable_day_shift_options" ADD CONSTRAINT "FK_timetable_day_shift_options_shift" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `INSERT INTO "timetable_day_shift_options" ("timetable_day_id", "shift_id", "is_primary") SELECT "id", "default_shift_id", true FROM "timetable_days" WHERE "default_shift_id" IS NOT NULL ON CONFLICT DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "timetable_day_shift_options"`);
  }
}
