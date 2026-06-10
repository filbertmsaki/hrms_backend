import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAttendanceWifiNetworksTable1785420300002 implements MigrationInterface {
  name = 'CreateAttendanceWifiNetworksTable1785420300002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`attendance_wifi_networks\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`branch_id\` int NULL,
        \`name\` varchar(150) NOT NULL,
        \`description\` text NULL,
        \`ssid\` varchar(255) NOT NULL,
        \`bssid\` varchar(100) NULL,
        \`allowed_ip_cidrs\` json NULL,
        \`security_type\` enum ('OPEN', 'WPA', 'WPA2', 'WPA3', 'ENTERPRISE', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
        \`require_ssid_match\` tinyint NOT NULL DEFAULT 1,
        \`require_bssid_match\` tinyint NOT NULL DEFAULT 0,
        \`require_ip_match\` tinyint NOT NULL DEFAULT 0,
        \`allow_mobile_attendance\` tinyint NOT NULL DEFAULT 1,
        \`metadata\` json NULL,
        \`status\` enum ('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\` datetime(6) NULL,
        UNIQUE INDEX \`UQ_attendance_wifi_networks_company_ssid_bssid\` (\`company_id\`, \`ssid\`, \`bssid\`),
        INDEX \`IDX_attendance_wifi_networks_company_id\` (\`company_id\`),
        INDEX \`IDX_attendance_wifi_networks_branch_id\` (\`branch_id\`),
        INDEX \`IDX_attendance_wifi_networks_ssid\` (\`ssid\`),
        INDEX \`IDX_attendance_wifi_networks_bssid\` (\`bssid\`),
        INDEX \`IDX_attendance_wifi_networks_status\` (\`status\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `ALTER TABLE \`attendance_wifi_networks\` ADD CONSTRAINT \`FK_attendance_wifi_networks_company_id\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE \`attendance_wifi_networks\` ADD CONSTRAINT \`FK_attendance_wifi_networks_branch_id\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE \`attendance_checkpoints\` ADD COLUMN \`wifi_network_id\` int NULL AFTER \`geofence_id\``,
    );

    await queryRunner.query(
      `CREATE INDEX \`IDX_attendance_checkpoints_wifi_network_id\` ON \`attendance_checkpoints\` (\`wifi_network_id\`)`,
    );

    await queryRunner.query(
      `ALTER TABLE \`attendance_checkpoints\` ADD CONSTRAINT \`FK_attendance_checkpoints_wifi_network_id\` FOREIGN KEY (\`wifi_network_id\`) REFERENCES \`attendance_wifi_networks\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE \`attendance_checkpoints\` DROP COLUMN \`wifi_ssid\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasFk = await this.hasConstraint(
      queryRunner,
      'attendance_checkpoints',
      'FK_attendance_checkpoints_wifi_network_id',
    );
    if (hasFk) {
      await queryRunner.query(
        `ALTER TABLE \`attendance_checkpoints\` DROP FOREIGN KEY \`FK_attendance_checkpoints_wifi_network_id\``,
      );
    }

    await queryRunner.query(
      `DROP INDEX \`IDX_attendance_checkpoints_wifi_network_id\` ON \`attendance_checkpoints\``,
    );

    await queryRunner.query(
      `ALTER TABLE \`attendance_checkpoints\` ADD COLUMN \`wifi_ssid\` varchar(255) NULL AFTER \`geofence_id\``,
    );

    await queryRunner.query(
      `ALTER TABLE \`attendance_checkpoints\` DROP COLUMN \`wifi_network_id\``,
    );

    const hasBranchFk = await this.hasConstraint(
      queryRunner,
      'attendance_wifi_networks',
      'FK_attendance_wifi_networks_branch_id',
    );
    if (hasBranchFk) {
      await queryRunner.query(
        `ALTER TABLE \`attendance_wifi_networks\` DROP FOREIGN KEY \`FK_attendance_wifi_networks_branch_id\``,
      );
    }

    const hasCompanyFk = await this.hasConstraint(
      queryRunner,
      'attendance_wifi_networks',
      'FK_attendance_wifi_networks_company_id',
    );
    if (hasCompanyFk) {
      await queryRunner.query(
        `ALTER TABLE \`attendance_wifi_networks\` DROP FOREIGN KEY \`FK_attendance_wifi_networks_company_id\``,
      );
    }

    await queryRunner.query(`DROP TABLE \`attendance_wifi_networks\``);
  }

  private async hasConstraint(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string,
  ): Promise<boolean> {
    const result = (await queryRunner.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?
       LIMIT 1`,
      [tableName, constraintName],
    )) as unknown[];

    return result.length > 0;
  }
}
