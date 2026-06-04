import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHikvisionPeopleCredentialSyncColumns1780384036111
  implements MigrationInterface
{
  name = 'AddHikvisionPeopleCredentialSyncColumns1780384036111';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasRightPlanIsActive = await queryRunner.hasColumn(
      'employee_device_right_plans',
      'is_active',
    );
    if (!hasRightPlanIsActive) {
      await queryRunner.query(
        'ALTER TABLE `employee_device_right_plans` ADD `is_active` tinyint NOT NULL DEFAULT 1',
      );
    }

    const hasRightPlanIsActiveIndex = await this.hasIndex(
      queryRunner,
      'employee_device_right_plans',
      'IDX_employee_device_right_plans_is_active',
    );
    if (!hasRightPlanIsActiveIndex) {
      await queryRunner.query(
        'CREATE INDEX `IDX_employee_device_right_plans_is_active` ON `employee_device_right_plans` (`is_active`)',
      );
    }

    const hasCardReaderNo = await queryRunner.hasColumn(
      'employee_access_credentials',
      'card_reader_no',
    );
    if (!hasCardReaderNo) {
      await queryRunner.query(
        'ALTER TABLE `employee_access_credentials` ADD `card_reader_no` int NULL',
      );
    }

    const hasFingerprintIdIndex = await this.hasIndex(
      queryRunner,
      'employee_access_credentials',
      'IDX_employee_access_credentials_fingerprint_id',
    );
    if (!hasFingerprintIdIndex) {
      await queryRunner.query(
        'CREATE INDEX `IDX_employee_access_credentials_fingerprint_id` ON `employee_access_credentials` (`fingerprint_id`)',
      );
    }

    const hasCardReaderNoIndex = await this.hasIndex(
      queryRunner,
      'employee_access_credentials',
      'IDX_employee_access_credentials_card_reader_no',
    );
    if (!hasCardReaderNoIndex) {
      await queryRunner.query(
        'CREATE INDEX `IDX_employee_access_credentials_card_reader_no` ON `employee_access_credentials` (`card_reader_no`)',
      );
    }

    const hasCardUniqueIndex = await this.hasIndex(
      queryRunner,
      'employee_access_credentials',
      'UQ_employee_access_credentials_device_type_card_no',
    );
    if (!hasCardUniqueIndex) {
      await queryRunner.query(
        'CREATE UNIQUE INDEX `UQ_employee_access_credentials_device_type_card_no` ON `employee_access_credentials` (`device_id`, `credential_type`, `card_no`)',
      );
    }

    const hasFingerprintUniqueIndex = await this.hasIndex(
      queryRunner,
      'employee_access_credentials',
      'UQ_eac_dev_emp_type_fp_reader',
    );
    if (!hasFingerprintUniqueIndex) {
      await queryRunner.query(
        'CREATE UNIQUE INDEX `UQ_eac_dev_emp_type_fp_reader` ON `employee_access_credentials` (`device_id`, `employee_no`, `credential_type`, `fingerprint_id`, `card_reader_no`)',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasFingerprintUniqueIndex = await this.hasIndex(
      queryRunner,
      'employee_access_credentials',
      'UQ_eac_dev_emp_type_fp_reader',
    );
    if (hasFingerprintUniqueIndex) {
      await queryRunner.query(
        'DROP INDEX `UQ_eac_dev_emp_type_fp_reader` ON `employee_access_credentials`',
      );
    }

    const hasCardUniqueIndex = await this.hasIndex(
      queryRunner,
      'employee_access_credentials',
      'UQ_employee_access_credentials_device_type_card_no',
    );
    if (hasCardUniqueIndex) {
      await queryRunner.query(
        'DROP INDEX `UQ_employee_access_credentials_device_type_card_no` ON `employee_access_credentials`',
      );
    }

    const hasCardReaderNoIndex = await this.hasIndex(
      queryRunner,
      'employee_access_credentials',
      'IDX_employee_access_credentials_card_reader_no',
    );
    if (hasCardReaderNoIndex) {
      await queryRunner.query(
        'DROP INDEX `IDX_employee_access_credentials_card_reader_no` ON `employee_access_credentials`',
      );
    }

    const hasFingerprintIdIndex = await this.hasIndex(
      queryRunner,
      'employee_access_credentials',
      'IDX_employee_access_credentials_fingerprint_id',
    );
    if (hasFingerprintIdIndex) {
      await queryRunner.query(
        'DROP INDEX `IDX_employee_access_credentials_fingerprint_id` ON `employee_access_credentials`',
      );
    }

    const hasCardReaderNo = await queryRunner.hasColumn(
      'employee_access_credentials',
      'card_reader_no',
    );
    if (hasCardReaderNo) {
      await queryRunner.query(
        'ALTER TABLE `employee_access_credentials` DROP COLUMN `card_reader_no`',
      );
    }

    const hasRightPlanIsActiveIndex = await this.hasIndex(
      queryRunner,
      'employee_device_right_plans',
      'IDX_employee_device_right_plans_is_active',
    );
    if (hasRightPlanIsActiveIndex) {
      await queryRunner.query(
        'DROP INDEX `IDX_employee_device_right_plans_is_active` ON `employee_device_right_plans`',
      );
    }

    const hasRightPlanIsActive = await queryRunner.hasColumn(
      'employee_device_right_plans',
      'is_active',
    );
    if (hasRightPlanIsActive) {
      await queryRunner.query(
        'ALTER TABLE `employee_device_right_plans` DROP COLUMN `is_active`',
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
