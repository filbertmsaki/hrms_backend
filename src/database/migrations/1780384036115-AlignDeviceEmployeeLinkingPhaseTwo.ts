import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignDeviceEmployeeLinkingPhaseTwo1780384036115
  implements MigrationInterface
{
  name = 'AlignDeviceEmployeeLinkingPhaseTwo1780384036115';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasIndex(
      queryRunner,
      'attendance_processed_events',
      'IDX_attendance_processed_events_company_device_empno',
    ))) {
      await queryRunner.query(
        'CREATE INDEX `IDX_attendance_processed_events_company_device_empno` ON `attendance_processed_events` (`company_id`, `device_id`, `employee_no`)',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasIndex(
      queryRunner,
      'attendance_processed_events',
      'IDX_attendance_processed_events_company_device_empno',
    )) {
      await queryRunner.query(
        'DROP INDEX `IDX_attendance_processed_events_company_device_empno` ON `attendance_processed_events`',
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
}
