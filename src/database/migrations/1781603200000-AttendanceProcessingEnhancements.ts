import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttendanceProcessingEnhancements1781603200000
  implements MigrationInterface
{
  name = 'AttendanceProcessingEnhancements1781603200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `hikvision_attendance_logs` ADD `processing_status` enum ('PENDING', 'PROCESSED', 'UNMATCHED_EMPLOYEE', 'EXCEPTION', 'FAILED') NOT NULL DEFAULT 'PENDING'",
    );
    await queryRunner.query(
      "ALTER TABLE `hikvision_attendance_logs` ADD `processing_attempts` int NOT NULL DEFAULT '0'",
    );
    await queryRunner.query(
      'ALTER TABLE `hikvision_attendance_logs` ADD `processed_at` timestamp NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `hikvision_attendance_logs` ADD `last_processing_error` varchar(255) NULL',
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_hikvision_attendance_logs_processing_status` ON `hikvision_attendance_logs` (`processing_status`)',
    );

    await queryRunner.query(
      "ALTER TABLE `attendance_daily_summaries` ADD `break_minutes` int NOT NULL DEFAULT '0'",
    );
    await queryRunner.query(
      "ALTER TABLE `attendance_daily_summaries` ADD `is_adjusted` tinyint NOT NULL DEFAULT 0",
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_daily_summaries` ADD `adjusted_by_company_user_id` int NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_daily_summaries` ADD `adjusted_at` timestamp NULL',
    );

    await queryRunner.query(
      "CREATE TABLE `attendance_processing_exceptions` (`id` int NOT NULL AUTO_INCREMENT, `company_id` int NOT NULL, `branch_id` int NULL, `employee_id` int NULL, `raw_log_id` int NULL, `processed_event_id` int NULL, `summary_id` int NULL, `device_id` int NULL, `employee_no` varchar(100) NOT NULL DEFAULT '', `attendance_date` date NULL, `exception_type` enum ('UNRESOLVED_EMPLOYEE', 'EMPTY_EMPLOYEE_NO', 'MISSING_CHECK_IN', 'MISSING_CHECK_OUT', 'DUPLICATE_PUNCH', 'NO_SCHEDULE_FOUND', 'INVALID_PUNCH_TIME') NOT NULL, `status` enum ('OPEN', 'RESOLVED', 'IGNORED') NOT NULL DEFAULT 'OPEN', `message` varchar(255) NULL, `metadata` json NULL, `is_system_generated` tinyint NOT NULL DEFAULT 1, `resolved_by_company_user_id` int NULL, `resolved_at` timestamp NULL, `resolution_note` text NULL, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_attendance_processing_exceptions_company_id` (`company_id`), INDEX `IDX_attendance_processing_exceptions_branch_id` (`branch_id`), INDEX `IDX_attendance_processing_exceptions_employee_id` (`employee_id`), INDEX `IDX_attendance_processing_exceptions_raw_log_id` (`raw_log_id`), INDEX `IDX_attendance_processing_exceptions_processed_event_id` (`processed_event_id`), INDEX `IDX_attendance_processing_exceptions_summary_id` (`summary_id`), INDEX `IDX_attendance_processing_exceptions_device_id` (`device_id`), INDEX `IDX_attendance_processing_exceptions_attendance_date` (`attendance_date`), INDEX `IDX_attendance_processing_exceptions_type` (`exception_type`), INDEX `IDX_attendance_processing_exceptions_status` (`status`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
    );

    await queryRunner.query(
      "CREATE TABLE `attendance_daily_summary_adjustments` (`id` int NOT NULL AUTO_INCREMENT, `company_id` int NOT NULL, `employee_id` int NOT NULL, `summary_id` int NULL, `attendance_date` date NOT NULL, `status_override` varchar(50) NULL, `check_in_at_override` timestamp NULL, `check_out_at_override` timestamp NULL, `break_minutes_override` int NULL, `work_minutes_override` int NULL, `late_minutes_override` int NULL, `early_departure_minutes_override` int NULL, `overtime_minutes_override` int NULL, `notes` text NULL, `metadata` json NULL, `is_active` tinyint NOT NULL DEFAULT 1, `applied_by_company_user_id` int NULL, `applied_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX `IDX_attendance_daily_summary_adjustments_company_id` (`company_id`), INDEX `IDX_attendance_daily_summary_adjustments_employee_id` (`employee_id`), INDEX `IDX_attendance_daily_summary_adjustments_attendance_date` (`attendance_date`), INDEX `IDX_attendance_daily_summary_adjustments_is_active` (`is_active`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
    );

    await queryRunner.query(
      'ALTER TABLE `attendance_daily_summaries` ADD CONSTRAINT `FK_attendance_daily_summaries_adjusted_by` FOREIGN KEY (`adjusted_by_company_user_id`) REFERENCES `company_users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_processing_exceptions` ADD CONSTRAINT `FK_attendance_processing_exceptions_company` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_processing_exceptions` ADD CONSTRAINT `FK_attendance_processing_exceptions_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_processing_exceptions` ADD CONSTRAINT `FK_attendance_processing_exceptions_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_processing_exceptions` ADD CONSTRAINT `FK_attendance_processing_exceptions_raw_log` FOREIGN KEY (`raw_log_id`) REFERENCES `hikvision_attendance_logs`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_processing_exceptions` ADD CONSTRAINT `FK_attendance_processing_exceptions_processed_event` FOREIGN KEY (`processed_event_id`) REFERENCES `attendance_processed_events`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_processing_exceptions` ADD CONSTRAINT `FK_attendance_processing_exceptions_summary` FOREIGN KEY (`summary_id`) REFERENCES `attendance_daily_summaries`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_processing_exceptions` ADD CONSTRAINT `FK_attendance_processing_exceptions_device` FOREIGN KEY (`device_id`) REFERENCES `attendance_devices`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_processing_exceptions` ADD CONSTRAINT `FK_attendance_processing_exceptions_resolved_by` FOREIGN KEY (`resolved_by_company_user_id`) REFERENCES `company_users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_daily_summary_adjustments` ADD CONSTRAINT `FK_attendance_daily_summary_adjustments_company` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_daily_summary_adjustments` ADD CONSTRAINT `FK_attendance_daily_summary_adjustments_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_daily_summary_adjustments` ADD CONSTRAINT `FK_attendance_daily_summary_adjustments_summary` FOREIGN KEY (`summary_id`) REFERENCES `attendance_daily_summaries`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_daily_summary_adjustments` ADD CONSTRAINT `FK_attendance_daily_summary_adjustments_applied_by` FOREIGN KEY (`applied_by_company_user_id`) REFERENCES `company_users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `attendance_daily_summary_adjustments` DROP FOREIGN KEY `FK_attendance_daily_summary_adjustments_applied_by`',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_daily_summary_adjustments` DROP FOREIGN KEY `FK_attendance_daily_summary_adjustments_summary`',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_daily_summary_adjustments` DROP FOREIGN KEY `FK_attendance_daily_summary_adjustments_employee`',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_daily_summary_adjustments` DROP FOREIGN KEY `FK_attendance_daily_summary_adjustments_company`',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_processing_exceptions` DROP FOREIGN KEY `FK_attendance_processing_exceptions_resolved_by`',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_processing_exceptions` DROP FOREIGN KEY `FK_attendance_processing_exceptions_device`',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_processing_exceptions` DROP FOREIGN KEY `FK_attendance_processing_exceptions_summary`',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_processing_exceptions` DROP FOREIGN KEY `FK_attendance_processing_exceptions_processed_event`',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_processing_exceptions` DROP FOREIGN KEY `FK_attendance_processing_exceptions_raw_log`',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_processing_exceptions` DROP FOREIGN KEY `FK_attendance_processing_exceptions_employee`',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_processing_exceptions` DROP FOREIGN KEY `FK_attendance_processing_exceptions_branch`',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_processing_exceptions` DROP FOREIGN KEY `FK_attendance_processing_exceptions_company`',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_daily_summaries` DROP FOREIGN KEY `FK_attendance_daily_summaries_adjusted_by`',
    );

    await queryRunner.query('DROP TABLE `attendance_daily_summary_adjustments`');
    await queryRunner.query('DROP TABLE `attendance_processing_exceptions`');

    await queryRunner.query(
      'ALTER TABLE `attendance_daily_summaries` DROP COLUMN `adjusted_at`',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_daily_summaries` DROP COLUMN `adjusted_by_company_user_id`',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_daily_summaries` DROP COLUMN `is_adjusted`',
    );
    await queryRunner.query(
      'ALTER TABLE `attendance_daily_summaries` DROP COLUMN `break_minutes`',
    );

    await queryRunner.query(
      'DROP INDEX `IDX_hikvision_attendance_logs_processing_status` ON `hikvision_attendance_logs`',
    );
    await queryRunner.query(
      'ALTER TABLE `hikvision_attendance_logs` DROP COLUMN `last_processing_error`',
    );
    await queryRunner.query(
      'ALTER TABLE `hikvision_attendance_logs` DROP COLUMN `processed_at`',
    );
    await queryRunner.query(
      'ALTER TABLE `hikvision_attendance_logs` DROP COLUMN `processing_attempts`',
    );
    await queryRunner.query(
      'ALTER TABLE `hikvision_attendance_logs` DROP COLUMN `processing_status`',
    );
  }
}
