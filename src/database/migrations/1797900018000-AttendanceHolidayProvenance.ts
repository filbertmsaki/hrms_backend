import { MigrationInterface, QueryRunner } from 'typeorm';

/** Provisional flag, jurisdiction and seed key so reseeding never overwrites HR edits. */
export class AttendanceHolidayProvenance1797900018000 implements MigrationInterface {
  name = 'AttendanceHolidayProvenance1797900018000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "attendance_holidays"
      ADD COLUMN "is_provisional" boolean NOT NULL DEFAULT false,
      ADD COLUMN "jurisdiction" varchar(20) NULL CHECK ("jurisdiction" IS NULL OR "jurisdiction" IN ('mainland','zanzibar')),
      ADD COLUMN "seed_key" varchar(100) NULL`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_attendance_holidays_company_seed_key" ON "attendance_holidays" ("company_id", "seed_key") WHERE "seed_key" IS NOT NULL`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX "UQ_attendance_holidays_company_seed_key"');
    await q.query(`ALTER TABLE "attendance_holidays" DROP COLUMN "seed_key", DROP COLUMN "jurisdiction", DROP COLUMN "is_provisional"`);
  }
}
