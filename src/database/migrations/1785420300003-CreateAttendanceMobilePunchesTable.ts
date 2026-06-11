import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAttendanceMobilePunchesTable1785420300003
  implements MigrationInterface
{
  name = 'CreateAttendanceMobilePunchesTable1785420300003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`attendance_mobile_punches\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`branch_id\` int NULL,
        \`employee_id\` int NOT NULL,
        \`policy_set_id\` int NULL,
        \`geofence_id\` int NULL,
        \`wifi_network_id\` int NULL,
        \`punch_type\` enum ('CHECK_IN', 'CHECK_OUT') NOT NULL,
        \`source\` enum ('MOBILE', 'WEB', 'DEVICE', 'MANUAL') NOT NULL DEFAULT 'MOBILE',
        \`punch_time\` timestamp NOT NULL,
        \`attendance_date\` date NOT NULL,
        \`latitude\` decimal(10, 7) NULL,
        \`longitude\` decimal(10, 7) NULL,
        \`accuracy_meters\` decimal(10, 2) NULL,
        \`distance_from_geofence_meters\` decimal(10, 2) NULL,
        \`wifi_ssid\` varchar(255) NULL,
        \`wifi_bssid\` varchar(100) NULL,
        \`ip_address\` varchar(100) NULL,
        \`user_agent\` text NULL,
        \`device_identifier\` varchar(255) NULL,
        \`validation_status\` enum ('APPROVED', 'REJECTED', 'PENDING_OVERRIDE', 'OVERRIDE_APPROVED', 'OVERRIDE_REJECTED') NOT NULL DEFAULT 'REJECTED',
        \`validation_message\` text NULL,
        \`geofence_validation_result\` json NULL,
        \`wifi_validation_result\` json NULL,
        \`is_override_requested\` tinyint NOT NULL DEFAULT 0,
        \`override_reason\` text NULL,
        \`override_reviewed_by\` int NULL,
        \`override_reviewed_at\` timestamp NULL,
        \`override_review_note\` text NULL,
        \`device_info\` json NULL,
        \`raw_payload\` json NULL,
        \`is_processed\` tinyint NOT NULL DEFAULT 0,
        \`processed_event_id\` int NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_attendance_mobile_punches_company_id\` (\`company_id\`),
        INDEX \`IDX_attendance_mobile_punches_branch_id\` (\`branch_id\`),
        INDEX \`IDX_attendance_mobile_punches_employee_id\` (\`employee_id\`),
        INDEX \`IDX_attendance_mobile_punches_policy_set_id\` (\`policy_set_id\`),
        INDEX \`IDX_attendance_mobile_punches_geofence_id\` (\`geofence_id\`),
        INDEX \`IDX_attendance_mobile_punches_wifi_network_id\` (\`wifi_network_id\`),
        INDEX \`IDX_attendance_mobile_punches_punch_time\` (\`punch_time\`),
        INDEX \`IDX_attendance_mobile_punches_attendance_date\` (\`attendance_date\`),
        INDEX \`IDX_attendance_mobile_punches_punch_type\` (\`punch_type\`),
        INDEX \`IDX_attendance_mobile_punches_validation_status\` (\`validation_status\`),
        INDEX \`IDX_attendance_mobile_punches_employee_date\` (\`employee_id\`, \`attendance_date\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );

    await this.addForeignKeyIfMissing(
      queryRunner,
      'attendance_mobile_punches',
      'FK_attendance_mobile_punches_company_id',
      'ALTER TABLE `attendance_mobile_punches` ADD CONSTRAINT `FK_attendance_mobile_punches_company_id` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'attendance_mobile_punches',
      'FK_attendance_mobile_punches_branch_id',
      'ALTER TABLE `attendance_mobile_punches` ADD CONSTRAINT `FK_attendance_mobile_punches_branch_id` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'attendance_mobile_punches',
      'FK_attendance_mobile_punches_employee_id',
      'ALTER TABLE `attendance_mobile_punches` ADD CONSTRAINT `FK_attendance_mobile_punches_employee_id` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'attendance_mobile_punches',
      'FK_attendance_mobile_punches_policy_set_id',
      'ALTER TABLE `attendance_mobile_punches` ADD CONSTRAINT `FK_attendance_mobile_punches_policy_set_id` FOREIGN KEY (`policy_set_id`) REFERENCES `attendance_policies`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'attendance_mobile_punches',
      'FK_attendance_mobile_punches_geofence_id',
      'ALTER TABLE `attendance_mobile_punches` ADD CONSTRAINT `FK_attendance_mobile_punches_geofence_id` FOREIGN KEY (`geofence_id`) REFERENCES `attendance_geofences`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'attendance_mobile_punches',
      'FK_attendance_mobile_punches_wifi_network_id',
      'ALTER TABLE `attendance_mobile_punches` ADD CONSTRAINT `FK_attendance_mobile_punches_wifi_network_id` FOREIGN KEY (`wifi_network_id`) REFERENCES `attendance_wifi_networks`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'attendance_mobile_punches',
      'FK_attendance_mobile_punches_override_reviewed_by',
      'ALTER TABLE `attendance_mobile_punches` ADD CONSTRAINT `FK_attendance_mobile_punches_override_reviewed_by` FOREIGN KEY (`override_reviewed_by`) REFERENCES `company_users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropForeignKeyIfMissing(
      queryRunner,
      'attendance_mobile_punches',
      'FK_attendance_mobile_punches_override_reviewed_by',
    );
    await this.dropForeignKeyIfMissing(
      queryRunner,
      'attendance_mobile_punches',
      'FK_attendance_mobile_punches_wifi_network_id',
    );
    await this.dropForeignKeyIfMissing(
      queryRunner,
      'attendance_mobile_punches',
      'FK_attendance_mobile_punches_geofence_id',
    );
    await this.dropForeignKeyIfMissing(
      queryRunner,
      'attendance_mobile_punches',
      'FK_attendance_mobile_punches_policy_set_id',
    );
    await this.dropForeignKeyIfMissing(
      queryRunner,
      'attendance_mobile_punches',
      'FK_attendance_mobile_punches_employee_id',
    );
    await this.dropForeignKeyIfMissing(
      queryRunner,
      'attendance_mobile_punches',
      'FK_attendance_mobile_punches_branch_id',
    );
    await this.dropForeignKeyIfMissing(
      queryRunner,
      'attendance_mobile_punches',
      'FK_attendance_mobile_punches_company_id',
    );

    await queryRunner.query(`DROP TABLE \`attendance_mobile_punches\``);
  }

  private async addForeignKeyIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string,
    query: string,
  ) {
    const hasConstraint = await this.hasConstraint(
      queryRunner,
      tableName,
      constraintName,
    );
    if (!hasConstraint) {
      await queryRunner.query(query);
    }
  }

  private async dropForeignKeyIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string,
  ) {
    const hasConstraint = await this.hasConstraint(
      queryRunner,
      tableName,
      constraintName,
    );
    if (hasConstraint) {
      await queryRunner.query(
        `ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${constraintName}\``,
      );
    }
  }

  private async hasConstraint(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string,
  ): Promise<boolean> {
    const result = (await queryRunner.query(
      `SELECT 1
       FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND CONSTRAINT_NAME = ?
       LIMIT 1`,
      [tableName, constraintName],
    )) as unknown[];

    return result.length > 0;
  }
}
