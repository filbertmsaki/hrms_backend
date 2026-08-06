import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { PerformanceAggregate } from '../entities/performance-aggregate.entity';
import { PerformanceFinancialYear } from '../entities/performance-financial-year.entity';
import { PerformancePeriod } from '../entities/performance-period.entity';
import { PerformanceReview } from '../entities/performance-review.entity';
import { PerformanceAggregationMethodEnum } from '../enums/performance-aggregation-method.enum';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import { PerformancePeriodTypeEnum } from '../enums/performance-period-type.enum';
import { PerformanceReviewStatusEnum } from '../enums/performance-review-status.enum';
import { PerformanceAuditService } from './performance-audit.service';

@Injectable()
export class PerformanceAggregationService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PerformanceAuditService,
    @InjectRepository(PerformanceFinancialYear)
    private readonly financialYearRepository: Repository<PerformanceFinancialYear>,
    @InjectRepository(PerformancePeriod)
    private readonly periodRepository: Repository<PerformancePeriod>,
    @InjectRepository(PerformanceReview)
    private readonly reviewRepository: Repository<PerformanceReview>,
    @InjectRepository(PerformanceAggregate)
    private readonly aggregateRepository: Repository<PerformanceAggregate>,
  ) {}

  async calculate(
    actor: AuthenticatedUser,
    financialYearId: number,
    periodType: PerformancePeriodTypeEnum,
  ): Promise<PerformanceAggregate[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const financialYear = await this.financialYearRepository.findOne({
      where: { id: financialYearId, companyId },
    });

    if (!financialYear) {
      throw new NotFoundException('Performance financial year not found.');
    }

    switch (periodType) {
      case PerformancePeriodTypeEnum.QUARTERLY:
        return this.calculateQuarterly(actor, financialYear);
      case PerformancePeriodTypeEnum.ANNUAL:
        return this.calculateAnnual(actor, financialYear);
      default:
        return [];
    }
  }

  private async calculateQuarterly(
    actor: AuthenticatedUser,
    financialYear: PerformanceFinancialYear,
  ): Promise<PerformanceAggregate[]> {
    const periods = await this.periodRepository.find({
      where: { financialYearId: financialYear.id },
      order: { periodType: 'ASC', sequenceNumber: 'ASC' },
    });
    const monthly = periods.filter(
      (period) => period.periodType === PerformancePeriodTypeEnum.MONTHLY,
    );
    const quarters = periods.filter(
      (period) => period.periodType === PerformancePeriodTypeEnum.QUARTERLY,
    );
    const monthlyReviews = await this.reviewRepository.find({
      where: {
        companyId: financialYear.companyId,
        status: PerformanceReviewStatusEnum.PUBLISHED,
      },
    });
    const monthlyPeriodIds = new Set(monthly.map((period) => period.id));
    const aggregateResults: PerformanceAggregate[] = [];

    for (const quarter of quarters) {
      const quarterMonthlyIds = monthly
        .filter(
          (period) =>
            period.startDate >= quarter.startDate && period.endDate <= quarter.endDate,
        )
        .map((period) => period.id);
      const reviewsForQuarter = monthlyReviews.filter(
        (review) =>
          monthlyPeriodIds.has(review.performancePeriodId) &&
          quarterMonthlyIds.includes(review.performancePeriodId),
      );
      const byEmployee = new Map<number, PerformanceReview[]>();
      for (const review of reviewsForQuarter) {
        const bucket = byEmployee.get(review.employeeId) ?? [];
        bucket.push(review);
        byEmployee.set(review.employeeId, bucket);
      }

      for (const [employeeId, reviews] of byEmployee.entries()) {
        const score =
          reviews.reduce((sum, review) => sum + Number(review.finalScore ?? 0), 0) /
          reviews.length;
        aggregateResults.push(
          await this.saveAggregate({
            companyId: financialYear.companyId,
            employeeId,
            financialYearId: financialYear.id,
            periodType: PerformancePeriodTypeEnum.QUARTERLY,
            sequenceNumber: quarter.sequenceNumber,
            name: quarter.name,
            aggregationMethod:
              PerformanceAggregationMethodEnum.WEIGHTED_MONTHLY_AVERAGE,
            aggregateScore: Number(score.toFixed(4)),
            sourceReviewHashes: reviews
              .map((review) => review.calculationHash)
              .filter((hash): hash is string => Boolean(hash)),
            calculationSnapshot: {
              source_review_ids: reviews.map((review) => review.id),
              source_period_ids: quarterMonthlyIds,
              average_score: Number(score.toFixed(4)),
            },
          }),
        );
      }
    }

    await this.auditService.log({
      action: PerformanceAuditActionEnum.AGGREGATE_CALCULATED,
      actor,
      afterValues: {
        financial_year_id: financialYear.id,
        period_type: PerformancePeriodTypeEnum.QUARTERLY,
        aggregate_count: aggregateResults.length,
      },
    });

    return aggregateResults;
  }

  private async calculateAnnual(
    actor: AuthenticatedUser,
    financialYear: PerformanceFinancialYear,
  ): Promise<PerformanceAggregate[]> {
    const periods = await this.periodRepository.find({
      where: { financialYearId: financialYear.id },
    });
    const monthlyPeriodIds = new Set(
      periods
        .filter((period) => period.periodType === PerformancePeriodTypeEnum.MONTHLY)
        .map((period) => period.id),
    );
    const publishedMonthlyReviews = await this.reviewRepository.find({
      where: {
        companyId: financialYear.companyId,
        status: PerformanceReviewStatusEnum.PUBLISHED,
      },
    });
    const scopedMonthlyReviews = publishedMonthlyReviews.filter((review) =>
      monthlyPeriodIds.has(review.performancePeriodId),
    );

    const quarterlyAggregates =
      financialYear.annualAggregationMethod ===
      PerformanceAggregationMethodEnum.QUARTERLY_ROLLUP
        ? await this.aggregateRepository.find({
            where: {
              companyId: financialYear.companyId,
              financialYearId: financialYear.id,
              periodType: PerformancePeriodTypeEnum.QUARTERLY,
            },
          })
        : [];

    const sourceBuckets = new Map<
      number,
      Array<PerformanceReview | PerformanceAggregate>
    >();

    if (quarterlyAggregates.length > 0) {
      for (const aggregate of quarterlyAggregates) {
        const bucket = sourceBuckets.get(aggregate.employeeId) ?? [];
        bucket.push(aggregate);
        sourceBuckets.set(aggregate.employeeId, bucket);
      }
    } else {
      for (const review of scopedMonthlyReviews) {
        const bucket = sourceBuckets.get(review.employeeId) ?? [];
        bucket.push(review);
        sourceBuckets.set(review.employeeId, bucket);
      }
    }

    const results: PerformanceAggregate[] = [];
    for (const [employeeId, sources] of sourceBuckets.entries()) {
      const totalScore = sources.reduce((sum, source) => {
        if ('aggregateScore' in source) {
          return sum + Number(source.aggregateScore);
        }

        return sum + Number(source.finalScore ?? 0);
      }, 0);
      const aggregateScore = totalScore / sources.length;

      results.push(
        await this.saveAggregate({
          companyId: financialYear.companyId,
          employeeId,
          financialYearId: financialYear.id,
          periodType: PerformancePeriodTypeEnum.ANNUAL,
          sequenceNumber: 1,
          name: financialYear.name,
          aggregationMethod: financialYear.annualAggregationMethod,
          aggregateScore: Number(aggregateScore.toFixed(4)),
          sourceReviewHashes: sources
            .map((source) =>
              'aggregateScore' in source
                ? source.sourceReviewHashes.join('|')
                : source.calculationHash,
            )
            .filter((hash): hash is string => Boolean(hash)),
          calculationSnapshot: {
            source_count: sources.length,
            source_ids: sources.map((source) => source.id),
            aggregation_method: financialYear.annualAggregationMethod,
            aggregate_score: Number(aggregateScore.toFixed(4)),
            aggregation_configuration:
              financialYear.aggregationConfiguration ?? null,
          },
        }),
      );
    }

    await this.auditService.log({
      action: PerformanceAuditActionEnum.AGGREGATE_CALCULATED,
      actor,
      afterValues: {
        financial_year_id: financialYear.id,
        period_type: PerformancePeriodTypeEnum.ANNUAL,
        aggregate_count: results.length,
      },
    });

    return results;
  }

  private async saveAggregate(input: {
    companyId: number;
    employeeId: number;
    financialYearId: number;
    periodType: PerformancePeriodTypeEnum;
    sequenceNumber: number;
    name: string;
    aggregationMethod: PerformanceAggregationMethodEnum;
    aggregateScore: number;
    sourceReviewHashes: string[];
    calculationSnapshot: Record<string, unknown>;
  }): Promise<PerformanceAggregate> {
    const existing = await this.aggregateRepository.findOne({
      where: {
        companyId: input.companyId,
        employeeId: input.employeeId,
        financialYearId: input.financialYearId,
        periodType: input.periodType,
        sequenceNumber: input.sequenceNumber,
      },
    });

    const entity = existing ?? this.aggregateRepository.create();
    entity.companyId = input.companyId;
    entity.employeeId = input.employeeId;
    entity.financialYearId = input.financialYearId;
    entity.periodType = input.periodType;
    entity.sequenceNumber = input.sequenceNumber;
    entity.name = input.name;
    entity.aggregationMethod = input.aggregationMethod;
    entity.aggregateScore = input.aggregateScore.toFixed(4);
    entity.sourceReviewHashes = input.sourceReviewHashes;
    entity.calculationSnapshot = input.calculationSnapshot;
    entity.publishedAt = new Date();

    return this.aggregateRepository.save(entity);
  }
}
