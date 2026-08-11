import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { KpiApplicabilityRule } from '../../modules/hr/performance/entities/kpi-applicability-rule.entity';
import { KpiDefinition } from '../../modules/hr/performance/entities/kpi-definition.entity';
import { KpiDefinitionVersion } from '../../modules/hr/performance/entities/kpi-definition-version.entity';
import { KpiTemplate } from '../../modules/hr/performance/entities/kpi-template.entity';
import { KpiTemplateItem } from '../../modules/hr/performance/entities/kpi-template-item.entity';
import { PerformanceFinancialYear } from '../../modules/hr/performance/entities/performance-financial-year.entity';
import { KpiApplicabilityRuleStatusEnum } from '../../modules/hr/performance/enums/kpi-applicability-rule-status.enum';
import { KpiDataSourceTypeEnum } from '../../modules/hr/performance/enums/kpi-data-source-type.enum';
import { KpiMeasurementDirectionEnum } from '../../modules/hr/performance/enums/kpi-measurement-direction.enum';
import { KpiScoringFormulaEnum } from '../../modules/hr/performance/enums/kpi-scoring-formula.enum';
import { KpiTemplateStatusEnum } from '../../modules/hr/performance/enums/kpi-template-status.enum';
import { PerformancePeriodTypeEnum } from '../../modules/hr/performance/enums/performance-period-type.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

type KpiSeed = {
  code: string;
  name: string;
  category: string;
  description: string;
  measurementUnit: string;
  measurementDirection: KpiMeasurementDirectionEnum;
  scoringFormula: KpiScoringFormulaEnum;
  formulaConfiguration: Record<string, unknown> | null;
  dataSourceType: KpiDataSourceTypeEnum;
  dataSourceConfiguration: Record<string, unknown> | null;
  defaultTargetValue: string | null;
  frequency: PerformancePeriodTypeEnum;
  approvalAuthority: string;
  manualEntryAllowed: boolean;
  evidenceRequired: boolean;
  applicabilitySnapshot: Record<string, unknown> | null;
  templateWeight: string;
  templateTargetValue: string | null;
  templateManualEntryAllowed: boolean;
  templateEvidenceRequired: boolean;
  templateNotes: string | null;
};

const FINANCIAL_YEAR_CODE = 'FY2026';
const KPI_TEMPLATE_CODE = 'MONTHLY_CORE_KPIS_2026';

const KPI_SEEDS: KpiSeed[] = [
  {
    code: 'TASK_COMPLETION_RATE',
    name: 'Task completion rate',
    category: 'DELIVERY',
    description:
      'Measures the percentage of agreed tasks or deliverables completed within the review period.',
    measurementUnit: 'PERCENT',
    measurementDirection: KpiMeasurementDirectionEnum.HIGHER_IS_BETTER,
    scoringFormula: KpiScoringFormulaEnum.PERCENT_TO_TARGET,
    formulaConfiguration: null,
    dataSourceType: KpiDataSourceTypeEnum.MANUAL_MANAGER,
    dataSourceConfiguration: null,
    defaultTargetValue: '100.0000',
    frequency: PerformancePeriodTypeEnum.MONTHLY,
    approvalAuthority: 'MANAGER',
    manualEntryAllowed: true,
    evidenceRequired: false,
    applicabilitySnapshot: {
      seeded: true,
      source: '042-performance-kpi-baseline',
    },
    templateWeight: '60.00',
    templateTargetValue: '100.0000',
    templateManualEntryAllowed: true,
    templateEvidenceRequired: false,
    templateNotes: 'Baseline delivery KPI for monthly performance tracking.',
  },
  {
    code: 'QUALITY_RATING',
    name: 'Quality rating',
    category: 'QUALITY',
    description:
      'Measures the quality and reliability of work output using a manager-provided monthly rating.',
    measurementUnit: 'RATING',
    measurementDirection: KpiMeasurementDirectionEnum.MANUAL_RATING,
    scoringFormula: KpiScoringFormulaEnum.MANUAL_RATING,
    formulaConfiguration: { maximum_rating: 5 },
    dataSourceType: KpiDataSourceTypeEnum.MANUAL_MANAGER,
    dataSourceConfiguration: null,
    defaultTargetValue: '5.0000',
    frequency: PerformancePeriodTypeEnum.MONTHLY,
    approvalAuthority: 'MANAGER',
    manualEntryAllowed: true,
    evidenceRequired: false,
    applicabilitySnapshot: {
      seeded: true,
      source: '042-performance-kpi-baseline',
    },
    templateWeight: '40.00',
    templateTargetValue: '5.0000',
    templateManualEntryAllowed: true,
    templateEvidenceRequired: false,
    templateNotes:
      'Manager-scored quality KPI aligned to the standard 5-point scale.',
  },
];

export default class PerformanceKpiBaselineSeeder implements Seeder {
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
      const definitionRepo = qr.manager.getRepository(KpiDefinition);
      const versionRepo = qr.manager.getRepository(KpiDefinitionVersion);
      const templateRepo = qr.manager.getRepository(KpiTemplate);
      const templateItemRepo = qr.manager.getRepository(KpiTemplateItem);
      const ruleRepo = qr.manager.getRepository(KpiApplicabilityRule);
      const financialYearRepo = qr.manager.getRepository(
        PerformanceFinancialYear,
      );

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

      const financialYear = await financialYearRepo.findOne({
        where: { companyId: company.id, code: FINANCIAL_YEAR_CODE },
      });

      if (!financialYear) {
        throw new Error(
          `Performance financial year "${FINANCIAL_YEAR_CODE}" not found. Run 041-performance-baseline.seed.ts first.`,
        );
      }

      const versionByCode = new Map<string, KpiDefinitionVersion>();

      for (const seed of KPI_SEEDS) {
        let definition = await definitionRepo.findOne({
          where: { companyId: company.id, code: seed.code },
        });

        if (!definition) {
          definition = definitionRepo.create({
            companyId: company.id,
            code: seed.code,
          });
        }

        definition.name = seed.name;
        definition.category = seed.category;
        definition.status = 'ACTIVE';
        definition.createdByCompanyUserId = null;
        definition = await definitionRepo.save(definition);

        let version = await versionRepo.findOne({
          where: {
            kpiDefinitionId: definition.id,
            versionNumber: 1,
          },
        });

        if (!version) {
          version = versionRepo.create({
            kpiDefinitionId: definition.id,
            versionNumber: 1,
          });
        }

        version.description = seed.description;
        version.measurementUnit = seed.measurementUnit;
        version.measurementDirection = seed.measurementDirection;
        version.scoringFormula = seed.scoringFormula;
        version.formulaConfiguration = seed.formulaConfiguration;
        version.dataSourceType = seed.dataSourceType;
        version.dataSourceConfiguration = seed.dataSourceConfiguration;
        version.defaultTargetValue = seed.defaultTargetValue;
        version.frequency = seed.frequency;
        version.approvalAuthority = seed.approvalAuthority;
        version.manualEntryAllowed = seed.manualEntryAllowed;
        version.evidenceRequired = seed.evidenceRequired;
        version.applicabilitySnapshot = seed.applicabilitySnapshot;
        version.publishedAt = null;
        version = await versionRepo.save(version);

        definition.currentVersionId = version.id;
        await definitionRepo.save(definition);

        versionByCode.set(seed.code, version);
      }

      let template = await templateRepo.findOne({
        where: { companyId: company.id, code: KPI_TEMPLATE_CODE },
      });

      if (!template) {
        template = templateRepo.create({
          companyId: company.id,
          code: KPI_TEMPLATE_CODE,
        });
      }

      template.name = 'Monthly core KPI template';
      template.description =
        'Baseline monthly KPI template for company-wide performance plan generation.';
      template.status = KpiTemplateStatusEnum.ACTIVE;
      template.reviewCycle = 'MONTHLY';
      template.metadata = {
        seeded: true,
        source: '042-performance-kpi-baseline',
      };
      template = await templateRepo.save(template);

      for (const seed of KPI_SEEDS) {
        const version = versionByCode.get(seed.code);
        if (!version) {
          throw new Error(`KPI version missing for code "${seed.code}".`);
        }

        let item = await templateItemRepo.findOne({
          where: {
            templateId: template.id,
            kpiDefinitionVersionId: version.id,
          },
        });

        if (!item) {
          item = templateItemRepo.create({
            templateId: template.id,
            kpiDefinitionVersionId: version.id,
          });
        }

        item.weight = seed.templateWeight;
        item.targetValue = seed.templateTargetValue;
        item.manualEntryAllowed = seed.templateManualEntryAllowed;
        item.evidenceRequired = seed.templateEvidenceRequired;
        item.notes = seed.templateNotes;
        await templateItemRepo.save(item);
      }

      for (const [index, seed] of KPI_SEEDS.entries()) {
        const version = versionByCode.get(seed.code);
        if (!version) {
          continue;
        }

        let rule = await ruleRepo.findOne({
          where: {
            companyId: company.id,
            kpiDefinitionVersionId: version.id,
            priority: 10 + index,
          },
        });

        if (!rule) {
          rule = ruleRepo.create({
            companyId: company.id,
            kpiDefinitionVersionId: version.id,
            priority: 10 + index,
          });
        }

        rule.name = `${seed.name} baseline applicability`;
        rule.status = KpiApplicabilityRuleStatusEnum.ACTIVE;
        rule.financialYearId = financialYear.id;
        rule.branchId = null;
        rule.departmentId = null;
        rule.positionId = null;
        rule.gradeId = null;
        rule.employmentType = null;
        rule.employeeId = null;
        rule.reviewCycle = 'MONTHLY';
        rule.templateCode = KPI_TEMPLATE_CODE;
        rule.weightOverride = null;
        rule.targetOverride = null;
        rule.metadata = {
          seeded: true,
          source: '042-performance-kpi-baseline',
        };
        await ruleRepo.save(rule);
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][PerformanceKpiBaseline] Seeded ${KPI_SEEDS.length} KPI definitions, a template, and applicability rules for company "${company.name}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][PerformanceKpiBaseline] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
