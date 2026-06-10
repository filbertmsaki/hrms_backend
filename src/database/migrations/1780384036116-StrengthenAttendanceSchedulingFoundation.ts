import { MigrationInterface, QueryRunner } from 'typeorm';

export class StrengthenAttendanceSchedulingFoundation1780384036116
  implements MigrationInterface
{
  name = 'StrengthenAttendanceSchedulingFoundation1780384036116';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createIndexIfMissing(
      queryRunner,
      'attendance_holidays',
      'IDX_attendance_holidays_company_date_branch',
      'CREATE INDEX `IDX_attendance_holidays_company_date_branch` ON `attendance_holidays` (`company_id`, `date`, `branch_id`)',
    );
    await this.createIndexIfMissing(
      queryRunner,
      'shift_assignments',
      'IDX_shift_assignments_company_employee_status_from',
      'CREATE INDEX `IDX_shift_assignments_company_employee_status_from` ON `shift_assignments` (`company_id`, `employee_id`, `status`, `effective_from`)',
    );
    await this.createIndexIfMissing(
      queryRunner,
      'employee_timetables',
      'IDX_employee_timetables_company_employee_status_from',
      'CREATE INDEX `IDX_employee_timetables_company_employee_status_from` ON `employee_timetables` (`company_id`, `employee_id`, `status`, `effective_from`)',
    );
    await this.createIndexIfMissing(
      queryRunner,
      'timetable_days',
      'IDX_timetable_days_default_shift_id',
      'CREATE INDEX `IDX_timetable_days_default_shift_id` ON `timetable_days` (`default_shift_id`)',
    );

    await this.addForeignKeyIfMissing(
      queryRunner,
      'timetable_days',
      'FK_timetable_days_default_shift_id',
      'ALTER TABLE `timetable_days` ADD CONSTRAINT `FK_timetable_days_default_shift_id` FOREIGN KEY (`default_shift_id`) REFERENCES `shifts`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'timetable_shift_rules',
      'FK_timetable_shift_rules_shift_id',
      'ALTER TABLE `timetable_shift_rules` ADD CONSTRAINT `FK_timetable_shift_rules_shift_id` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'timetable_rotation_rules',
      'FK_timetable_rotation_rules_shift_id',
      'ALTER TABLE `timetable_rotation_rules` ADD CONSTRAINT `FK_timetable_rotation_rules_shift_id` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'timetable_generated_schedules',
      'FK_timetable_generated_schedules_shift_id',
      'ALTER TABLE `timetable_generated_schedules` ADD CONSTRAINT `FK_timetable_generated_schedules_shift_id` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropForeignKeyIfPresent(
      queryRunner,
      'timetable_generated_schedules',
      'FK_timetable_generated_schedules_shift_id',
    );
    await this.dropForeignKeyIfPresent(
      queryRunner,
      'timetable_rotation_rules',
      'FK_timetable_rotation_rules_shift_id',
    );
    await this.dropForeignKeyIfPresent(
      queryRunner,
      'timetable_shift_rules',
      'FK_timetable_shift_rules_shift_id',
    );
    await this.dropForeignKeyIfPresent(
      queryRunner,
      'timetable_days',
      'FK_timetable_days_default_shift_id',
    );

    await this.dropIndexIfPresent(
      queryRunner,
      'timetable_days',
      'IDX_timetable_days_default_shift_id',
    );
    await this.dropIndexIfPresent(
      queryRunner,
      'employee_timetables',
      'IDX_employee_timetables_company_employee_status_from',
    );
    await this.dropIndexIfPresent(
      queryRunner,
      'shift_assignments',
      'IDX_shift_assignments_company_employee_status_from',
    );
    await this.dropIndexIfPresent(
      queryRunner,
      'attendance_holidays',
      'IDX_attendance_holidays_company_date_branch',
    );
  }

  private async createIndexIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
    sql: string,
  ): Promise<void> {
    if (!(await this.hasIndex(queryRunner, tableName, indexName))) {
      await queryRunner.query(sql);
    }
  }

  private async dropIndexIfPresent(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
  ): Promise<void> {
    if (await this.hasIndex(queryRunner, tableName, indexName)) {
      await queryRunner.query(`DROP INDEX \`${indexName}\` ON \`${tableName}\``);
    }
  }

  private async addForeignKeyIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string,
    sql: string,
  ): Promise<void> {
    if (!(await this.hasForeignKey(queryRunner, tableName, constraintName))) {
      await queryRunner.query(sql);
    }
  }

  private async dropForeignKeyIfPresent(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string,
  ): Promise<void> {
    if (await this.hasForeignKey(queryRunner, tableName, constraintName)) {
      await queryRunner.query(
        `ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${constraintName}\``,
      );
    }
  }

  private async hasIndex(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND INDEX_NAME = ?
       LIMIT 1`,
      [tableName, indexName],
    );

    return Array.isArray(rows) && rows.length > 0;
  }

  private async hasForeignKey(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND CONSTRAINT_NAME = ?
         AND REFERENCED_TABLE_NAME IS NOT NULL
       LIMIT 1`,
      [tableName, constraintName],
    );

    return Array.isArray(rows) && rows.length > 0;
  }
}
