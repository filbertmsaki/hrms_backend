import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { KpiCategory } from '../../modules/hr/performance/entities/kpi-category.entity';
import { KpiDefinition } from '../../modules/hr/performance/entities/kpi-definition.entity';
import { KpiDefinitionVersion } from '../../modules/hr/performance/entities/kpi-definition-version.entity';
import { KpiTemplate } from '../../modules/hr/performance/entities/kpi-template.entity';
import { KpiTemplateItem } from '../../modules/hr/performance/entities/kpi-template-item.entity';
import { KpiDataSourceTypeEnum } from '../../modules/hr/performance/enums/kpi-data-source-type.enum';
import { KpiMeasurementDirectionEnum } from '../../modules/hr/performance/enums/kpi-measurement-direction.enum';
import { KpiScoringFormulaEnum } from '../../modules/hr/performance/enums/kpi-scoring-formula.enum';
import { KpiTemplateStatusEnum } from '../../modules/hr/performance/enums/kpi-template-status.enum';
import { PerformancePeriodTypeEnum } from '../../modules/hr/performance/enums/performance-period-type.enum';
import { ALLIANCE_COMPANY_SLUG } from './company-structure.constants';

const SOURCE = '046-insurance-kpi-starter';
const TEMPLATE_CODE = 'INSURANCE_HR_KPI_STARTER';

const CATEGORIES = [
  { name: 'Insurance Sales', normalizedName: 'insurance sales' },
  { name: 'Claims Service', normalizedName: 'claims service' },
  { name: 'Insurance Compliance', normalizedName: 'insurance compliance' },
];

// Candidate KPIs for HR and business owner review. Targets and role scope are
// intentionally unset; the draft template cannot be applied until approved.
const KPI_SEEDS = [
  {
    code: 'NEW_BUSINESS_PREMIUM',
    name: 'New business premium against approved target',
    category: 'Insurance Sales',
    unit: 'TZS',
    direction: KpiMeasurementDirectionEnum.HIGHER_IS_BETTER,
    formula: KpiScoringFormulaEnum.PERCENT_TO_TARGET,
    weight: '30.00',
    evidenceRequired: true,
  },
  {
    code: 'POLICY_RENEWAL_RETENTION',
    name: 'Policy renewal retention rate',
    category: 'Insurance Sales',
    unit: 'PERCENT',
    direction: KpiMeasurementDirectionEnum.HIGHER_IS_BETTER,
    formula: KpiScoringFormulaEnum.PERCENT_TO_TARGET,
    weight: '25.00',
    evidenceRequired: true,
  },
  {
    code: 'CLAIMS_TURNAROUND_DAYS',
    name: 'Claims turnaround time',
    category: 'Claims Service',
    unit: 'DAYS',
    direction: KpiMeasurementDirectionEnum.LOWER_IS_BETTER,
    formula: KpiScoringFormulaEnum.INVERSE_PERCENT_TO_TARGET,
    weight: '20.00',
    evidenceRequired: true,
  },
  {
    code: 'CLAIMS_RESOLUTION_SLA',
    name: 'Claims resolved within approved service target',
    category: 'Claims Service',
    unit: 'PERCENT',
    direction: KpiMeasurementDirectionEnum.HIGHER_IS_BETTER,
    formula: KpiScoringFormulaEnum.PERCENT_TO_TARGET,
    weight: '15.00',
    evidenceRequired: true,
  },
  {
    code: 'INSURANCE_FILE_COMPLETENESS',
    name: 'Insurance file documentation completeness',
    category: 'Insurance Compliance',
    unit: 'PERCENT',
    direction: KpiMeasurementDirectionEnum.HIGHER_IS_BETTER,
    formula: KpiScoringFormulaEnum.PERCENT_TO_TARGET,
    weight: '10.00',
    evidenceRequired: true,
  },
] as const;

export default class InsuranceKpiStarterSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const manager = queryRunner.manager;
      const company = await manager.getRepository(Company).findOne({
        where: { slug: ALLIANCE_COMPANY_SLUG },
      });
      if (!company) {
        throw new Error(
          `Company "${ALLIANCE_COMPANY_SLUG}" must exist before insurance KPI starter seeding.`,
        );
      }

      const categories = manager.getRepository(KpiCategory);
      for (const category of CATEGORIES) {
        if (
          !(await categories.findOne({
            where: {
              companyId: company.id,
              normalizedName: category.normalizedName,
            },
          }))
        ) {
          await categories.save(
            categories.create({
              companyId: company.id,
              ...category,
              description: `Provisional insurance KPI category (${SOURCE}); confirm with HR and business owners.`,
            }),
          );
        }
      }

      const definitions = manager.getRepository(KpiDefinition);
      const versions = manager.getRepository(KpiDefinitionVersion);
      const templates = manager.getRepository(KpiTemplate);
      const items = manager.getRepository(KpiTemplateItem);
      const versionsByCode = new Map<string, KpiDefinitionVersion>();

      for (const seed of KPI_SEEDS) {
        let definition = await definitions.findOne({
          where: { companyId: company.id, code: seed.code },
        });
        if (!definition) {
          definition = await definitions.save(
            definitions.create({
              companyId: company.id,
              code: seed.code,
              name: seed.name,
              category: seed.category,
              status: 'DRAFT',
              currentVersionId: null,
              createdByCompanyUserId: null,
            }),
          );
        }

        let version = await versions.findOne({
          where: { kpiDefinitionId: definition.id, versionNumber: 1 },
        });
        if (!version) {
          version = await versions.save(
            versions.create({
              kpiDefinitionId: definition.id,
              versionNumber: 1,
              description: `Provisional monthly insurance KPI. HR/business owners must approve its definition, target, role applicability, and evidence requirements. Seed: ${SOURCE}.`,
              measurementUnit: seed.unit,
              measurementDirection: seed.direction,
              scoringFormula: seed.formula,
              formulaConfiguration: null,
              dataSourceType: KpiDataSourceTypeEnum.MANUAL_MANAGER,
              dataSourceConfiguration: null,
              defaultTargetValue: null,
              frequency: PerformancePeriodTypeEnum.MONTHLY,
              approvalAuthority: 'MANAGER',
              manualEntryAllowed: true,
              evidenceRequired: seed.evidenceRequired,
              applicabilitySnapshot: {
                seeded: true,
                source: SOURCE,
                provisional: true,
                requires_business_approval: true,
              },
              publishedAt: null,
            }),
          );
        }
        if (!definition.currentVersionId) {
          definition.currentVersionId = version.id;
          await definitions.save(definition);
        }
        versionsByCode.set(seed.code, version);
      }

      let template = await templates.findOne({
        where: { companyId: company.id, code: TEMPLATE_CODE },
      });
      if (!template) {
        template = await templates.save(
          templates.create({
            companyId: company.id,
            code: TEMPLATE_CODE,
            name: 'Insurance HR KPI Starter Set (Draft)',
            description:
              'Illustrative KPI candidates only. Approve definitions, targets, weights, role applicability, and evidence rules before activation.',
            status: KpiTemplateStatusEnum.DRAFT,
            reviewCycle: 'MONTHLY',
            metadata: {
              seeded: true,
              source: SOURCE,
              provisional: true,
              requires_business_approval: true,
            },
            applicableRoleIds: [],
          }),
        );
      }

      for (const seed of KPI_SEEDS) {
        const version = versionsByCode.get(seed.code);
        if (!version)
          throw new Error(`Missing seeded version for ${seed.code}.`);
        const existing = await items.findOne({
          where: {
            templateId: template.id,
            kpiDefinitionVersionId: version.id,
          },
        });
        if (!existing) {
          await items.save(
            items.create({
              templateId: template.id,
              kpiDefinitionVersionId: version.id,
              weight: seed.weight,
              targetValue: null,
              manualEntryAllowed: true,
              evidenceRequired: seed.evidenceRequired,
              notes:
                'Draft candidate; configure approved target and role scope before activation.',
            }),
          );
        }
      }

      await queryRunner.commitTransaction();
      console.log(
        `[Seeder][InsuranceKpiStarter] Ensured ${KPI_SEEDS.length} provisional KPI candidates and one draft template for ${company.name}.`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('[Seeder][InsuranceKpiStarter] Failed:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
