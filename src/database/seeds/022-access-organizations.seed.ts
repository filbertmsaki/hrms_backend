import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { AccessOrganization } from '../../modules/access-control/access-organizations/entity/access-organization.entity';
import { AccessOrganizationSourceEnum } from '../../modules/access-control/access-organizations/enum/access-organization-source.enum';
import { AccessOrganizationSyncStatusEnum } from '../../modules/access-control/access-organizations/enum/access-organization-sync-status.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

const ROOT_ORG_NAME = 'Alliance staff';

export default class AccessOrganizationsSeeder implements Seeder {
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
      const orgRepo = qr.manager.getRepository(AccessOrganization);

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

      let org = await orgRepo.findOne({
        where: { companyId: company.id, orgName: ROOT_ORG_NAME },
      });

      if (!org) {
        org = orgRepo.create({
          companyId: company.id,
          orgName: ROOT_ORG_NAME,
        });
      }

      org.orgCode = 'ROOT';
      org.description = 'Root access organization for all company staff';
      org.source = AccessOrganizationSourceEnum.MANUAL;
      org.syncStatus = AccessOrganizationSyncStatusEnum.PENDING;
      org.isActive = true;
      org.branchId = null;
      org.departmentId = null;
      org.parentId = null;
      org.metadata = { seeded: true, source: '022-access-organizations' };

      await orgRepo.save(org);

      await qr.commitTransaction();
      console.log(
        `[Seeder][AccessOrganizations] Upserted root org "${ROOT_ORG_NAME}" for company "${company.name}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][AccessOrganizations] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
