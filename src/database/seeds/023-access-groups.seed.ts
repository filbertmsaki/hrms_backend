import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { AttendanceDevice } from '../../modules/access-control/attendance-devices/entities/attendance-device.entity';
import { AccessOrganization } from '../../modules/access-control/access-organizations/entity/access-organization.entity';
import { AccessGroup } from '../../modules/access-control/access-groups/entity/access-group.entity';
import { AccessGroupDevice } from '../../modules/access-control/access-group-devices/entity/access-group-device.entity';
import { AccessGroupSourceEnum } from '../../modules/access-control/access-groups/enum/access-group-source.enum';
import { AccessGroupStatusEnum } from '../../modules/access-control/access-groups/enum/access-group-status.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

const ROOT_ORG_NAME = 'Alliance staff';
const DEFAULT_DEVICE_CODE = 'ALLIANCE-HQ-MAIN';

export default class AccessGroupsSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const companyRepo = qr.manager.getRepository(Company);
      const deviceRepo = qr.manager.getRepository(AttendanceDevice);
      const orgRepo = qr.manager.getRepository(AccessOrganization);
      const groupRepo = qr.manager.getRepository(AccessGroup);
      const groupDeviceRepo = qr.manager.getRepository(AccessGroupDevice);

      const companyName =
        process.env.DEFAULT_COMPANY_NAME ?? ALLIANCE_COMPANY_NAME;
      const company = await companyRepo.findOne({
        where: { slug: ALLIANCE_COMPANY_SLUG },
      });
      if (!company) {
        throw new Error(
          `Company "${companyName}" not found. Run 004-company.seed.ts first.`,
        );
      }

      const device = await deviceRepo.findOne({
        where: { deviceCode: DEFAULT_DEVICE_CODE },
      });
      if (!device) {
        throw new Error(
          `Device "${DEFAULT_DEVICE_CODE}" not found. Run 021-attendance-devices.seed.ts first.`,
        );
      }

      const org = await orgRepo.findOne({
        where: { companyId: company.id, orgName: ROOT_ORG_NAME },
      });
      if (!org) {
        throw new Error(
          `AccessOrganization "${ROOT_ORG_NAME}" not found. Run 022-access-organizations.seed.ts first.`,
        );
      }

      const groupName = 'ALL ACCESS';
      const groupingKey = `device:${device.id}|all-access`;

      let group = await groupRepo.findOne({
        where: { companyId: company.id, groupingKey },
      });

      if (!group) {
        group = groupRepo.create({
          companyId: company.id,
          groupingKey,
        });
      }

      group.name = groupName;
      group.groupCode = 'ALL-ACCESS';
      group.description = 'Virtual group granting all-access to all enrolled employees';
      group.organizationId = org.id;
      group.source = AccessGroupSourceEnum.BACKEND;
      group.status = AccessGroupStatusEnum.ACTIVE;
      group.isVirtual = true;
      group.isActive = true;
      group.metadata = { seeded: true, source: '023-access-groups' };

      await groupRepo.save(group);

      // Upsert AccessGroupDevice join
      const existingGroupDevice = await groupDeviceRepo.findOne({
        where: { accessGroupId: group.id, deviceId: device.id },
      });

      if (!existingGroupDevice) {
        await groupDeviceRepo.save(
          groupDeviceRepo.create({
            accessGroupId: group.id,
            deviceId: device.id,
            metadata: { seeded: true, source: '023-access-groups' },
          }),
        );
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][AccessGroups] Upserted group "${groupName}" linked to device "${DEFAULT_DEVICE_CODE}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][AccessGroups] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
