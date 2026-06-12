import { MigrationInterface, QueryRunner } from 'typeorm';

export class UnifyLeaveAndAttendanceHolidays1785420300004
  implements MigrationInterface
{
  name = 'UnifyLeaveAndAttendanceHolidays1785420300004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasAttendanceHolidays = await queryRunner.hasTable('attendance_holidays');
    if (!hasAttendanceHolidays) {
      return;
    }

    const hasRecurringColumn = await queryRunner.hasColumn(
      'attendance_holidays',
      'is_recurring',
    );
    if (!hasRecurringColumn) {
      await queryRunner.query(
        "ALTER TABLE `attendance_holidays` ADD COLUMN `is_recurring` tinyint NOT NULL DEFAULT 0 AFTER `date`",
      );
    }

    const hasHolidayGroups = await queryRunner.hasTable('holiday_groups');
    const hasLegacyHolidays = await queryRunner.hasTable('holidays');
    if (!hasHolidayGroups || !hasLegacyHolidays) {
      return;
    }

    await queryRunner.query(
      `INSERT INTO \`holiday_groups\` (\`company_id\`, \`name\`, \`description\`, \`created_at\`, \`updated_at\`)
       SELECT distinctCompanies.company_id,
              'General Holidays',
              'Shared holiday definitions used by leave and attendance.',
              CURRENT_TIMESTAMP(6),
              CURRENT_TIMESTAMP(6)
       FROM (
         SELECT DISTINCT \`company_id\`
         FROM \`holidays\`
       ) distinctCompanies
       LEFT JOIN \`holiday_groups\` existingGroup
         ON existingGroup.company_id = distinctCompanies.company_id
        AND existingGroup.name = 'General Holidays'
       WHERE existingGroup.id IS NULL`,
    );

    await queryRunner.query(
      `INSERT INTO \`attendance_holidays\` (
          \`company_id\`,
          \`holiday_group_id\`,
          \`name\`,
          \`date\`,
          \`is_recurring\`,
          \`type\`,
          \`is_paid\`,
          \`affects_overtime\`,
          \`counts_as_working_day\`,
          \`branch_id\`,
          \`created_at\`,
          \`updated_at\`
        )
        SELECT legacyHoliday.company_id,
               generalGroup.id,
               legacyHoliday.name,
               legacyHoliday.holiday_date,
               legacyHoliday.is_recurring,
               'COMPANY',
               1,
               0,
               0,
               NULL,
               legacyHoliday.created_at,
               CURRENT_TIMESTAMP(6)
        FROM \`holidays\` legacyHoliday
        INNER JOIN \`holiday_groups\` generalGroup
          ON generalGroup.company_id = legacyHoliday.company_id
         AND generalGroup.name = 'General Holidays'
        LEFT JOIN \`attendance_holidays\` existingHoliday
          ON existingHoliday.company_id = legacyHoliday.company_id
         AND existingHoliday.holiday_group_id = generalGroup.id
         AND existingHoliday.name = legacyHoliday.name
         AND existingHoliday.date = legacyHoliday.holiday_date
        WHERE existingHoliday.id IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasAttendanceHolidays = await queryRunner.hasTable('attendance_holidays');
    const hasLegacyHolidays = await queryRunner.hasTable('holidays');

    if (hasAttendanceHolidays && hasLegacyHolidays) {
      await queryRunner.query(
        `INSERT INTO \`holidays\` (\`company_id\`, \`name\`, \`holiday_date\`, \`is_recurring\`, \`created_at\`)
         SELECT attendanceHoliday.company_id,
                attendanceHoliday.name,
                attendanceHoliday.date,
                attendanceHoliday.is_recurring,
                attendanceHoliday.created_at
         FROM \`attendance_holidays\` attendanceHoliday
         WHERE attendanceHoliday.branch_id IS NULL
           AND NOT EXISTS (
             SELECT 1
             FROM \`holidays\` legacyHoliday
             WHERE legacyHoliday.company_id = attendanceHoliday.company_id
               AND legacyHoliday.name = attendanceHoliday.name
               AND legacyHoliday.holiday_date = attendanceHoliday.date
           )`,
      );
    }

    if (
      hasAttendanceHolidays &&
      (await queryRunner.hasColumn('attendance_holidays', 'is_recurring'))
    ) {
      await queryRunner.query(
        'ALTER TABLE `attendance_holidays` DROP COLUMN `is_recurring`',
      );
    }
  }
}
