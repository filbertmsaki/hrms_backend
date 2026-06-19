import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class FinalizeAttendanceCentralization1781820000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(
      queryRunner,
      'attendance_policies',
      new TableColumn({
        name: 'overtime_start_after_minutes',
        type: 'int',
        default: '0',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'attendance_policies',
      new TableColumn({
        name: 'max_overtime_minutes_per_day',
        type: 'int',
        default: '0',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'attendance_policies',
      new TableColumn({
        name: 'max_overtime_minutes_per_month',
        type: 'int',
        default: '0',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'attendance_policies',
      new TableColumn({
        name: 'overtime_rate_multiplier',
        type: 'decimal',
        precision: 5,
        scale: 2,
        default: '1.00',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'attendance_policies',
      new TableColumn({
        name: 'holiday_overtime_multiplier',
        type: 'decimal',
        precision: 5,
        scale: 2,
        default: '1.00',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'attendance_policies',
      new TableColumn({
        name: 'weekend_overtime_multiplier',
        type: 'decimal',
        precision: 5,
        scale: 2,
        default: '1.00',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'attendance_policies',
      new TableColumn({
        name: 'overtime_requires_approval',
        type: 'tinyint',
        default: '0',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'attendance_policies',
      new TableColumn({
        name: 'overtime_auto_calculate',
        type: 'tinyint',
        default: '1',
      }),
    );

    await this.addColumnIfMissing(
      queryRunner,
      'shifts',
      new TableColumn({
        name: 'half_day_after_minutes',
        type: 'int',
        default: '0',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'shifts',
      new TableColumn({
        name: 'absent_after_minutes',
        type: 'int',
        default: '0',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'shifts',
      new TableColumn({
        name: 'allow_multiple_checkin',
        type: 'tinyint',
        default: '0',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'shifts',
      new TableColumn({
        name: 'auto_mark_absent',
        type: 'tinyint',
        default: '1',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'shifts',
      new TableColumn({
        name: 'allow_mobile_attendance',
        type: 'tinyint',
        default: '1',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'shifts',
      new TableColumn({
        name: 'allow_remote_attendance',
        type: 'tinyint',
        default: '0',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'shifts',
      new TableColumn({
        name: 'require_geofence',
        type: 'tinyint',
        default: '0',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'shifts',
      new TableColumn({
        name: 'require_biometric',
        type: 'tinyint',
        default: '0',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'shifts',
      new TableColumn({
        name: 'overtime_start_after_minutes',
        type: 'int',
        default: '0',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'shifts',
      new TableColumn({
        name: 'overtime_rate_multiplier',
        type: 'decimal',
        precision: 5,
        scale: 2,
        default: '1.00',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'shifts',
      new TableColumn({
        name: 'weekend_multiplier',
        type: 'decimal',
        precision: 5,
        scale: 2,
        default: '1.00',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'shifts',
      new TableColumn({
        name: 'holiday_multiplier',
        type: 'decimal',
        precision: 5,
        scale: 2,
        default: '1.00',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'shifts',
      new TableColumn({
        name: 'overtime_requires_approval',
        type: 'tinyint',
        default: '0',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'shifts',
      new TableColumn({
        name: 'overtime_auto_calculate',
        type: 'tinyint',
        default: '1',
      }),
    );

    await this.addColumnIfMissing(
      queryRunner,
      'timetables',
      new TableColumn({
        name: 'late_after_minutes',
        type: 'int',
        default: '0',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'timetables',
      new TableColumn({
        name: 'half_day_after_minutes',
        type: 'int',
        default: '0',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'timetables',
      new TableColumn({
        name: 'absent_after_minutes',
        type: 'int',
        default: '0',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'timetables',
      new TableColumn({
        name: 'allow_early_checkin',
        type: 'tinyint',
        default: '1',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'timetables',
      new TableColumn({
        name: 'allow_late_checkout',
        type: 'tinyint',
        default: '1',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'timetables',
      new TableColumn({
        name: 'auto_absent_if_no_checkin',
        type: 'tinyint',
        default: '1',
      }),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'timetables',
      new TableColumn({
        name: 'max_overtime_minutes',
        type: 'int',
        default: '0',
      }),
    );

    if (await queryRunner.hasTable('attendance_settings')) {
      await queryRunner.query(`
        UPDATE \`attendance_policies\` policy
        INNER JOIN (
          SELECT
            company_id,
            COALESCE(MAX(CASE WHEN is_active = 1 THEN id END), MAX(id)) AS target_policy_id
          FROM \`attendance_policies\`
          GROUP BY company_id
        ) policy_target ON policy_target.target_policy_id = policy.id
        LEFT JOIN (
          SELECT s1.*
          FROM \`attendance_settings\` s1
          INNER JOIN (
            SELECT company_id, MAX(id) AS latest_id
            FROM \`attendance_settings\`
            GROUP BY company_id
          ) s2 ON s2.latest_id = s1.id
        ) setting ON setting.company_id = policy.company_id
        SET
          policy.overtime_start_after_minutes = COALESCE(setting.overtime_start_after_minutes, policy.overtime_start_after_minutes),
          policy.max_overtime_minutes_per_day = COALESCE(setting.max_overtime_minutes_per_day, policy.max_overtime_minutes_per_day),
          policy.max_overtime_minutes_per_month = COALESCE(setting.max_overtime_minutes_per_month, policy.max_overtime_minutes_per_month),
          policy.overtime_rate_multiplier = COALESCE(setting.overtime_rate_multiplier, policy.overtime_rate_multiplier),
          policy.holiday_overtime_multiplier = COALESCE(setting.holiday_overtime_multiplier, policy.holiday_overtime_multiplier),
          policy.weekend_overtime_multiplier = COALESCE(setting.weekend_overtime_multiplier, policy.weekend_overtime_multiplier),
          policy.overtime_requires_approval = COALESCE(setting.requires_approval, policy.overtime_requires_approval),
          policy.overtime_auto_calculate = COALESCE(setting.auto_calculate, policy.overtime_auto_calculate)
      `);
    }

    if (
      (await queryRunner.hasTable('shift_attendance_rules')) ||
      (await queryRunner.hasTable('shift_overtime_rules'))
    ) {
      await queryRunner.query(`
        UPDATE \`shifts\` shift_row
        LEFT JOIN \`shift_attendance_rules\` attendance_rule
          ON attendance_rule.shift_id = shift_row.id
        LEFT JOIN \`shift_overtime_rules\` overtime_rule
          ON overtime_rule.shift_id = shift_row.id
        SET
          shift_row.late_after_minutes = COALESCE(NULLIF(shift_row.late_after_minutes, 0), attendance_rule.late_after_minutes, 0),
          shift_row.half_day_after_minutes = COALESCE(attendance_rule.half_day_after_minutes, shift_row.half_day_after_minutes),
          shift_row.absent_after_minutes = COALESCE(attendance_rule.absent_after_minutes, shift_row.absent_after_minutes),
          shift_row.allow_multiple_checkin = COALESCE(attendance_rule.allow_multiple_checkin, shift_row.allow_multiple_checkin),
          shift_row.auto_mark_absent = COALESCE(attendance_rule.auto_mark_absent, shift_row.auto_mark_absent),
          shift_row.allow_mobile_attendance = COALESCE(attendance_rule.allow_mobile_attendance, shift_row.allow_mobile_attendance),
          shift_row.allow_remote_attendance = COALESCE(attendance_rule.allow_remote_attendance, shift_row.allow_remote_attendance),
          shift_row.require_geofence = COALESCE(attendance_rule.require_geofence, shift_row.require_geofence),
          shift_row.require_biometric = COALESCE(attendance_rule.require_biometric, shift_row.require_biometric),
          shift_row.max_overtime_minutes = COALESCE(NULLIF(shift_row.max_overtime_minutes, 0), overtime_rule.max_daily_overtime_minutes, 0),
          shift_row.overtime_start_after_minutes = COALESCE(overtime_rule.overtime_start_after_minutes, shift_row.overtime_start_after_minutes),
          shift_row.overtime_rate_multiplier = COALESCE(overtime_rule.overtime_rate_multiplier, shift_row.overtime_rate_multiplier),
          shift_row.weekend_multiplier = COALESCE(overtime_rule.weekend_multiplier, shift_row.weekend_multiplier),
          shift_row.holiday_multiplier = COALESCE(overtime_rule.holiday_multiplier, shift_row.holiday_multiplier),
          shift_row.overtime_requires_approval = COALESCE(overtime_rule.requires_approval, shift_row.overtime_requires_approval),
          shift_row.overtime_auto_calculate = COALESCE(overtime_rule.auto_calculate, shift_row.overtime_auto_calculate)
      `);
    }

    if (await queryRunner.hasTable('timetable_attendance_rules')) {
      await queryRunner.query(`
        UPDATE \`timetables\` timetable_row
        LEFT JOIN \`timetable_attendance_rules\` attendance_rule
          ON attendance_rule.timetable_id = timetable_row.id
        SET
          timetable_row.late_after_minutes = COALESCE(attendance_rule.late_after_minutes, timetable_row.late_after_minutes),
          timetable_row.half_day_after_minutes = COALESCE(attendance_rule.half_day_after_minutes, timetable_row.half_day_after_minutes),
          timetable_row.absent_after_minutes = COALESCE(attendance_rule.absent_after_minutes, timetable_row.absent_after_minutes),
          timetable_row.allow_early_checkin = COALESCE(attendance_rule.allow_early_checkin, timetable_row.allow_early_checkin),
          timetable_row.allow_late_checkout = COALESCE(attendance_rule.allow_late_checkout, timetable_row.allow_late_checkout),
          timetable_row.auto_absent_if_no_checkin = COALESCE(attendance_rule.auto_absent_if_no_checkin, timetable_row.auto_absent_if_no_checkin),
          timetable_row.max_overtime_minutes = COALESCE(attendance_rule.max_overtime_minutes, timetable_row.max_overtime_minutes)
      `);
    }

    await this.dropTableIfExists(queryRunner, 'attendance_settings');
    await this.dropTableIfExists(queryRunner, 'shift_attendance_rules');
    await this.dropTableIfExists(queryRunner, 'shift_overtime_rules');
    await this.dropTableIfExists(queryRunner, 'timetable_attendance_rules');
    await this.dropTableIfExists(queryRunner, 'timetable_shift_rules');
    await this.dropTableIfExists(queryRunner, 'timetable_generated_schedules');
    await this.dropTableIfExists(queryRunner, 'shift_templates');
    await this.dropTableIfExists(queryRunner, 'shift_change_requests');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`attendance_settings\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`name\` varchar(150) NOT NULL,
        \`overtime_start_after_minutes\` int NOT NULL DEFAULT '0',
        \`max_overtime_minutes_per_day\` int NOT NULL DEFAULT '0',
        \`max_overtime_minutes_per_month\` int NOT NULL DEFAULT '0',
        \`overtime_rate_multiplier\` decimal(5,2) NOT NULL DEFAULT '1.00',
        \`holiday_overtime_multiplier\` decimal(5,2) NOT NULL DEFAULT '1.00',
        \`weekend_overtime_multiplier\` decimal(5,2) NOT NULL DEFAULT '1.00',
        \`requires_approval\` tinyint NOT NULL DEFAULT 0,
        \`auto_calculate\` tinyint NOT NULL DEFAULT 1,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      INSERT INTO \`attendance_settings\` (
        \`company_id\`,
        \`name\`,
        \`overtime_start_after_minutes\`,
        \`max_overtime_minutes_per_day\`,
        \`max_overtime_minutes_per_month\`,
        \`overtime_rate_multiplier\`,
        \`holiday_overtime_multiplier\`,
        \`weekend_overtime_multiplier\`,
        \`requires_approval\`,
        \`auto_calculate\`
      )
      SELECT
        \`company_id\`,
        CONCAT(\`name\`, ' Legacy Settings'),
        \`overtime_start_after_minutes\`,
        \`max_overtime_minutes_per_day\`,
        \`max_overtime_minutes_per_month\`,
        \`overtime_rate_multiplier\`,
        \`holiday_overtime_multiplier\`,
        \`weekend_overtime_multiplier\`,
        \`overtime_requires_approval\`,
        \`overtime_auto_calculate\`
      FROM \`attendance_policies\`
      WHERE \`is_active\` = 1
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`shift_attendance_rules\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`shift_id\` int NOT NULL,
        \`late_after_minutes\` int NOT NULL DEFAULT '0',
        \`absent_after_minutes\` int NOT NULL DEFAULT '0',
        \`half_day_after_minutes\` int NOT NULL DEFAULT '0',
        \`allow_multiple_checkin\` tinyint NOT NULL DEFAULT 0,
        \`auto_mark_absent\` tinyint NOT NULL DEFAULT 1,
        \`allow_mobile_attendance\` tinyint NOT NULL DEFAULT 1,
        \`allow_remote_attendance\` tinyint NOT NULL DEFAULT 0,
        \`require_geofence\` tinyint NOT NULL DEFAULT 0,
        \`require_biometric\` tinyint NOT NULL DEFAULT 0,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      INSERT INTO \`shift_attendance_rules\` (
        \`shift_id\`,
        \`late_after_minutes\`,
        \`absent_after_minutes\`,
        \`half_day_after_minutes\`,
        \`allow_multiple_checkin\`,
        \`auto_mark_absent\`,
        \`allow_mobile_attendance\`,
        \`allow_remote_attendance\`,
        \`require_geofence\`,
        \`require_biometric\`
      )
      SELECT
        \`id\`,
        \`late_after_minutes\`,
        \`absent_after_minutes\`,
        \`half_day_after_minutes\`,
        \`allow_multiple_checkin\`,
        \`auto_mark_absent\`,
        \`allow_mobile_attendance\`,
        \`allow_remote_attendance\`,
        \`require_geofence\`,
        \`require_biometric\`
      FROM \`shifts\`
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`shift_overtime_rules\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`shift_id\` int NOT NULL,
        \`overtime_start_after_minutes\` int NOT NULL DEFAULT '0',
        \`max_daily_overtime_minutes\` int NOT NULL DEFAULT '0',
        \`overtime_rate_multiplier\` decimal(5,2) NOT NULL DEFAULT '1.00',
        \`weekend_multiplier\` decimal(5,2) NOT NULL DEFAULT '1.00',
        \`holiday_multiplier\` decimal(5,2) NOT NULL DEFAULT '1.00',
        \`requires_approval\` tinyint NOT NULL DEFAULT 0,
        \`auto_calculate\` tinyint NOT NULL DEFAULT 1,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      INSERT INTO \`shift_overtime_rules\` (
        \`shift_id\`,
        \`overtime_start_after_minutes\`,
        \`max_daily_overtime_minutes\`,
        \`overtime_rate_multiplier\`,
        \`weekend_multiplier\`,
        \`holiday_multiplier\`,
        \`requires_approval\`,
        \`auto_calculate\`
      )
      SELECT
        \`id\`,
        \`overtime_start_after_minutes\`,
        \`max_overtime_minutes\`,
        \`overtime_rate_multiplier\`,
        \`weekend_multiplier\`,
        \`holiday_multiplier\`,
        \`overtime_requires_approval\`,
        \`overtime_auto_calculate\`
      FROM \`shifts\`
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`timetable_attendance_rules\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`timetable_id\` int NOT NULL,
        \`late_after_minutes\` int NOT NULL DEFAULT '0',
        \`half_day_after_minutes\` int NOT NULL DEFAULT '0',
        \`absent_after_minutes\` int NOT NULL DEFAULT '0',
        \`allow_early_checkin\` tinyint NOT NULL DEFAULT 1,
        \`allow_late_checkout\` tinyint NOT NULL DEFAULT 1,
        \`auto_absent_if_no_checkin\` tinyint NOT NULL DEFAULT 1,
        \`max_overtime_minutes\` int NOT NULL DEFAULT '0',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      INSERT INTO \`timetable_attendance_rules\` (
        \`timetable_id\`,
        \`late_after_minutes\`,
        \`half_day_after_minutes\`,
        \`absent_after_minutes\`,
        \`allow_early_checkin\`,
        \`allow_late_checkout\`,
        \`auto_absent_if_no_checkin\`,
        \`max_overtime_minutes\`
      )
      SELECT
        \`id\`,
        \`late_after_minutes\`,
        \`half_day_after_minutes\`,
        \`absent_after_minutes\`,
        \`allow_early_checkin\`,
        \`allow_late_checkout\`,
        \`auto_absent_if_no_checkin\`,
        \`max_overtime_minutes\`
      FROM \`timetables\`
    `);

    await this.dropColumnIfExists(queryRunner, 'attendance_policies', 'overtime_start_after_minutes');
    await this.dropColumnIfExists(queryRunner, 'attendance_policies', 'max_overtime_minutes_per_day');
    await this.dropColumnIfExists(queryRunner, 'attendance_policies', 'max_overtime_minutes_per_month');
    await this.dropColumnIfExists(queryRunner, 'attendance_policies', 'overtime_rate_multiplier');
    await this.dropColumnIfExists(queryRunner, 'attendance_policies', 'holiday_overtime_multiplier');
    await this.dropColumnIfExists(queryRunner, 'attendance_policies', 'weekend_overtime_multiplier');
    await this.dropColumnIfExists(queryRunner, 'attendance_policies', 'overtime_requires_approval');
    await this.dropColumnIfExists(queryRunner, 'attendance_policies', 'overtime_auto_calculate');
    await this.dropColumnIfExists(queryRunner, 'shifts', 'half_day_after_minutes');
    await this.dropColumnIfExists(queryRunner, 'shifts', 'absent_after_minutes');
    await this.dropColumnIfExists(queryRunner, 'shifts', 'allow_multiple_checkin');
    await this.dropColumnIfExists(queryRunner, 'shifts', 'auto_mark_absent');
    await this.dropColumnIfExists(queryRunner, 'shifts', 'allow_mobile_attendance');
    await this.dropColumnIfExists(queryRunner, 'shifts', 'allow_remote_attendance');
    await this.dropColumnIfExists(queryRunner, 'shifts', 'require_geofence');
    await this.dropColumnIfExists(queryRunner, 'shifts', 'require_biometric');
    await this.dropColumnIfExists(queryRunner, 'shifts', 'overtime_start_after_minutes');
    await this.dropColumnIfExists(queryRunner, 'shifts', 'overtime_rate_multiplier');
    await this.dropColumnIfExists(queryRunner, 'shifts', 'weekend_multiplier');
    await this.dropColumnIfExists(queryRunner, 'shifts', 'holiday_multiplier');
    await this.dropColumnIfExists(queryRunner, 'shifts', 'overtime_requires_approval');
    await this.dropColumnIfExists(queryRunner, 'shifts', 'overtime_auto_calculate');
    await this.dropColumnIfExists(queryRunner, 'timetables', 'late_after_minutes');
    await this.dropColumnIfExists(queryRunner, 'timetables', 'half_day_after_minutes');
    await this.dropColumnIfExists(queryRunner, 'timetables', 'absent_after_minutes');
    await this.dropColumnIfExists(queryRunner, 'timetables', 'allow_early_checkin');
    await this.dropColumnIfExists(queryRunner, 'timetables', 'allow_late_checkout');
    await this.dropColumnIfExists(queryRunner, 'timetables', 'auto_absent_if_no_checkin');
    await this.dropColumnIfExists(queryRunner, 'timetables', 'max_overtime_minutes');
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    column: TableColumn,
  ): Promise<void> {
    if (!(await queryRunner.hasColumn(tableName, column.name))) {
      await queryRunner.addColumn(tableName, column);
    }
  }

  private async dropColumnIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<void> {
    if (await queryRunner.hasColumn(tableName, columnName)) {
      await queryRunner.dropColumn(tableName, columnName);
    }
  }

  private async dropTableIfExists(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<void> {
    if (await queryRunner.hasTable(tableName)) {
      await queryRunner.dropTable(tableName, true, true, true);
    }
  }
}
