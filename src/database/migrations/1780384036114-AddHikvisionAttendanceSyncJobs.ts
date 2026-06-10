import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHikvisionAttendanceSyncJobs1780384036114 implements MigrationInterface {
  name = 'AddHikvisionAttendanceSyncJobs1780384036114';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('hikvision_attendance_sync_jobs');
    if (!hasTable) {
      await queryRunner.query(`
        CREATE TABLE \`hikvision_attendance_sync_jobs\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`company_id\` int NOT NULL,
          \`device_id\` int NOT NULL,
          \`queue_job_id\` varchar(191) NULL,
          \`active_job_key\` varchar(191) NULL,
          \`status\` enum ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
          \`result_status\` varchar(20) NULL,
          \`sync_start_time\` varchar(40) NOT NULL,
          \`sync_end_time\` varchar(40) NOT NULL,
          \`requested_by_user_id\` int NULL,
          \`requested_by_company_user_id\` int NULL,
          \`started_at\` timestamp NULL,
          \`completed_at\` timestamp NULL,
          \`total_records_pulled\` int NOT NULL DEFAULT 0,
          \`total_records_saved\` int NOT NULL DEFAULT 0,
          \`error_message\` text NULL,
          \`metadata\` json NULL,
          \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`UQ_hikvision_att_sync_jobs_queue_job_id\` (\`queue_job_id\`),
          UNIQUE INDEX \`UQ_hikvision_att_sync_jobs_active_job_key\` (\`active_job_key\`),
          INDEX \`IDX_hikvision_att_sync_jobs_company_id\` (\`company_id\`),
          INDEX \`IDX_hikvision_att_sync_jobs_device_id\` (\`device_id\`),
          INDEX \`IDX_hikvision_att_sync_jobs_status\` (\`status\`),
          INDEX \`IDX_hikvision_att_sync_jobs_created_at\` (\`created_at\`),
          INDEX \`IDX_hikvision_att_sync_jobs_company_device_created\` (\`company_id\`, \`device_id\`, \`created_at\`)
        ) ENGINE=InnoDB
      `);
      await queryRunner.query(`
        ALTER TABLE \`hikvision_attendance_sync_jobs\`
        ADD CONSTRAINT \`FK_hikvision_att_sync_jobs_company_id\`
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE
      `);
      await queryRunner.query(`
        ALTER TABLE \`hikvision_attendance_sync_jobs\`
        ADD CONSTRAINT \`FK_hikvision_att_sync_jobs_device_id\`
        FOREIGN KEY (\`device_id\`) REFERENCES \`attendance_devices\`(\`id\`) ON DELETE CASCADE
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('hikvision_attendance_sync_jobs');
    if (!hasTable) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE \`hikvision_attendance_sync_jobs\`
      DROP FOREIGN KEY \`FK_hikvision_att_sync_jobs_device_id\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`hikvision_attendance_sync_jobs\`
      DROP FOREIGN KEY \`FK_hikvision_att_sync_jobs_company_id\`
    `);
    await queryRunner.query('DROP TABLE `hikvision_attendance_sync_jobs`');
  }
}
