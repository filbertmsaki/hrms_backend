import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1781525235156 implements MigrationInterface {
    name = 'Migration1781525235156'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const __tbl_FK_attendance_wifi_networks_branch_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_wifi_networks']);
        if (__tbl_FK_attendance_wifi_networks_branch_id.length) {
          const __hasFk_FK_attendance_wifi_networks_branch_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_wifi_networks', 'FK_attendance_wifi_networks_branch_id']);
          if (__hasFk_FK_attendance_wifi_networks_branch_id.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_wifi_networks\` DROP FOREIGN KEY \`FK_attendance_wifi_networks_branch_id\``);
          }
        }
        const __tbl_FK_attendance_wifi_networks_company_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_wifi_networks']);
        if (__tbl_FK_attendance_wifi_networks_company_id.length) {
          const __hasFk_FK_attendance_wifi_networks_company_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_wifi_networks', 'FK_attendance_wifi_networks_company_id']);
          if (__hasFk_FK_attendance_wifi_networks_company_id.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_wifi_networks\` DROP FOREIGN KEY \`FK_attendance_wifi_networks_company_id\``);
          }
        }
        const __tbl_FK_timetable_shift_rules_shift_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_shift_rules']);
        if (__tbl_FK_timetable_shift_rules_shift_id.length) {
          const __hasFk_FK_timetable_shift_rules_shift_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_shift_rules', 'FK_timetable_shift_rules_shift_id']);
          if (__hasFk_FK_timetable_shift_rules_shift_id.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_shift_rules\` DROP FOREIGN KEY \`FK_timetable_shift_rules_shift_id\``);
          }
        }
        const __tbl_FK_timetable_days_default_shift_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_days']);
        if (__tbl_FK_timetable_days_default_shift_id.length) {
          const __hasFk_FK_timetable_days_default_shift_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_days', 'FK_timetable_days_default_shift_id']);
          if (__hasFk_FK_timetable_days_default_shift_id.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_days\` DROP FOREIGN KEY \`FK_timetable_days_default_shift_id\``);
          }
        }
        const __tbl_FK_timetable_rotation_rules_shift_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_rotation_rules']);
        if (__tbl_FK_timetable_rotation_rules_shift_id.length) {
          const __hasFk_FK_timetable_rotation_rules_shift_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_rotation_rules', 'FK_timetable_rotation_rules_shift_id']);
          if (__hasFk_FK_timetable_rotation_rules_shift_id.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_rotation_rules\` DROP FOREIGN KEY \`FK_timetable_rotation_rules_shift_id\``);
          }
        }
        const __tbl_FK_timetable_generated_schedules_shift_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_generated_schedules']);
        if (__tbl_FK_timetable_generated_schedules_shift_id.length) {
          const __hasFk_FK_timetable_generated_schedules_shift_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_generated_schedules', 'FK_timetable_generated_schedules_shift_id']);
          if (__hasFk_FK_timetable_generated_schedules_shift_id.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_generated_schedules\` DROP FOREIGN KEY \`FK_timetable_generated_schedules_shift_id\``);
          }
        }
        const __tbl_FK_attendance_geofences_branch_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_geofences']);
        if (__tbl_FK_attendance_geofences_branch_id.length) {
          const __hasFk_FK_attendance_geofences_branch_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_geofences', 'FK_attendance_geofences_branch_id']);
          if (__hasFk_FK_attendance_geofences_branch_id.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_geofences\` DROP FOREIGN KEY \`FK_attendance_geofences_branch_id\``);
          }
        }
        const __tbl_FK_attendance_geofences_company_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_geofences']);
        if (__tbl_FK_attendance_geofences_company_id.length) {
          const __hasFk_FK_attendance_geofences_company_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_geofences', 'FK_attendance_geofences_company_id']);
          if (__hasFk_FK_attendance_geofences_company_id.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_geofences\` DROP FOREIGN KEY \`FK_attendance_geofences_company_id\``);
          }
        }
        const __tbl_FK_attendance_checkpoints_wifi_network_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_checkpoints']);
        if (__tbl_FK_attendance_checkpoints_wifi_network_id.length) {
          const __hasFk_FK_attendance_checkpoints_wifi_network_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_checkpoints', 'FK_attendance_checkpoints_wifi_network_id']);
          if (__hasFk_FK_attendance_checkpoints_wifi_network_id.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_checkpoints\` DROP FOREIGN KEY \`FK_attendance_checkpoints_wifi_network_id\``);
          }
        }
        const __tbl_FK_attendance_mobile_punches_branch_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_mobile_punches']);
        if (__tbl_FK_attendance_mobile_punches_branch_id.length) {
          const __hasFk_FK_attendance_mobile_punches_branch_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_attendance_mobile_punches_branch_id']);
          if (__hasFk_FK_attendance_mobile_punches_branch_id.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` DROP FOREIGN KEY \`FK_attendance_mobile_punches_branch_id\``);
          }
        }
        const __tbl_FK_attendance_mobile_punches_company_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_mobile_punches']);
        if (__tbl_FK_attendance_mobile_punches_company_id.length) {
          const __hasFk_FK_attendance_mobile_punches_company_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_attendance_mobile_punches_company_id']);
          if (__hasFk_FK_attendance_mobile_punches_company_id.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` DROP FOREIGN KEY \`FK_attendance_mobile_punches_company_id\``);
          }
        }
        const __tbl_FK_attendance_mobile_punches_employee_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_mobile_punches']);
        if (__tbl_FK_attendance_mobile_punches_employee_id.length) {
          const __hasFk_FK_attendance_mobile_punches_employee_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_attendance_mobile_punches_employee_id']);
          if (__hasFk_FK_attendance_mobile_punches_employee_id.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` DROP FOREIGN KEY \`FK_attendance_mobile_punches_employee_id\``);
          }
        }
        const __tbl_FK_attendance_mobile_punches_geofence_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_mobile_punches']);
        if (__tbl_FK_attendance_mobile_punches_geofence_id.length) {
          const __hasFk_FK_attendance_mobile_punches_geofence_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_attendance_mobile_punches_geofence_id']);
          if (__hasFk_FK_attendance_mobile_punches_geofence_id.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` DROP FOREIGN KEY \`FK_attendance_mobile_punches_geofence_id\``);
          }
        }
        const __tbl_FK_attendance_mobile_punches_override_reviewed_by = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_mobile_punches']);
        if (__tbl_FK_attendance_mobile_punches_override_reviewed_by.length) {
          const __hasFk_FK_attendance_mobile_punches_override_reviewed_by = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_attendance_mobile_punches_override_reviewed_by']);
          if (__hasFk_FK_attendance_mobile_punches_override_reviewed_by.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` DROP FOREIGN KEY \`FK_attendance_mobile_punches_override_reviewed_by\``);
          }
        }
        const __tbl_FK_attendance_mobile_punches_policy_set_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_mobile_punches']);
        if (__tbl_FK_attendance_mobile_punches_policy_set_id.length) {
          const __hasFk_FK_attendance_mobile_punches_policy_set_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_attendance_mobile_punches_policy_set_id']);
          if (__hasFk_FK_attendance_mobile_punches_policy_set_id.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` DROP FOREIGN KEY \`FK_attendance_mobile_punches_policy_set_id\``);
          }
        }
        const __tbl_FK_attendance_mobile_punches_wifi_network_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_mobile_punches']);
        if (__tbl_FK_attendance_mobile_punches_wifi_network_id.length) {
          const __hasFk_FK_attendance_mobile_punches_wifi_network_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_attendance_mobile_punches_wifi_network_id']);
          if (__hasFk_FK_attendance_mobile_punches_wifi_network_id.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` DROP FOREIGN KEY \`FK_attendance_mobile_punches_wifi_network_id\``);
          }
        }
        const __tbl_FK_hikvision_att_sync_jobs_company_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['hikvision_attendance_sync_jobs']);
        if (__tbl_FK_hikvision_att_sync_jobs_company_id.length) {
          const __hasFk_FK_hikvision_att_sync_jobs_company_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['hikvision_attendance_sync_jobs', 'FK_hikvision_att_sync_jobs_company_id']);
          if (__hasFk_FK_hikvision_att_sync_jobs_company_id.length) {
            await queryRunner.query(`ALTER TABLE \`hikvision_attendance_sync_jobs\` DROP FOREIGN KEY \`FK_hikvision_att_sync_jobs_company_id\``);
          }
        }
        const __tbl_FK_hikvision_att_sync_jobs_device_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['hikvision_attendance_sync_jobs']);
        if (__tbl_FK_hikvision_att_sync_jobs_device_id.length) {
          const __hasFk_FK_hikvision_att_sync_jobs_device_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['hikvision_attendance_sync_jobs', 'FK_hikvision_att_sync_jobs_device_id']);
          if (__hasFk_FK_hikvision_att_sync_jobs_device_id.length) {
            await queryRunner.query(`ALTER TABLE \`hikvision_attendance_sync_jobs\` DROP FOREIGN KEY \`FK_hikvision_att_sync_jobs_device_id\``);
          }
        }
        await queryRunner.query(`DROP INDEX \`IDX_attendance_device_sync_logs_company_device_started\` ON \`attendance_device_sync_logs\``);
        await queryRunner.query(`ALTER TABLE \`attendance_device_sync_logs\` CHANGE \`started_at\` \`started_at\` timestamp NOT NULL`);
        await queryRunner.query(`DROP INDEX \`UQ_hik_att_logs_dev_emp_evt_maj_min_reader_door\` ON \`hikvision_attendance_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_hikvision_attendance_logs_device_event_time\` ON \`hikvision_attendance_logs\``);
        await queryRunner.query(`ALTER TABLE \`hikvision_attendance_logs\` CHANGE \`event_time\` \`event_time\` timestamp NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`attendance_processed_events\` CHANGE \`event_time\` \`event_time\` timestamp NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` CHANGE \`punch_time\` \`punch_time\` timestamp NOT NULL`);
        await queryRunner.query(`DROP INDEX \`IDX_hikvision_sync_logs_company_device_type_started\` ON \`hikvision_sync_logs\``);
        await queryRunner.query(`ALTER TABLE \`hikvision_sync_logs\` CHANGE \`started_at\` \`started_at\` timestamp NOT NULL`);
        await queryRunner.query(`CREATE INDEX \`IDX_attendance_device_sync_logs_company_device_started\` ON \`attendance_device_sync_logs\` (\`company_id\`, \`device_id\`, \`started_at\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_hikvision_attendance_logs_device_event_time\` ON \`hikvision_attendance_logs\` (\`device_id\`, \`event_time\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`UQ_hik_att_logs_dev_emp_evt_maj_min_reader_door\` ON \`hikvision_attendance_logs\` (\`device_id\`, \`employee_no\`, \`event_time\`, \`major\`, \`minor\`, \`card_reader_no\`, \`door_no\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_hikvision_sync_logs_company_device_type_started\` ON \`hikvision_sync_logs\` (\`company_id\`, \`device_id\`, \`sync_type\`, \`started_at\`)`);
        const __hasFkAdd_FK_4b3c1cc42bf20122424d1f984b2 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_wifi_networks', 'FK_4b3c1cc42bf20122424d1f984b2']);
        if (!__hasFkAdd_FK_4b3c1cc42bf20122424d1f984b2.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_wifi_networks\` ADD CONSTRAINT \`FK_4b3c1cc42bf20122424d1f984b2\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_46c6f879ed2a6bd9d43ff4f93af = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_wifi_networks', 'FK_46c6f879ed2a6bd9d43ff4f93af']);
        if (!__hasFkAdd_FK_46c6f879ed2a6bd9d43ff4f93af.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_wifi_networks\` ADD CONSTRAINT \`FK_46c6f879ed2a6bd9d43ff4f93af\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_e33aeba1f518e2c2530c03e72b2 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_shift_rules', 'FK_e33aeba1f518e2c2530c03e72b2']);
        if (!__hasFkAdd_FK_e33aeba1f518e2c2530c03e72b2.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_shift_rules\` ADD CONSTRAINT \`FK_e33aeba1f518e2c2530c03e72b2\` FOREIGN KEY (\`shift_id\`) REFERENCES \`shifts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_5b6af668e10a40f4156740a1039 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_days', 'FK_5b6af668e10a40f4156740a1039']);
        if (!__hasFkAdd_FK_5b6af668e10a40f4156740a1039.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_days\` ADD CONSTRAINT \`FK_5b6af668e10a40f4156740a1039\` FOREIGN KEY (\`default_shift_id\`) REFERENCES \`shifts\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_0962adaf3fc46db4df3338d518d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_rotation_rules', 'FK_0962adaf3fc46db4df3338d518d']);
        if (!__hasFkAdd_FK_0962adaf3fc46db4df3338d518d.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_rotation_rules\` ADD CONSTRAINT \`FK_0962adaf3fc46db4df3338d518d\` FOREIGN KEY (\`shift_id\`) REFERENCES \`shifts\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_a426f933927b34bd28948886b75 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_generated_schedules', 'FK_a426f933927b34bd28948886b75']);
        if (!__hasFkAdd_FK_a426f933927b34bd28948886b75.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_generated_schedules\` ADD CONSTRAINT \`FK_a426f933927b34bd28948886b75\` FOREIGN KEY (\`shift_id\`) REFERENCES \`shifts\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_1fe14284aa35db60ca062a16cab = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_geofences', 'FK_1fe14284aa35db60ca062a16cab']);
        if (!__hasFkAdd_FK_1fe14284aa35db60ca062a16cab.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_geofences\` ADD CONSTRAINT \`FK_1fe14284aa35db60ca062a16cab\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_92d5c622dfe9f5eb1cff1649381 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_geofences', 'FK_92d5c622dfe9f5eb1cff1649381']);
        if (!__hasFkAdd_FK_92d5c622dfe9f5eb1cff1649381.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_geofences\` ADD CONSTRAINT \`FK_92d5c622dfe9f5eb1cff1649381\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_cb657132b304d648425d340125f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_checkpoints', 'FK_cb657132b304d648425d340125f']);
        if (!__hasFkAdd_FK_cb657132b304d648425d340125f.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_checkpoints\` ADD CONSTRAINT \`FK_cb657132b304d648425d340125f\` FOREIGN KEY (\`geofence_id\`) REFERENCES \`attendance_geofences\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_b20e22eb0d2aba3637b9dce56b3 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_checkpoints', 'FK_b20e22eb0d2aba3637b9dce56b3']);
        if (!__hasFkAdd_FK_b20e22eb0d2aba3637b9dce56b3.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_checkpoints\` ADD CONSTRAINT \`FK_b20e22eb0d2aba3637b9dce56b3\` FOREIGN KEY (\`wifi_network_id\`) REFERENCES \`attendance_wifi_networks\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_d166cd631dec2913cfaa762ef1a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_d166cd631dec2913cfaa762ef1a']);
        if (!__hasFkAdd_FK_d166cd631dec2913cfaa762ef1a.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` ADD CONSTRAINT \`FK_d166cd631dec2913cfaa762ef1a\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_46f0e9bdacd50d36221e0ff6177 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_46f0e9bdacd50d36221e0ff6177']);
        if (!__hasFkAdd_FK_46f0e9bdacd50d36221e0ff6177.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` ADD CONSTRAINT \`FK_46f0e9bdacd50d36221e0ff6177\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_d8b490b1e812176b892de43f2e5 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_d8b490b1e812176b892de43f2e5']);
        if (!__hasFkAdd_FK_d8b490b1e812176b892de43f2e5.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` ADD CONSTRAINT \`FK_d8b490b1e812176b892de43f2e5\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_db0f80bdfa9b64de6dd87e7d60f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_db0f80bdfa9b64de6dd87e7d60f']);
        if (!__hasFkAdd_FK_db0f80bdfa9b64de6dd87e7d60f.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` ADD CONSTRAINT \`FK_db0f80bdfa9b64de6dd87e7d60f\` FOREIGN KEY (\`policy_set_id\`) REFERENCES \`attendance_policies\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_72ed0fe3d0c91d7dcda3874ac4e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_72ed0fe3d0c91d7dcda3874ac4e']);
        if (!__hasFkAdd_FK_72ed0fe3d0c91d7dcda3874ac4e.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` ADD CONSTRAINT \`FK_72ed0fe3d0c91d7dcda3874ac4e\` FOREIGN KEY (\`geofence_id\`) REFERENCES \`attendance_geofences\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_477df3ac2888ba7ad2b91191bc2 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_477df3ac2888ba7ad2b91191bc2']);
        if (!__hasFkAdd_FK_477df3ac2888ba7ad2b91191bc2.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` ADD CONSTRAINT \`FK_477df3ac2888ba7ad2b91191bc2\` FOREIGN KEY (\`wifi_network_id\`) REFERENCES \`attendance_wifi_networks\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_7c0ab0e8c1011d770eaaf1be8ae = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_7c0ab0e8c1011d770eaaf1be8ae']);
        if (!__hasFkAdd_FK_7c0ab0e8c1011d770eaaf1be8ae.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` ADD CONSTRAINT \`FK_7c0ab0e8c1011d770eaaf1be8ae\` FOREIGN KEY (\`override_reviewed_by\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_adc76a95bfeb081af069219e8d3 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['hikvision_attendance_sync_jobs', 'FK_adc76a95bfeb081af069219e8d3']);
        if (!__hasFkAdd_FK_adc76a95bfeb081af069219e8d3.length) {
          await queryRunner.query(`ALTER TABLE \`hikvision_attendance_sync_jobs\` ADD CONSTRAINT \`FK_adc76a95bfeb081af069219e8d3\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_5fc0293fc22fcb44c4b58769aa9 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['hikvision_attendance_sync_jobs', 'FK_5fc0293fc22fcb44c4b58769aa9']);
        if (!__hasFkAdd_FK_5fc0293fc22fcb44c4b58769aa9.length) {
          await queryRunner.query(`ALTER TABLE \`hikvision_attendance_sync_jobs\` ADD CONSTRAINT \`FK_5fc0293fc22fcb44c4b58769aa9\` FOREIGN KEY (\`device_id\`) REFERENCES \`attendance_devices\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const __tbl_FK_5fc0293fc22fcb44c4b58769aa9 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['hikvision_attendance_sync_jobs']);
        if (__tbl_FK_5fc0293fc22fcb44c4b58769aa9.length) {
          const __hasFk_FK_5fc0293fc22fcb44c4b58769aa9 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['hikvision_attendance_sync_jobs', 'FK_5fc0293fc22fcb44c4b58769aa9']);
          if (__hasFk_FK_5fc0293fc22fcb44c4b58769aa9.length) {
            await queryRunner.query(`ALTER TABLE \`hikvision_attendance_sync_jobs\` DROP FOREIGN KEY \`FK_5fc0293fc22fcb44c4b58769aa9\``);
          }
        }
        const __tbl_FK_adc76a95bfeb081af069219e8d3 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['hikvision_attendance_sync_jobs']);
        if (__tbl_FK_adc76a95bfeb081af069219e8d3.length) {
          const __hasFk_FK_adc76a95bfeb081af069219e8d3 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['hikvision_attendance_sync_jobs', 'FK_adc76a95bfeb081af069219e8d3']);
          if (__hasFk_FK_adc76a95bfeb081af069219e8d3.length) {
            await queryRunner.query(`ALTER TABLE \`hikvision_attendance_sync_jobs\` DROP FOREIGN KEY \`FK_adc76a95bfeb081af069219e8d3\``);
          }
        }
        const __tbl_FK_7c0ab0e8c1011d770eaaf1be8ae = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_mobile_punches']);
        if (__tbl_FK_7c0ab0e8c1011d770eaaf1be8ae.length) {
          const __hasFk_FK_7c0ab0e8c1011d770eaaf1be8ae = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_7c0ab0e8c1011d770eaaf1be8ae']);
          if (__hasFk_FK_7c0ab0e8c1011d770eaaf1be8ae.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` DROP FOREIGN KEY \`FK_7c0ab0e8c1011d770eaaf1be8ae\``);
          }
        }
        const __tbl_FK_477df3ac2888ba7ad2b91191bc2 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_mobile_punches']);
        if (__tbl_FK_477df3ac2888ba7ad2b91191bc2.length) {
          const __hasFk_FK_477df3ac2888ba7ad2b91191bc2 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_477df3ac2888ba7ad2b91191bc2']);
          if (__hasFk_FK_477df3ac2888ba7ad2b91191bc2.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` DROP FOREIGN KEY \`FK_477df3ac2888ba7ad2b91191bc2\``);
          }
        }
        const __tbl_FK_72ed0fe3d0c91d7dcda3874ac4e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_mobile_punches']);
        if (__tbl_FK_72ed0fe3d0c91d7dcda3874ac4e.length) {
          const __hasFk_FK_72ed0fe3d0c91d7dcda3874ac4e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_72ed0fe3d0c91d7dcda3874ac4e']);
          if (__hasFk_FK_72ed0fe3d0c91d7dcda3874ac4e.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` DROP FOREIGN KEY \`FK_72ed0fe3d0c91d7dcda3874ac4e\``);
          }
        }
        const __tbl_FK_db0f80bdfa9b64de6dd87e7d60f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_mobile_punches']);
        if (__tbl_FK_db0f80bdfa9b64de6dd87e7d60f.length) {
          const __hasFk_FK_db0f80bdfa9b64de6dd87e7d60f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_db0f80bdfa9b64de6dd87e7d60f']);
          if (__hasFk_FK_db0f80bdfa9b64de6dd87e7d60f.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` DROP FOREIGN KEY \`FK_db0f80bdfa9b64de6dd87e7d60f\``);
          }
        }
        const __tbl_FK_d8b490b1e812176b892de43f2e5 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_mobile_punches']);
        if (__tbl_FK_d8b490b1e812176b892de43f2e5.length) {
          const __hasFk_FK_d8b490b1e812176b892de43f2e5 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_d8b490b1e812176b892de43f2e5']);
          if (__hasFk_FK_d8b490b1e812176b892de43f2e5.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` DROP FOREIGN KEY \`FK_d8b490b1e812176b892de43f2e5\``);
          }
        }
        const __tbl_FK_46f0e9bdacd50d36221e0ff6177 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_mobile_punches']);
        if (__tbl_FK_46f0e9bdacd50d36221e0ff6177.length) {
          const __hasFk_FK_46f0e9bdacd50d36221e0ff6177 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_46f0e9bdacd50d36221e0ff6177']);
          if (__hasFk_FK_46f0e9bdacd50d36221e0ff6177.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` DROP FOREIGN KEY \`FK_46f0e9bdacd50d36221e0ff6177\``);
          }
        }
        const __tbl_FK_d166cd631dec2913cfaa762ef1a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_mobile_punches']);
        if (__tbl_FK_d166cd631dec2913cfaa762ef1a.length) {
          const __hasFk_FK_d166cd631dec2913cfaa762ef1a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_d166cd631dec2913cfaa762ef1a']);
          if (__hasFk_FK_d166cd631dec2913cfaa762ef1a.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` DROP FOREIGN KEY \`FK_d166cd631dec2913cfaa762ef1a\``);
          }
        }
        const __tbl_FK_b20e22eb0d2aba3637b9dce56b3 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_checkpoints']);
        if (__tbl_FK_b20e22eb0d2aba3637b9dce56b3.length) {
          const __hasFk_FK_b20e22eb0d2aba3637b9dce56b3 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_checkpoints', 'FK_b20e22eb0d2aba3637b9dce56b3']);
          if (__hasFk_FK_b20e22eb0d2aba3637b9dce56b3.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_checkpoints\` DROP FOREIGN KEY \`FK_b20e22eb0d2aba3637b9dce56b3\``);
          }
        }
        const __tbl_FK_cb657132b304d648425d340125f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_checkpoints']);
        if (__tbl_FK_cb657132b304d648425d340125f.length) {
          const __hasFk_FK_cb657132b304d648425d340125f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_checkpoints', 'FK_cb657132b304d648425d340125f']);
          if (__hasFk_FK_cb657132b304d648425d340125f.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_checkpoints\` DROP FOREIGN KEY \`FK_cb657132b304d648425d340125f\``);
          }
        }
        const __tbl_FK_92d5c622dfe9f5eb1cff1649381 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_geofences']);
        if (__tbl_FK_92d5c622dfe9f5eb1cff1649381.length) {
          const __hasFk_FK_92d5c622dfe9f5eb1cff1649381 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_geofences', 'FK_92d5c622dfe9f5eb1cff1649381']);
          if (__hasFk_FK_92d5c622dfe9f5eb1cff1649381.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_geofences\` DROP FOREIGN KEY \`FK_92d5c622dfe9f5eb1cff1649381\``);
          }
        }
        const __tbl_FK_1fe14284aa35db60ca062a16cab = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_geofences']);
        if (__tbl_FK_1fe14284aa35db60ca062a16cab.length) {
          const __hasFk_FK_1fe14284aa35db60ca062a16cab = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_geofences', 'FK_1fe14284aa35db60ca062a16cab']);
          if (__hasFk_FK_1fe14284aa35db60ca062a16cab.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_geofences\` DROP FOREIGN KEY \`FK_1fe14284aa35db60ca062a16cab\``);
          }
        }
        const __tbl_FK_a426f933927b34bd28948886b75 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_generated_schedules']);
        if (__tbl_FK_a426f933927b34bd28948886b75.length) {
          const __hasFk_FK_a426f933927b34bd28948886b75 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_generated_schedules', 'FK_a426f933927b34bd28948886b75']);
          if (__hasFk_FK_a426f933927b34bd28948886b75.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_generated_schedules\` DROP FOREIGN KEY \`FK_a426f933927b34bd28948886b75\``);
          }
        }
        const __tbl_FK_0962adaf3fc46db4df3338d518d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_rotation_rules']);
        if (__tbl_FK_0962adaf3fc46db4df3338d518d.length) {
          const __hasFk_FK_0962adaf3fc46db4df3338d518d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_rotation_rules', 'FK_0962adaf3fc46db4df3338d518d']);
          if (__hasFk_FK_0962adaf3fc46db4df3338d518d.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_rotation_rules\` DROP FOREIGN KEY \`FK_0962adaf3fc46db4df3338d518d\``);
          }
        }
        const __tbl_FK_5b6af668e10a40f4156740a1039 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_days']);
        if (__tbl_FK_5b6af668e10a40f4156740a1039.length) {
          const __hasFk_FK_5b6af668e10a40f4156740a1039 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_days', 'FK_5b6af668e10a40f4156740a1039']);
          if (__hasFk_FK_5b6af668e10a40f4156740a1039.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_days\` DROP FOREIGN KEY \`FK_5b6af668e10a40f4156740a1039\``);
          }
        }
        const __tbl_FK_e33aeba1f518e2c2530c03e72b2 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_shift_rules']);
        if (__tbl_FK_e33aeba1f518e2c2530c03e72b2.length) {
          const __hasFk_FK_e33aeba1f518e2c2530c03e72b2 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_shift_rules', 'FK_e33aeba1f518e2c2530c03e72b2']);
          if (__hasFk_FK_e33aeba1f518e2c2530c03e72b2.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_shift_rules\` DROP FOREIGN KEY \`FK_e33aeba1f518e2c2530c03e72b2\``);
          }
        }
        const __tbl_FK_46c6f879ed2a6bd9d43ff4f93af = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_wifi_networks']);
        if (__tbl_FK_46c6f879ed2a6bd9d43ff4f93af.length) {
          const __hasFk_FK_46c6f879ed2a6bd9d43ff4f93af = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_wifi_networks', 'FK_46c6f879ed2a6bd9d43ff4f93af']);
          if (__hasFk_FK_46c6f879ed2a6bd9d43ff4f93af.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_wifi_networks\` DROP FOREIGN KEY \`FK_46c6f879ed2a6bd9d43ff4f93af\``);
          }
        }
        const __tbl_FK_4b3c1cc42bf20122424d1f984b2 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_wifi_networks']);
        if (__tbl_FK_4b3c1cc42bf20122424d1f984b2.length) {
          const __hasFk_FK_4b3c1cc42bf20122424d1f984b2 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_wifi_networks', 'FK_4b3c1cc42bf20122424d1f984b2']);
          if (__hasFk_FK_4b3c1cc42bf20122424d1f984b2.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_wifi_networks\` DROP FOREIGN KEY \`FK_4b3c1cc42bf20122424d1f984b2\``);
          }
        }
        await queryRunner.query(`DROP INDEX \`IDX_hikvision_sync_logs_company_device_type_started\` ON \`hikvision_sync_logs\``);
        await queryRunner.query(`DROP INDEX \`UQ_hik_att_logs_dev_emp_evt_maj_min_reader_door\` ON \`hikvision_attendance_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_hikvision_attendance_logs_device_event_time\` ON \`hikvision_attendance_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_device_sync_logs_company_device_started\` ON \`attendance_device_sync_logs\``);
        await queryRunner.query(`ALTER TABLE \`hikvision_sync_logs\` CHANGE \`started_at\` \`started_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP()`);
        await queryRunner.query(`CREATE INDEX \`IDX_hikvision_sync_logs_company_device_type_started\` ON \`hikvision_sync_logs\` (\`company_id\`, \`device_id\`, \`sync_type\`, \`started_at\`)`);
        await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` CHANGE \`punch_time\` \`punch_time\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP()`);
        await queryRunner.query(`ALTER TABLE \`attendance_processed_events\` CHANGE \`event_time\` \`event_time\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP()`);
        await queryRunner.query(`ALTER TABLE \`hikvision_attendance_logs\` CHANGE \`event_time\` \`event_time\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP()`);
        await queryRunner.query(`CREATE INDEX \`IDX_hikvision_attendance_logs_device_event_time\` ON \`hikvision_attendance_logs\` (\`device_id\`, \`event_time\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`UQ_hik_att_logs_dev_emp_evt_maj_min_reader_door\` ON \`hikvision_attendance_logs\` (\`device_id\`, \`employee_no\`, \`event_time\`, \`major\`, \`minor\`, \`card_reader_no\`, \`door_no\`)`);
        await queryRunner.query(`ALTER TABLE \`attendance_device_sync_logs\` CHANGE \`started_at\` \`started_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP()`);
        await queryRunner.query(`CREATE INDEX \`IDX_attendance_device_sync_logs_company_device_started\` ON \`attendance_device_sync_logs\` (\`company_id\`, \`device_id\`, \`started_at\`)`);
        const __hasFkAdd_FK_hikvision_att_sync_jobs_device_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['hikvision_attendance_sync_jobs', 'FK_hikvision_att_sync_jobs_device_id']);
        if (!__hasFkAdd_FK_hikvision_att_sync_jobs_device_id.length) {
          await queryRunner.query(`ALTER TABLE \`hikvision_attendance_sync_jobs\` ADD CONSTRAINT \`FK_hikvision_att_sync_jobs_device_id\` FOREIGN KEY (\`device_id\`) REFERENCES \`attendance_devices\`(\`id\`) ON DELETE CASCADE ON UPDATE RESTRICT`);
        }
        const __hasFkAdd_FK_hikvision_att_sync_jobs_company_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['hikvision_attendance_sync_jobs', 'FK_hikvision_att_sync_jobs_company_id']);
        if (!__hasFkAdd_FK_hikvision_att_sync_jobs_company_id.length) {
          await queryRunner.query(`ALTER TABLE \`hikvision_attendance_sync_jobs\` ADD CONSTRAINT \`FK_hikvision_att_sync_jobs_company_id\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE RESTRICT`);
        }
        const __hasFkAdd_FK_attendance_mobile_punches_wifi_network_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_attendance_mobile_punches_wifi_network_id']);
        if (!__hasFkAdd_FK_attendance_mobile_punches_wifi_network_id.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` ADD CONSTRAINT \`FK_attendance_mobile_punches_wifi_network_id\` FOREIGN KEY (\`wifi_network_id\`) REFERENCES \`attendance_wifi_networks\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_attendance_mobile_punches_policy_set_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_attendance_mobile_punches_policy_set_id']);
        if (!__hasFkAdd_FK_attendance_mobile_punches_policy_set_id.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` ADD CONSTRAINT \`FK_attendance_mobile_punches_policy_set_id\` FOREIGN KEY (\`policy_set_id\`) REFERENCES \`attendance_policies\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_attendance_mobile_punches_override_reviewed_by = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_attendance_mobile_punches_override_reviewed_by']);
        if (!__hasFkAdd_FK_attendance_mobile_punches_override_reviewed_by.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` ADD CONSTRAINT \`FK_attendance_mobile_punches_override_reviewed_by\` FOREIGN KEY (\`override_reviewed_by\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_attendance_mobile_punches_geofence_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_attendance_mobile_punches_geofence_id']);
        if (!__hasFkAdd_FK_attendance_mobile_punches_geofence_id.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` ADD CONSTRAINT \`FK_attendance_mobile_punches_geofence_id\` FOREIGN KEY (\`geofence_id\`) REFERENCES \`attendance_geofences\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_attendance_mobile_punches_employee_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_attendance_mobile_punches_employee_id']);
        if (!__hasFkAdd_FK_attendance_mobile_punches_employee_id.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` ADD CONSTRAINT \`FK_attendance_mobile_punches_employee_id\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_attendance_mobile_punches_company_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_attendance_mobile_punches_company_id']);
        if (!__hasFkAdd_FK_attendance_mobile_punches_company_id.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` ADD CONSTRAINT \`FK_attendance_mobile_punches_company_id\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_attendance_mobile_punches_branch_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_mobile_punches', 'FK_attendance_mobile_punches_branch_id']);
        if (!__hasFkAdd_FK_attendance_mobile_punches_branch_id.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_mobile_punches\` ADD CONSTRAINT \`FK_attendance_mobile_punches_branch_id\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_attendance_checkpoints_wifi_network_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_checkpoints', 'FK_attendance_checkpoints_wifi_network_id']);
        if (!__hasFkAdd_FK_attendance_checkpoints_wifi_network_id.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_checkpoints\` ADD CONSTRAINT \`FK_attendance_checkpoints_wifi_network_id\` FOREIGN KEY (\`wifi_network_id\`) REFERENCES \`attendance_wifi_networks\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_attendance_geofences_company_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_geofences', 'FK_attendance_geofences_company_id']);
        if (!__hasFkAdd_FK_attendance_geofences_company_id.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_geofences\` ADD CONSTRAINT \`FK_attendance_geofences_company_id\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_attendance_geofences_branch_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_geofences', 'FK_attendance_geofences_branch_id']);
        if (!__hasFkAdd_FK_attendance_geofences_branch_id.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_geofences\` ADD CONSTRAINT \`FK_attendance_geofences_branch_id\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_timetable_generated_schedules_shift_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_generated_schedules', 'FK_timetable_generated_schedules_shift_id']);
        if (!__hasFkAdd_FK_timetable_generated_schedules_shift_id.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_generated_schedules\` ADD CONSTRAINT \`FK_timetable_generated_schedules_shift_id\` FOREIGN KEY (\`shift_id\`) REFERENCES \`shifts\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_timetable_rotation_rules_shift_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_rotation_rules', 'FK_timetable_rotation_rules_shift_id']);
        if (!__hasFkAdd_FK_timetable_rotation_rules_shift_id.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_rotation_rules\` ADD CONSTRAINT \`FK_timetable_rotation_rules_shift_id\` FOREIGN KEY (\`shift_id\`) REFERENCES \`shifts\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_timetable_days_default_shift_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_days', 'FK_timetable_days_default_shift_id']);
        if (!__hasFkAdd_FK_timetable_days_default_shift_id.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_days\` ADD CONSTRAINT \`FK_timetable_days_default_shift_id\` FOREIGN KEY (\`default_shift_id\`) REFERENCES \`shifts\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_timetable_shift_rules_shift_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_shift_rules', 'FK_timetable_shift_rules_shift_id']);
        if (!__hasFkAdd_FK_timetable_shift_rules_shift_id.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_shift_rules\` ADD CONSTRAINT \`FK_timetable_shift_rules_shift_id\` FOREIGN KEY (\`shift_id\`) REFERENCES \`shifts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_attendance_wifi_networks_company_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_wifi_networks', 'FK_attendance_wifi_networks_company_id']);
        if (!__hasFkAdd_FK_attendance_wifi_networks_company_id.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_wifi_networks\` ADD CONSTRAINT \`FK_attendance_wifi_networks_company_id\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_attendance_wifi_networks_branch_id = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_wifi_networks', 'FK_attendance_wifi_networks_branch_id']);
        if (!__hasFkAdd_FK_attendance_wifi_networks_branch_id.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_wifi_networks\` ADD CONSTRAINT \`FK_attendance_wifi_networks_branch_id\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
    }

}
