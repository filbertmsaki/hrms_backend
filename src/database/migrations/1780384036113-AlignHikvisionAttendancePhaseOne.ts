import { MigrationInterface, QueryRunner } from "typeorm";

export class AlignHikvisionAttendancePhaseOne1780384036113 implements MigrationInterface {
    name = 'AlignHikvisionAttendancePhaseOne1780384036113'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (!(await this.hasColumn(queryRunner, 'hikvision_attendance_logs', 'card_reader_kind'))) {
            await queryRunner.query(`ALTER TABLE \`hikvision_attendance_logs\` ADD \`card_reader_kind\` varchar(120) NULL`);
        }

        if (!(await this.hasColumn(queryRunner, 'hikvision_attendance_logs', 'device_no'))) {
            await queryRunner.query(`ALTER TABLE \`hikvision_attendance_logs\` ADD \`device_no\` varchar(120) NULL`);
        }

        if (await this.hasIndex(queryRunner, 'hikvision_attendance_logs', 'UQ_hikvision_attendance_logs_device_emp_time_major_minor_door')) {
            await queryRunner.query(`DROP INDEX \`UQ_hikvision_attendance_logs_device_emp_time_major_minor_door\` ON \`hikvision_attendance_logs\``);
        }

        if (!(await this.hasIndex(queryRunner, 'hikvision_attendance_logs', 'UQ_hik_att_logs_dev_emp_evt_maj_min_reader_door'))) {
            await queryRunner.query(`CREATE UNIQUE INDEX \`UQ_hik_att_logs_dev_emp_evt_maj_min_reader_door\` ON \`hikvision_attendance_logs\` (\`device_id\`, \`employee_no\`, \`event_time\`, \`major\`, \`minor\`, \`card_reader_no\`, \`door_no\`)`);
        }

        if (!(await this.hasIndex(queryRunner, 'hikvision_attendance_logs', 'IDX_hikvision_attendance_logs_device_event_time'))) {
            await queryRunner.query(`CREATE INDEX \`IDX_hikvision_attendance_logs_device_event_time\` ON \`hikvision_attendance_logs\` (\`device_id\`, \`event_time\`)`);
        }

        if (!(await this.hasIndex(queryRunner, 'hikvision_sync_logs', 'IDX_hikvision_sync_logs_company_device_type_started'))) {
            await queryRunner.query(`CREATE INDEX \`IDX_hikvision_sync_logs_company_device_type_started\` ON \`hikvision_sync_logs\` (\`company_id\`, \`device_id\`, \`sync_type\`, \`started_at\`)`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (await this.hasIndex(queryRunner, 'hikvision_sync_logs', 'IDX_hikvision_sync_logs_company_device_type_started')) {
            await queryRunner.query(`DROP INDEX \`IDX_hikvision_sync_logs_company_device_type_started\` ON \`hikvision_sync_logs\``);
        }

        if (await this.hasIndex(queryRunner, 'hikvision_attendance_logs', 'IDX_hikvision_attendance_logs_device_event_time')) {
            await queryRunner.query(`DROP INDEX \`IDX_hikvision_attendance_logs_device_event_time\` ON \`hikvision_attendance_logs\``);
        }

        if (await this.hasIndex(queryRunner, 'hikvision_attendance_logs', 'UQ_hik_att_logs_dev_emp_evt_maj_min_reader_door')) {
            await queryRunner.query(`DROP INDEX \`UQ_hik_att_logs_dev_emp_evt_maj_min_reader_door\` ON \`hikvision_attendance_logs\``);
        }

        if (!(await this.hasIndex(queryRunner, 'hikvision_attendance_logs', 'UQ_hikvision_attendance_logs_device_emp_time_major_minor_door'))) {
            await queryRunner.query(`CREATE UNIQUE INDEX \`UQ_hikvision_attendance_logs_device_emp_time_major_minor_door\` ON \`hikvision_attendance_logs\` (\`device_id\`, \`employee_no\`, \`event_time\`, \`major\`, \`minor\`, \`door_no\`)`);
        }

        if (await this.hasColumn(queryRunner, 'hikvision_attendance_logs', 'device_no')) {
            await queryRunner.query(`ALTER TABLE \`hikvision_attendance_logs\` DROP COLUMN \`device_no\``);
        }

        if (await this.hasColumn(queryRunner, 'hikvision_attendance_logs', 'card_reader_kind')) {
            await queryRunner.query(`ALTER TABLE \`hikvision_attendance_logs\` DROP COLUMN \`card_reader_kind\``);
        }
    }

    private async hasColumn(queryRunner: QueryRunner, tableName: string, columnName: string): Promise<boolean> {
        const result = await queryRunner.query(
            `SELECT 1
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND COLUMN_NAME = ?
             LIMIT 1`,
            [tableName, columnName],
        );

        return result.length > 0;
    }

    private async hasIndex(queryRunner: QueryRunner, tableName: string, indexName: string): Promise<boolean> {
        const result = await queryRunner.query(
            `SELECT 1
             FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND INDEX_NAME = ?
             LIMIT 1`,
            [tableName, indexName],
        );

        return result.length > 0;
    }
}
