import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Composite indexes for the Processing Exceptions list: it always filters by
 * company, usually by one day and status, and sorts by newest first.
 */
export class AttendanceExceptionListIndexes1797900214000 implements MigrationInterface {
  name = 'AttendanceExceptionListIndexes1797900214000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE INDEX IF NOT EXISTS "IDX_attendance_processing_exceptions_company_date_status" ON "attendance_processing_exceptions" ("company_id", "attendance_date", "status")',
    );
    await q.query(
      'CREATE INDEX IF NOT EXISTS "IDX_attendance_processing_exceptions_company_created" ON "attendance_processing_exceptions" ("company_id", "created_at")',
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'DROP INDEX IF EXISTS "IDX_attendance_processing_exceptions_company_created"',
    );
    await q.query(
      'DROP INDEX IF EXISTS "IDX_attendance_processing_exceptions_company_date_status"',
    );
  }
}
