import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Four independent attendance status dimensions on daily summaries:
 * primary_status, punch_status, arrival_status, departure_status (+ the
 * provisional-presence flag and leave type name).
 *
 * The legacy composite attendance_status column is NOT changed — payroll,
 * leave and existing reports keep reading it.
 *
 * Historical rows are backfilled from the stored values only (no
 * recalculation, so payroll-locked figures are untouched). Arrival/departure
 * reuse the stored late/early minutes; early arrival and late departure
 * (15-minute tolerance) compare against the stored schedule. A normal
 * attendance recalculation later replaces these with the engine's values.
 */
export class AttendanceStatusDimensions1797900222000 implements MigrationInterface {
  name = 'AttendanceStatusDimensions1797900222000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "attendance_daily_summaries"
        ADD COLUMN IF NOT EXISTS "primary_status" varchar(40) NULL,
        ADD COLUMN IF NOT EXISTS "punch_status" varchar(40) NULL,
        ADD COLUMN IF NOT EXISTS "arrival_status" varchar(40) NULL,
        ADD COLUMN IF NOT EXISTS "departure_status" varchar(40) NULL,
        ADD COLUMN IF NOT EXISTS "is_provisional" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "leave_type_name" varchar(150) NULL
    `);

    // Effective legacy status: a manual correction without override keeps
    // the status recalculated from the corrected punches in flags.
    await q.query(`
      WITH base AS (
        SELECT
          s.id,
          s.check_in_at,
          s.check_out_at,
          s.schedule_start_at,
          s.schedule_end_at,
          s.late_minutes,
          s.early_departure_minutes,
          CASE
            WHEN s.attendance_status = 'MANUAL_CORRECTION'
              THEN COALESCE(s.flags::jsonb ->> 'recalculatedStatus', 'PRESENT')
            ELSE s.attendance_status
          END AS legacy,
          COALESCE(s.remarks::jsonb, '[]'::jsonb) AS remarks,
          COALESCE((s.flags::jsonb ->> 'attendanceExempt')::boolean, false) AS exempt,
          COALESCE((s.flags::jsonb ->> 'requiresCheckout')::boolean, true) AS requires_checkout,
          (s.check_in_at IS NOT NULL OR s.check_out_at IS NOT NULL) AS has_punch
        FROM "attendance_daily_summaries" s
        WHERE s.primary_status IS NULL
      ),
      primary_calc AS (
        SELECT b.*,
          CASE
            WHEN b.legacy IN ('LEAVE','SICK_LEAVE','ANNUAL_LEAVE','UNPAID_LEAVE') THEN 'LEAVE'
            WHEN b.legacy IN ('BUSINESS_TRIP','OFFICIAL_DUTY') THEN 'OFFICIAL_DUTY'
            WHEN b.legacy = 'HOLIDAY' THEN 'HOLIDAY'
            WHEN b.legacy = 'OFF_DAY' THEN 'OFF_DAY'
            WHEN b.legacy = 'NO_SHIFT_SCHEDULE' THEN 'NO_SHIFT_SCHEDULE'
            WHEN b.legacy = 'NOT_TRACKED' THEN 'NOT_APPLICABLE'
            WHEN b.legacy = 'HALF_DAY' THEN 'HALF_DAY'
            WHEN b.legacy IN ('PRESENT','LATE','EARLY_DEPARTURE','LATE_AND_EARLY_DEPARTURE','OVERTIME','OFF_DAY_PRESENT') THEN 'PRESENT'
            WHEN b.legacy = 'ABSENT' THEN 'ABSENT'
            ELSE 'UNDETERMINED'
          END AS p
        FROM base b
      ),
      dims AS (
        SELECT c.*,
          (NOT c.has_punch AND c.p IN ('LEAVE','OFFICIAL_DUTY','OFF_DAY','HOLIDAY','NOT_APPLICABLE','NO_SHIFT_SCHEDULE')) AS not_required,
          CASE
            WHEN NOT c.has_punch AND c.p IN ('LEAVE','OFFICIAL_DUTY','OFF_DAY','HOLIDAY','NOT_APPLICABLE','NO_SHIFT_SCHEDULE') THEN 'NOT_REQUIRED'
            WHEN c.remarks ? 'INVALID_PUNCH_SEQUENCE' OR c.remarks ? 'CHECK_IN_OUT_SAME_TIME' THEN 'INVALID'
            WHEN c.check_in_at IS NOT NULL AND c.check_out_at IS NOT NULL THEN 'COMPLETE'
            WHEN c.check_in_at IS NOT NULL AND NOT c.requires_checkout THEN 'COMPLETE'
            WHEN c.check_in_at IS NOT NULL THEN 'MISSING_CHECK_OUT'
            WHEN c.check_out_at IS NOT NULL THEN 'MISSING_CHECK_IN'
            WHEN c.exempt THEN 'NOT_REQUIRED'
            ELSE 'MISSING_BOTH'
          END AS punch
        FROM primary_calc c
      )
      UPDATE "attendance_daily_summaries" t SET
        primary_status = d.p,
        punch_status = d.punch,
        arrival_status = CASE
          WHEN d.not_required OR d.exempt THEN 'NOT_APPLICABLE'
          WHEN d.check_in_at IS NULL THEN 'UNKNOWN'
          WHEN d.schedule_start_at IS NULL THEN 'NOT_APPLICABLE'
          WHEN d.late_minutes > 0 THEN 'LATE'
          WHEN d.check_in_at < d.schedule_start_at THEN 'EARLY_ARRIVAL'
          ELSE 'ON_TIME'
        END,
        departure_status = CASE
          WHEN d.not_required OR d.exempt THEN 'NOT_APPLICABLE'
          WHEN d.check_out_at IS NULL THEN 'UNKNOWN'
          WHEN d.schedule_end_at IS NULL THEN 'NOT_APPLICABLE'
          WHEN d.early_departure_minutes > 0 THEN 'EARLY_DEPARTURE'
          WHEN d.check_out_at > d.schedule_end_at + interval '15 minutes' THEN 'LATE_DEPARTURE'
          ELSE 'ON_TIME'
        END,
        is_provisional = (d.p IN ('PRESENT','HALF_DAY') AND d.punch NOT IN ('COMPLETE','NOT_REQUIRED'))
      FROM dims d
      WHERE t.id = d.id
    `);

    // Leave type name from the approved leave covering the date.
    await q.query(`
      UPDATE "attendance_daily_summaries" s
      SET leave_type_name = lt.name
      FROM "leave_requests" lr
      JOIN "leave_types" lt ON lt.id = lr.leave_type_id
      WHERE s.primary_status = 'LEAVE'
        AND s.leave_type_name IS NULL
        AND lr.company_id = s.company_id
        AND lr.employee_id = s.employee_id
        AND lr.status = 'approved'
        AND lr.start_date <= s.attendance_date
        AND lr.end_date >= s.attendance_date
    `);

    for (const column of [
      'primary_status',
      'punch_status',
      'arrival_status',
      'departure_status',
    ]) {
      await q.query(
        `CREATE INDEX IF NOT EXISTS "IDX_attendance_daily_summaries_${column}" ON "attendance_daily_summaries" ("${column}")`,
      );
    }
  }

  async down(q: QueryRunner): Promise<void> {
    for (const column of [
      'primary_status',
      'punch_status',
      'arrival_status',
      'departure_status',
    ]) {
      await q.query(
        `DROP INDEX IF EXISTS "IDX_attendance_daily_summaries_${column}"`,
      );
    }
    await q.query(`
      ALTER TABLE "attendance_daily_summaries"
        DROP COLUMN IF EXISTS "leave_type_name",
        DROP COLUMN IF EXISTS "is_provisional",
        DROP COLUMN IF EXISTS "departure_status",
        DROP COLUMN IF EXISTS "arrival_status",
        DROP COLUMN IF EXISTS "punch_status",
        DROP COLUMN IF EXISTS "primary_status"
    `);
  }
}
