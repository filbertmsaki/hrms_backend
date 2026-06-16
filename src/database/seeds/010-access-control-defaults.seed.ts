import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';

export default class AccessControlDefaultsSeeder implements Seeder {
  public async run(dataSource: DataSource, factoryManager: SeederFactoryManager): Promise<void> {
    void factoryManager;
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const companies: Array<{ id: number }> = await qr.query(
        `SELECT id FROM companies ORDER BY id ASC LIMIT 1`,
      );
      if (!companies.length) {
        await qr.rollbackTransaction();
        await qr.release();
        return;
      }

      const companyId = Number(companies[0].id);
      const devices: Array<{ id: number; branch_id: number | null }> = await qr.query(
        `SELECT id, branch_id FROM attendance_devices WHERE company_id = ? ORDER BY id ASC`,
        [companyId],
      );

      for (const device of devices) {
        const deviceId = Number(device.id);
        const branchId = device.branch_id ? Number(device.branch_id) : null;

        await qr.query(
          `
          INSERT INTO access_week_plans
            (company_id, branch_id, device_id, hikvision_plan_no, name, enable, description, source, is_system_default, metadata, created_at, updated_at)
          SELECT ?, ?, ?, '1', '24 Hours', 1, 'All day authorization', 'MANUAL', 1, NULL, NOW(), NOW()
          FROM DUAL
          WHERE NOT EXISTS (
            SELECT 1 FROM access_week_plans
            WHERE company_id = ? AND device_id = ? AND hikvision_plan_no = '1' AND deleted_at IS NULL
          )
          `,
          [companyId, branchId, deviceId, companyId, deviceId],
        );

        await qr.query(
          `
          INSERT INTO access_week_plans
            (company_id, branch_id, device_id, hikvision_plan_no, name, enable, description, source, is_system_default, metadata, created_at, updated_at)
          SELECT ?, ?, ?, '2', 'All-Day Denied', 0, 'All day denied', 'MANUAL', 1, NULL, NOW(), NOW()
          FROM DUAL
          WHERE NOT EXISTS (
            SELECT 1 FROM access_week_plans
            WHERE company_id = ? AND device_id = ? AND hikvision_plan_no = '2' AND deleted_at IS NULL
          )
          `,
          [companyId, branchId, deviceId, companyId, deviceId],
        );

        const weekPlanRows: Array<{ id: number; hikvision_plan_no: string }> = await qr.query(
          `
          SELECT id, hikvision_plan_no
          FROM access_week_plans
          WHERE company_id = ? AND device_id = ? AND hikvision_plan_no IN ('1','2') AND deleted_at IS NULL
          `,
          [companyId, deviceId],
        );
        const wp1 = weekPlanRows.find((r) => String(r.hikvision_plan_no) === '1');
        const wp2 = weekPlanRows.find((r) => String(r.hikvision_plan_no) === '2');
        const weekDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

        if (wp1) {
          for (const weekDay of weekDays) {
            await qr.query(
              `
              INSERT INTO access_week_plan_segments
                (week_plan_id, week_day, segment_no, enable, begin_time, end_time, metadata, created_at, updated_at)
              SELECT ?, ?, 1, 1, '00:00:00', '24:00:00', NULL, NOW(), NOW()
              FROM DUAL
              WHERE NOT EXISTS (
                SELECT 1 FROM access_week_plan_segments
                WHERE week_plan_id = ? AND week_day = ? AND segment_no = 1
              )
              `,
              [Number(wp1.id), weekDay, Number(wp1.id), weekDay],
            );
          }
        }

        if (wp2) {
          for (const weekDay of weekDays) {
            await qr.query(
              `
              INSERT INTO access_week_plan_segments
                (week_plan_id, week_day, segment_no, enable, begin_time, end_time, metadata, created_at, updated_at)
              SELECT ?, ?, 1, 0, '00:00:00', '24:00:00', NULL, NOW(), NOW()
              FROM DUAL
              WHERE NOT EXISTS (
                SELECT 1 FROM access_week_plan_segments
                WHERE week_plan_id = ? AND week_day = ? AND segment_no = 1
              )
              `,
              [Number(wp2.id), weekDay, Number(wp2.id), weekDay],
            );
          }
        }

        await qr.query(
          `
          INSERT INTO access_groups
            (company_id, branch_id, device_id, group_name, source, grouping_key, is_virtual, is_active, status, created_at, updated_at)
          SELECT ?, ?, ?, 'ALL ACCESS', 'BACKEND', ?, 1, 1, 'ACTIVE', NOW(), NOW()
          FROM DUAL
          WHERE NOT EXISTS (
            SELECT 1 FROM access_groups
            WHERE company_id = ? AND device_id = ? AND group_name = 'ALL ACCESS' AND deleted_at IS NULL
          )
          `,
          [companyId, branchId, deviceId, `device:${deviceId}|all-access`, companyId, deviceId],
        );
      }

      await qr.query(
        `
        INSERT INTO access_organizations
          (company_id, branch_id, org_name, name, source, is_active, sync_status, created_at, updated_at)
        SELECT ?, NULL, 'Alliance staff', 'Alliance staff', 'MANUAL', 1, 'PENDING', NOW(), NOW()
        FROM DUAL
        WHERE NOT EXISTS (
          SELECT 1 FROM access_organizations
          WHERE company_id = ? AND org_name = 'Alliance staff' AND deleted_at IS NULL
        )
        `,
        [companyId, companyId],
      );

      await qr.commitTransaction();
      await qr.release();
      console.log('[Seeder][AccessControlDefaults] Seeded default access-control records');
    } catch (error) {
      await qr.rollbackTransaction();
      await qr.release();
      console.error('[Seeder][AccessControlDefaults] Failed:', error);
      throw error;
    }
  }
}
