import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropHikvisionAttendanceSerialUnique1785420300000 implements MigrationInterface {
  name = 'DropHikvisionAttendanceSerialUnique1785420300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (
      await this.hasIndex(
        queryRunner,
        'hikvision_attendance_logs',
        'UQ_hikvision_attendance_logs_device_serial_no',
      )
    ) {
      await queryRunner.query(
        'DROP INDEX `UQ_hikvision_attendance_logs_device_serial_no` ON `hikvision_attendance_logs`',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      !(await this.hasIndex(
        queryRunner,
        'hikvision_attendance_logs',
        'UQ_hikvision_attendance_logs_device_serial_no',
      ))
    ) {
      await queryRunner.query(
        'CREATE UNIQUE INDEX `UQ_hikvision_attendance_logs_device_serial_no` ON `hikvision_attendance_logs` (`device_id`, `serial_no`)',
      );
    }
  }

  private async hasIndex(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
  ): Promise<boolean> {
    const result = (await queryRunner.query(
      `SELECT 1
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND INDEX_NAME = ?
       LIMIT 1`,
      [tableName, indexName],
    )) as unknown[];

    return result.length > 0;
  }
}
