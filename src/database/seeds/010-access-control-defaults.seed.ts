import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';

export default class AccessControlDefaultsSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
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
      await qr.query(
        `
        INSERT INTO access_organizations
          (company_id, branch_id, org_name, source, is_active, sync_status, created_at, updated_at)
        SELECT ?, NULL, 'Alliance staff', 'MANUAL', 1, 'PENDING', NOW(), NOW()
        FROM DUAL
        WHERE NOT EXISTS (
          SELECT 1 FROM access_organizations
          WHERE company_id = ? AND org_name = 'Alliance staff' AND deleted_at IS NULL
        )
        `,
        [companyId, companyId],
      );

      const organizations: Array<{ id: number }> = await qr.query(
        `SELECT id FROM access_organizations WHERE company_id = ? AND org_name = 'Alliance staff' ORDER BY id ASC LIMIT 1`,
        [companyId],
      );
      const defaultOrganizationId = organizations.length
        ? Number(organizations[0].id)
        : null;

      const devices: Array<{ id: number; branch_id: number | null }> =
        await qr.query(
          `SELECT id, branch_id FROM attendance_devices WHERE company_id = ? ORDER BY id ASC`,
          [companyId],
        );

      for (const device of devices) {
        const deviceId = Number(device.id);
        const branchId = device.branch_id ? Number(device.branch_id) : null;

        await qr.query(
          `
          INSERT INTO access_groups
            (company_id, branch_id, organization_id, group_name, source, grouping_key, is_virtual, is_active, status, created_at, updated_at)
          SELECT ?, ?, ?, 'ALL ACCESS', 'BACKEND', ?, 1, 1, 'ACTIVE', NOW(), NOW()
          FROM DUAL
          WHERE NOT EXISTS (
            SELECT 1 FROM access_groups
            WHERE company_id = ? AND grouping_key = ? AND group_name = 'ALL ACCESS' AND deleted_at IS NULL
          )
          `,
          [
            companyId,
            branchId,
            defaultOrganizationId,
            `device:${deviceId}|all-access`,
            companyId,
            `device:${deviceId}|all-access`,
          ],
        );

        const groups: Array<{ id: number }> = await qr.query(
          `
          SELECT id
          FROM access_groups
          WHERE company_id = ? AND grouping_key = ? AND deleted_at IS NULL
          ORDER BY id ASC
          LIMIT 1
          `,
          [companyId, `device:${deviceId}|all-access`],
        );

        if (groups.length) {
          const groupId = Number(groups[0].id);
          await qr.query(
            `
            INSERT INTO access_group_devices
              (access_group_id, device_id, metadata, created_at, updated_at)
            SELECT ?, ?, NULL, NOW(), NOW()
            FROM DUAL
            WHERE NOT EXISTS (
              SELECT 1 FROM access_group_devices
              WHERE access_group_id = ? AND device_id = ?
            )
            `,
            [groupId, deviceId, groupId, deviceId],
          );
        }
      }

      await qr.commitTransaction();
      await qr.release();
      console.log(
        '[Seeder][AccessControlDefaults] Seeded default access-control records',
      );
    } catch (error) {
      await qr.rollbackTransaction();
      await qr.release();
      console.error('[Seeder][AccessControlDefaults] Failed:', error);
      throw error;
    }
  }
}
