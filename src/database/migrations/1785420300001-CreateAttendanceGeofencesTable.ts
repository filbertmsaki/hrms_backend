import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAttendanceGeofencesTable1785420300001 implements MigrationInterface {
  name = 'CreateAttendanceGeofencesTable1785420300001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`attendance_geofences\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`branch_id\` int NULL,
        \`name\` varchar(150) NOT NULL,
        \`description\` text NULL,
        \`type\` enum ('CIRCLE', 'POLYGON') NOT NULL DEFAULT 'CIRCLE',
        \`latitude\` decimal(10, 7) NOT NULL,
        \`longitude\` decimal(10, 7) NOT NULL,
        \`radius_meters\` int NOT NULL DEFAULT 100,
        \`allowed_accuracy_meters\` int NOT NULL DEFAULT 50,
        \`strict_accuracy\` tinyint NOT NULL DEFAULT 0,
        \`polygon_coordinates\` json NULL,
        \`status\` enum ('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\` datetime(6) NULL,
        UNIQUE INDEX \`UQ_attendance_geofences_company_name\` (\`company_id\`, \`name\`),
        INDEX \`IDX_attendance_geofences_company_id\` (\`company_id\`),
        INDEX \`IDX_attendance_geofences_branch_id\` (\`branch_id\`),
        INDEX \`IDX_attendance_geofences_status\` (\`status\`),
        INDEX \`IDX_attendance_geofences_type\` (\`type\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );

    // Add foreign key constraints
    const hasCompanyFK = await this.hasConstraint(
      queryRunner,
      'attendance_geofences',
      'FK_attendance_geofences_company_id',
    );
    if (!hasCompanyFK) {
      await queryRunner.query(
        `ALTER TABLE \`attendance_geofences\` ADD CONSTRAINT \`FK_attendance_geofences_company_id\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
    }

    const hasBranchFK = await this.hasConstraint(
      queryRunner,
      'attendance_geofences',
      'FK_attendance_geofences_branch_id',
    );
    if (!hasBranchFK) {
      await queryRunner.query(
        `ALTER TABLE \`attendance_geofences\` ADD CONSTRAINT \`FK_attendance_geofences_branch_id\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    const hasCompanyFK = await this.hasConstraint(
      queryRunner,
      'attendance_geofences',
      'FK_attendance_geofences_company_id',
    );
    if (hasCompanyFK) {
      await queryRunner.query(
        `ALTER TABLE \`attendance_geofences\` DROP FOREIGN KEY \`FK_attendance_geofences_company_id\``,
      );
    }

    const hasBranchFK = await this.hasConstraint(
      queryRunner,
      'attendance_geofences',
      'FK_attendance_geofences_branch_id',
    );
    if (hasBranchFK) {
      await queryRunner.query(
        `ALTER TABLE \`attendance_geofences\` DROP FOREIGN KEY \`FK_attendance_geofences_branch_id\``,
      );
    }

    // Drop table
    await queryRunner.query(`DROP TABLE \`attendance_geofences\``);
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
