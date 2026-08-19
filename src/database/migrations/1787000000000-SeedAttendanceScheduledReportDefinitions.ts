import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedAttendanceScheduledReportDefinitions1787000000000 implements MigrationInterface {
  name = 'SeedAttendanceScheduledReportDefinitions1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "report_definitions"
        ("report_code", "name", "description", "supported_filters", "supported_formats", "generator_service", "is_active")
      VALUES
        (
          'MORNING_ATTENDANCE',
          'Morning Attendance Report',
          'Morning snapshot of who has checked in, who is late, and who has not yet checked in for the day.',
          '{"branch_id": "number", "department_id": "number"}'::jsonb,
          ARRAY['XLSX','CSV']::report_output_format_enum[],
          'MorningAttendanceReportRunner',
          true
        ),
        (
          'END_OF_DAY_ATTENDANCE',
          'End of Day Attendance Report',
          'End-of-day attendance snapshot summarizing check-ins, check-outs, absences, and exceptions for the day.',
          '{"branch_id": "number", "department_id": "number"}'::jsonb,
          ARRAY['XLSX','CSV']::report_output_format_enum[],
          'EndOfDayAttendanceReportRunner',
          true
        )
      ON CONFLICT (report_code) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "report_definitions"
      WHERE "report_code" IN ('MORNING_ATTENDANCE', 'END_OF_DAY_ATTENDANCE')
    `);
  }
}
