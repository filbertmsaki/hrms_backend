import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { CompetencyTemplate } from '../../modules/hr/performance/entities/competency-template.entity';
import { CompetencyTemplateItem } from '../../modules/hr/performance/entities/competency-template-item.entity';
import { PerformanceFinancialYear } from '../../modules/hr/performance/entities/performance-financial-year.entity';
import { PerformancePeriod } from '../../modules/hr/performance/entities/performance-period.entity';
import { PerformanceRatingBand } from '../../modules/hr/performance/entities/performance-rating-band.entity';
import { PerformanceRatingScale } from '../../modules/hr/performance/entities/performance-rating-scale.entity';
import { PerformanceAggregationMethodEnum } from '../../modules/hr/performance/enums/performance-aggregation-method.enum';
import { PerformanceCompetencyCategoryEnum } from '../../modules/hr/performance/enums/performance-competency-category.enum';
import { PerformancePeriodStatusEnum } from '../../modules/hr/performance/enums/performance-period-status.enum';
import { PerformancePeriodFactory } from '../../modules/hr/performance/utils/performance-period-factory';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

type RatingBandSeed = {
  code: string;
  label: string;
  minimumScore: string;
  maximumScore: string;
  displayOrder: number;
  requiresImprovementPlan: boolean;
};

type CompetencyItemSeed = {
  code: string;
  name: string;
  description: string;
  category: PerformanceCompetencyCategoryEnum;
  weight: string;
  maximumRating: string;
  sortOrder: number;
};

const RATING_SCALE_CODE = 'PERF_5PT_2026';
const COMPETENCY_TEMPLATE_CODE = 'CORE_COMP_2026';
const FINANCIAL_YEAR_CODE = 'FY2026';
const FINANCIAL_YEAR_START = '2026-01-01';
const FINANCIAL_YEAR_END = '2026-12-31';

const DEFAULT_SELF_REVIEW_DAYS = 3;
const DEFAULT_MANAGER_REVIEW_DAYS = 5;
const DEFAULT_HR_REVIEW_DAYS = 3;

const RATING_BAND_SEEDS: RatingBandSeed[] = [
  {
    code: 'OUTSTANDING',
    label: 'Outstanding',
    minimumScore: '90.00',
    maximumScore: '100.00',
    displayOrder: 1,
    requiresImprovementPlan: false,
  },
  {
    code: 'EXCEEDS_EXPECTATIONS',
    label: 'Exceeds Expectations',
    minimumScore: '75.00',
    maximumScore: '89.99',
    displayOrder: 2,
    requiresImprovementPlan: false,
  },
  {
    code: 'MEETS_EXPECTATIONS',
    label: 'Meets Expectations',
    minimumScore: '60.00',
    maximumScore: '74.99',
    displayOrder: 3,
    requiresImprovementPlan: false,
  },
  {
    code: 'NEEDS_IMPROVEMENT',
    label: 'Needs Improvement',
    minimumScore: '40.00',
    maximumScore: '59.99',
    displayOrder: 4,
    requiresImprovementPlan: true,
  },
  {
    code: 'UNSATISFACTORY',
    label: 'Unsatisfactory',
    minimumScore: '0.00',
    maximumScore: '39.99',
    displayOrder: 5,
    requiresImprovementPlan: true,
  },
];

const COMPETENCY_ITEM_SEEDS: CompetencyItemSeed[] = [
  {
    code: 'TECHNICAL_EXECUTION',
    name: 'Technical execution',
    description:
      'Quality, accuracy, and reliability of work output against the expectations of the role.',
    category: PerformanceCompetencyCategoryEnum.TECHNICAL,
    weight: '35.00',
    maximumRating: '5.00',
    sortOrder: 1,
  },
  {
    code: 'COLLABORATION',
    name: 'Collaboration',
    description:
      'Effectiveness in working with teammates, stakeholders, and cross-functional partners.',
    category: PerformanceCompetencyCategoryEnum.BEHAVIORAL,
    weight: '25.00',
    maximumRating: '5.00',
    sortOrder: 2,
  },
  {
    code: 'ACCOUNTABILITY',
    name: 'Accountability',
    description:
      'Ownership of commitments, responsiveness to feedback, and follow-through on deliverables.',
    category: PerformanceCompetencyCategoryEnum.BEHAVIORAL,
    weight: '20.00',
    maximumRating: '5.00',
    sortOrder: 3,
  },
  {
    code: 'LEADERSHIP_READINESS',
    name: 'Leadership readiness',
    description:
      'Planning, initiative, and decision quality appropriate to the employee’s level and role scope.',
    category: PerformanceCompetencyCategoryEnum.MANAGERIAL,
    weight: '20.00',
    maximumRating: '5.00',
    sortOrder: 4,
  },
];

export default class PerformanceBaselineSeeder implements Seeder {
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
      const ratingScaleRepo = qr.manager.getRepository(PerformanceRatingScale);
      const ratingBandRepo = qr.manager.getRepository(PerformanceRatingBand);
      const competencyTemplateRepo =
        qr.manager.getRepository(CompetencyTemplate);
      const competencyItemRepo = qr.manager.getRepository(
        CompetencyTemplateItem,
      );
      const financialYearRepo = qr.manager.getRepository(
        PerformanceFinancialYear,
      );
      const periodRepo = qr.manager.getRepository(PerformancePeriod);

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

      let ratingScale = await ratingScaleRepo.findOne({
        where: { companyId: company.id, code: RATING_SCALE_CODE },
      });

      if (!ratingScale) {
        ratingScale = ratingScaleRepo.create({
          companyId: company.id,
          code: RATING_SCALE_CODE,
          name: 'Standard 5-point performance rating scale',
          minimumScore: '0.00',
          maximumScore: '100.00',
          isDefault: true,
          status: 'ACTIVE',
        });
        ratingScale = await ratingScaleRepo.save(ratingScale);
      }

      for (const seed of RATING_BAND_SEEDS) {
        const band = await ratingBandRepo.findOne({
          where: { ratingScaleId: ratingScale.id, code: seed.code },
        });

        if (!band) {
          await ratingBandRepo.save(
            ratingBandRepo.create({
              ratingScaleId: ratingScale.id,
              code: seed.code,
              label: seed.label,
              minimumScore: seed.minimumScore,
              maximumScore: seed.maximumScore,
              displayOrder: seed.displayOrder,
              requiresImprovementPlan: seed.requiresImprovementPlan,
            }),
          );
        }
      }

      let competencyTemplate = await competencyTemplateRepo.findOne({
        where: { companyId: company.id, code: COMPETENCY_TEMPLATE_CODE },
      });

      if (!competencyTemplate) {
        competencyTemplate = competencyTemplateRepo.create({
          companyId: company.id,
          code: COMPETENCY_TEMPLATE_CODE,
          name: 'Core competency template',
          description:
            'Baseline competency framework for company-wide performance reviews.',
          status: 'ACTIVE',
        });
        competencyTemplate =
          await competencyTemplateRepo.save(competencyTemplate);
      }

      for (const seed of COMPETENCY_ITEM_SEEDS) {
        const item = await competencyItemRepo.findOne({
          where: { templateId: competencyTemplate.id, code: seed.code },
        });

        if (!item) {
          await competencyItemRepo.save(
            competencyItemRepo.create({
              templateId: competencyTemplate.id,
              code: seed.code,
              name: seed.name,
              description: seed.description,
              category: seed.category,
              weight: seed.weight,
              maximumRating: seed.maximumRating,
              sortOrder: seed.sortOrder,
            }),
          );
        }
      }

      let financialYear = await financialYearRepo.findOne({
        where: { companyId: company.id, code: FINANCIAL_YEAR_CODE },
      });

      if (!financialYear) {
        financialYear = financialYearRepo.create({
          companyId: company.id,
          code: FINANCIAL_YEAR_CODE,
          name: 'Performance Financial Year 2026',
          startDate: FINANCIAL_YEAR_START,
          endDate: FINANCIAL_YEAR_END,
          status: 'DRAFT',
          annualAggregationMethod:
            PerformanceAggregationMethodEnum.SIMPLE_MONTHLY_AVERAGE,
          aggregationConfiguration: {
            seeded: true,
            source: '041-performance-baseline',
          },
          isLocked: false,
          lockedAt: null,
          lockedByCompanyUserId: null,
        });
        financialYear = await financialYearRepo.save(financialYear);
      }

      const periodFactory = new PerformancePeriodFactory();
      const monthlyPeriods = periodFactory.buildMonthlyPeriods(
        financialYear.startDate,
        financialYear.endDate,
      );
      const quarterlyPeriods =
        periodFactory.buildQuarterlyPeriods(monthlyPeriods);

      for (const template of [...monthlyPeriods, ...quarterlyPeriods]) {
        const period = await periodRepo.findOne({
          where: {
            financialYearId: financialYear.id,
            periodType: template.periodType,
            sequenceNumber: template.sequenceNumber,
          },
        });

        if (!period) {
          const end = new Date(`${template.endDate}T00:00:00.000Z`);
          const openAt = new Date(end);
          openAt.setUTCDate(openAt.getUTCDate() + 1);

          const achievementEntryClosesAt = new Date(openAt);
          achievementEntryClosesAt.setUTCDate(
            achievementEntryClosesAt.getUTCDate() + DEFAULT_SELF_REVIEW_DAYS,
          );

          const managerReviewDueAt = new Date(achievementEntryClosesAt);
          managerReviewDueAt.setUTCDate(
            managerReviewDueAt.getUTCDate() + DEFAULT_MANAGER_REVIEW_DAYS,
          );

          const hrReviewDueAt = new Date(managerReviewDueAt);
          hrReviewDueAt.setUTCDate(
            hrReviewDueAt.getUTCDate() + DEFAULT_HR_REVIEW_DAYS,
          );

          await periodRepo.save(
            periodRepo.create({
              companyId: company.id,
              financialYearId: financialYear.id,
              periodType: template.periodType,
              sequenceNumber: template.sequenceNumber,
              name: template.name,
              startDate: template.startDate,
              endDate: template.endDate,
              status: PerformancePeriodStatusEnum.DRAFT,
              achievementEntryOpensAt: openAt,
              achievementEntryClosesAt: achievementEntryClosesAt,
              selfReviewDueAt: achievementEntryClosesAt,
              managerReviewDueAt: managerReviewDueAt,
              hrReviewDueAt: hrReviewDueAt,
              publishedAt: null,
              lockedAt: null,
              generationSnapshot: {
                ...template.generationSnapshot,
                seeded: true,
                source: '041-performance-baseline',
              },
            }),
          );
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][PerformanceBaseline] Ensured rating scale, competency template, and FY2026 baseline for company "${company.name}" (created if missing, left unchanged if already existed)`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][PerformanceBaseline] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
