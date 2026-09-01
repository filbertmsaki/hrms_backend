import { MigrationInterface, QueryRunner } from 'typeorm';
import { normalizeCompanyMetadata } from '../../common/utils/company-modules.util';

type CompanyRow = {
  id: number;
  metadata: Record<string, unknown> | null;
};

export class SplitCompanyRolePermissionModules1788300000000 implements MigrationInterface {
  name = 'SplitCompanyRolePermissionModules1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const companies = (await queryRunner.query(`
      SELECT "id", "metadata"
      FROM "companies"
    `)) as CompanyRow[];

    for (const company of companies) {
      await queryRunner.query(
        `
          UPDATE "companies"
          SET "metadata" = $2
          WHERE "id" = $1
        `,
        [company.id, normalizeCompanyMetadata(company.metadata)],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const companies = (await queryRunner.query(`
      SELECT "id", "metadata"
      FROM "companies"
    `)) as CompanyRow[];

    for (const company of companies) {
      const normalizedMetadata = normalizeCompanyMetadata(company.metadata);
      const modules =
        typeof normalizedMetadata.modules === 'object' &&
        normalizedMetadata.modules !== null &&
        !Array.isArray(normalizedMetadata.modules)
          ? { ...(normalizedMetadata.modules as Record<string, unknown>) }
          : {};

      const rolesEnabled = modules.roles === true;
      const permissionsEnabled = modules.permissions === true;

      delete modules.roles;
      delete modules.permissions;

      await queryRunner.query(
        `
          UPDATE "companies"
          SET "metadata" = $2
          WHERE "id" = $1
        `,
        [
          company.id,
          {
            ...normalizedMetadata,
            modules: {
              ...modules,
              access_governance: rolesEnabled && permissionsEnabled,
            },
          },
        ],
      );
    }
  }
}
