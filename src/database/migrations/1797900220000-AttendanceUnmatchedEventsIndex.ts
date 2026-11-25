import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Unmatched logs list: events with no employee for a company, newest first.
 * A partial index keeps it small (matched events are excluded).
 */
export class AttendanceUnmatchedEventsIndex1797900220000 implements MigrationInterface {
  name = 'AttendanceUnmatchedEventsIndex1797900220000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE INDEX IF NOT EXISTS "IDX_attendance_processed_events_unmatched" ON "attendance_processed_events" ("company_id", "event_time") WHERE "employee_id" IS NULL',
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'DROP INDEX IF EXISTS "IDX_attendance_processed_events_unmatched"',
    );
  }
}
