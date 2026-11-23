import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScopeHolidayCalendarEntries1797900208000 implements MigrationInterface {
  name = 'ScopeHolidayCalendarEntries1797900208000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "attendance_holidays" ADD COLUMN "import_country_code" varchar(2)
      CHECK ("import_country_code" IS NULL OR ("branch_id" IS NULL AND "import_country_code" IN ('TZ','KE','UG')))`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_holiday_company_date" ON "attendance_holidays" ("holiday_group_id","name","date") WHERE "branch_id" IS NULL`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_holiday_branch_date" ON "attendance_holidays" ("holiday_group_id","branch_id","name","date") WHERE "branch_id" IS NOT NULL`,
    );
    await q.query('DROP INDEX "UQ_attendance_holidays_group_name_date"');
  }

  async down(q: QueryRunner): Promise<void> {
    // Restore the older constraint first so a scope collision aborts without losing records.
    await q.query(
      `CREATE UNIQUE INDEX "UQ_attendance_holidays_group_name_date" ON "attendance_holidays" ("holiday_group_id","name","date")`,
    );
    await q.query('DROP INDEX "UQ_holiday_branch_date"');
    await q.query('DROP INDEX "UQ_holiday_company_date"');
    await q.query(
      'ALTER TABLE "attendance_holidays" DROP COLUMN "import_country_code"',
    );
  }
}
