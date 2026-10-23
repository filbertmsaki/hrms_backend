import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
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
import { calculateAnnualAggregation } from './performance-annual-aggregation.calculator';

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
  ): Promise<{
    period_type: PerformancePeriodTypeEnum;
    financial_year_id: number;
    aggregate_count: number;
    skipped_period_count: number;
    skipped_review_count: number;
    aggregates: PerformanceAggregate[];
  }> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const financialYear = await this.financialYearRepository.findOne({
      where: { id: financialYearId, companyId },
    });

    if (!financialYear) {
      throw new NotFoundException('Performance financial year not found.');
    }

    let aggregates: PerformanceAggregate[];
    let skippedPeriodCount = 0;
    let skippedReviewCount = 0;
    switch (periodType) {
      case PerformancePeriodTypeEnum.QUARTERLY:
        ({ aggregates, skippedPeriodCount, skippedReviewCount } =
          await this.calculateQuarterly(actor, financialYear));
        break;
      case PerformancePeriodTypeEnum.ANNUAL:
        aggregates = await this.calculateAnnual(actor, financialYear);
        break;
      default:
        throw new BadRequestException(
          'Only QUARTERLY or ANNUAL aggregate calculations are supported.',
        );
    }
    return {
      period_type: periodType,
      financial_year_id: financialYear.id,
      aggregate_count: aggregates.length,
      skipped_period_count: skippedPeriodCount,
      skipped_review_count: skippedReviewCount,
      aggregates,
    };
  }

  private async calculateQuarterly(
    actor: AuthenticatedUser,
    financialYear: PerformanceFinancialYear,
  ): Promise<{
    aggregates: PerformanceAggregate[];
    skippedPeriodCount: number;
    skippedReviewCount: number;
  }> {
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
      where: { companyId: financialYear.companyId },
    });
    const monthlyPeriodIds = new Set(monthly.map((period) => period.id));
    const aggregateResults: PerformanceAggregate[] = [];
    let skippedPeriodCount = 0;
    let skippedReviewCount = 0;

    for (const quarter of quarters) {
      const quarterMonthlyIds = monthly
        .filter(
          (period) =>
            period.startDate >= quarter.startDate &&
            period.endDate <= quarter.endDate,
        )
        .map((period) => period.id);
      const quarterReviews = monthlyReviews.filter(
        (review) =>
          monthlyPeriodIds.has(review.performancePeriodId) &&
          quarterMonthlyIds.includes(review.performancePeriodId),
      );
      const reviewsForQuarter = quarterReviews.filter(
        (review) =>
          review.status === PerformanceReviewStatusEnum.PUBLISHED &&
          review.finalScore !== null,
      );
      if (quarterMonthlyIds.length === 0 || reviewsForQuarter.length === 0) {
        skippedPeriodCount += 1;
      }
      skippedReviewCount += quarterReviews.filter(
        (review) =>
          review.status !== PerformanceReviewStatusEnum.PUBLISHED ||
          review.finalScore === null,
      ).length;
      const byEmployee = new Map<number, PerformanceReview[]>();
      for (const review of reviewsForQuarter) {
        const bucket = byEmployee.get(review.employeeId) ?? [];
        bucket.push(review);
        byEmployee.set(review.employeeId, bucket);
      }

      for (const [employeeId, reviews] of byEmployee.entries()) {
        const score =
          reviews.reduce((sum, review) => sum + Number(review.finalScore), 0) /
          reviews.length;
        aggregateResults.push(
          await this.saveAggregate(actor, {
            companyId: financialYear.companyId,
            employeeId,
            financialYearId: financialYear.id,
            periodType: PerformancePeriodTypeEnum.QUARTERLY,
            sequenceNumber: quarter.sequenceNumber,
            name: quarter.name,
            aggregationMethod:
              PerformanceAggregationMethodEnum.SIMPLE_MONTHLY_AVERAGE,
            aggregateScore: Number(score.toFixed(4)),
            sourceReviewHashes: reviews
              .map((review) => review.calculationHash)
              .filter((hash): hash is string => Boolean(hash)),
            calculationSnapshot: {
              source_review_ids: reviews.map((review) => review.id),
              source_period_ids: reviews.map(
                (review) => review.performancePeriodId,
              ),
              expected_period_ids: quarterMonthlyIds,
              missing_period_ids: quarterMonthlyIds.filter(
                (periodId) =>
                  !reviews.some(
                    (review) => review.performancePeriodId === periodId,
                  ),
              ),
              source_count: reviews.length,
              expected_period_count: quarterMonthlyIds.length,
              scored_period_count: reviews.length,
              formula_version: 'QUARTERLY_SIMPLE_MONTHLY_AVERAGE_V1',
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

    return {
      aggregates: aggregateResults,
      skippedPeriodCount,
      skippedReviewCount,
    };
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
        .filter(
          (period) => period.periodType === PerformancePeriodTypeEnum.MONTHLY,
        )
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

    const monthlyPeriodById = new Map(
      periods
        .filter(
          (period) => period.periodType === PerformancePeriodTypeEnum.MONTHLY,
        )
        .map((period) => [period.id, period]),
    );
    const employeeIds = new Set([
      ...scopedMonthlyReviews.map((review) => review.employeeId),
      ...quarterlyAggregates.map((aggregate) => aggregate.employeeId),
    ]);

    const results: PerformanceAggregate[] = [];
    for (const employeeId of employeeIds) {
      const monthlySources = scopedMonthlyReviews
        .filter((review) => review.employeeId === employeeId)
        .map((review) => ({
          reviewId: review.id,
          periodSequence:
            monthlyPeriodById.get(review.performancePeriodId)?.sequenceNumber ??
            0,
          finalScore: review.finalScore,
          adjustmentScore: review.adjustmentScore,
          calculationHash: review.calculationHash,
        }));
      const quarterlySources = quarterlyAggregates
        .filter((aggregate) => aggregate.employeeId === employeeId)
        .map((aggregate) => ({
          aggregateId: aggregate.id,
          periodSequence: aggregate.sequenceNumber,
          aggregateScore: aggregate.aggregateScore,
          sourceReviewHashes: aggregate.sourceReviewHashes,
        }));
      const calculation = calculateAnnualAggregation({
        method: financialYear.annualAggregationMethod,
        monthlySources,
        quarterlySources,
        configuration: financialYear.aggregationConfiguration,
      });
      if (!calculation) continue;

      const useQuarterlySources =
        financialYear.annualAggregationMethod ===
          PerformanceAggregationMethodEnum.QUARTERLY_ROLLUP &&
        quarterlySources.length > 0;
      const expectedSourcePeriods = useQuarterlySources
        ? periods.filter(
            (period) =>
              period.periodType === PerformancePeriodTypeEnum.QUARTERLY,
          )
        : periods.filter(
            (period) => period.periodType === PerformancePeriodTypeEnum.MONTHLY,
          );
      const sourcePeriodIds = useQuarterlySources
        ? quarterlySources
            .map(
              (source) =>
                periods.find(
                  (period) =>
                    period.periodType === PerformancePeriodTypeEnum.QUARTERLY &&
                    period.sequenceNumber === source.periodSequence,
                )?.id,
            )
            .filter((id): id is number => id !== undefined)
        : monthlySources
            .filter((source) => source.finalScore !== null)
            .map(
              (source) =>
                periods.find(
                  (period) =>
                    period.periodType === PerformancePeriodTypeEnum.MONTHLY &&
                    period.sequenceNumber === source.periodSequence,
                )?.id,
            )
            .filter((id): id is number => id !== undefined);

      results.push(
        await this.saveAggregate(actor, {
          companyId: financialYear.companyId,
          employeeId,
          financialYearId: financialYear.id,
          periodType: PerformancePeriodTypeEnum.ANNUAL,
          sequenceNumber: 1,
          name: financialYear.name,
          aggregationMethod: financialYear.annualAggregationMethod,
          aggregateScore: Number(calculation.score.toFixed(4)),
          sourceReviewHashes: calculation.sourceHashes,
          calculationSnapshot: {
            source_count: calculation.sourceCount,
            source_ids: calculation.sourceIds,
            source_period_ids: sourcePeriodIds,
            expected_period_ids: expectedSourcePeriods.map(
              (period) => period.id,
            ),
            missing_period_ids: expectedSourcePeriods
              .map((period) => period.id)
              .filter((periodId) => !sourcePeriodIds.includes(periodId)),
            formula_version: `ANNUAL_${financialYear.annualAggregationMethod}_V1`,
            aggregation_method: financialYear.annualAggregationMethod,
            aggregate_score: Number(calculation.score.toFixed(4)),
            aggregation_configuration:
              financialYear.aggregationConfiguration ?? null,
            ...calculation.details,
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

  private async saveAggregate(
    actor: AuthenticatedUser,
    input: {
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
    },
  ): Promise<PerformanceAggregate> {
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
    const calculationSnapshot = {
      ...input.calculationSnapshot,
      calculation_hash: createHash('sha256')
        .update(
          JSON.stringify({
            aggregation_method: input.aggregationMethod,
            aggregate_score: input.aggregateScore.toFixed(4),
            source_review_hashes: [...input.sourceReviewHashes].sort(),
            calculation_snapshot: input.calculationSnapshot,
          }),
        )
        .digest('hex'),
    };
    const beforeValues = existing
      ? {
          aggregate_id: existing.id,
          aggregate_score: existing.aggregateScore,
          aggregation_method: existing.aggregationMethod,
          source_review_hashes: existing.sourceReviewHashes,
          calculation_snapshot: existing.calculationSnapshot,
          version: existing.version,
        }
      : null;
    entity.companyId = input.companyId;
    entity.employeeId = input.employeeId;
    entity.financialYearId = input.financialYearId;
    entity.periodType = input.periodType;
    entity.sequenceNumber = input.sequenceNumber;
    entity.name = input.name;
    entity.aggregationMethod = input.aggregationMethod;
    entity.aggregateScore = input.aggregateScore.toFixed(4);
    entity.sourceReviewHashes = input.sourceReviewHashes;
    entity.calculationSnapshot = calculationSnapshot;
    entity.publishedAt = new Date();

    const saved = await this.aggregateRepository.save(entity);
    await this.auditService.log({
      action: PerformanceAuditActionEnum.AGGREGATE_CALCULATED,
      actor,
      employeeId: input.employeeId,
      beforeValues,
      afterValues: {
        aggregate_id: saved.id,
        aggregate_score: saved.aggregateScore,
        aggregation_method: saved.aggregationMethod,
        source_review_hashes: saved.sourceReviewHashes,
        calculation_snapshot: saved.calculationSnapshot,
        version: saved.version,
      },
      reason: existing
        ? 'Aggregate recalculated; prior snapshot retained in audit history.'
        : 'Aggregate calculated; source and formula snapshot recorded.',
    });
    return saved;
  }
}
