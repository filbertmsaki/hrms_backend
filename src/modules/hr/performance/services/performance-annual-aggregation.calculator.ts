import { BadRequestException } from '@nestjs/common';
import { PerformanceAggregationMethodEnum } from '../enums/performance-aggregation-method.enum';

export type AnnualMonthlySource = {
  reviewId: number;
  periodSequence: number;
  finalScore: string | null;
  adjustmentScore: string | null;
  calculationHash: string | null;
};

export type AnnualQuarterSource = {
  aggregateId: number;
  aggregateScore: string;
  sourceReviewHashes: string[];
};

export type AnnualAggregationResult = {
  score: number;
  sourceIds: number[];
  sourceHashes: string[];
  sourceCount: number;
  details: Record<string, unknown>;
};

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function usableMonthlySources(sources: AnnualMonthlySource[]) {
  return sources.filter(
    (source) =>
      source.finalScore !== null && Number.isFinite(Number(source.finalScore)),
  );
}

function ensureFiniteNonNegative(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new BadRequestException(
      `${label} must be a finite nonnegative number.`,
    );
  }
  return numberValue;
}

export function validateAnnualAggregationConfiguration(
  method: PerformanceAggregationMethodEnum,
  configuration: Record<string, unknown> | null,
): void {
  const values = configuration ?? {};
  if (method === PerformanceAggregationMethodEnum.WEIGHTED_MONTHLY_AVERAGE) {
    const weights = values.monthly_weights;
    if (weights !== undefined) {
      if (!weights || typeof weights !== 'object' || Array.isArray(weights)) {
        throw new BadRequestException(
          'monthly_weights must be an object keyed by monthly period sequence number.',
        );
      }
      for (const [sequence, weight] of Object.entries(
        weights as Record<string, unknown>,
      )) {
        if (!/^(?:[1-9]|1[0-2])$/.test(sequence)) {
          throw new BadRequestException(
            'monthly_weights keys must be monthly sequence numbers from 1 through 12.',
          );
        }
        ensureFiniteNonNegative(weight, `Weight for month ${sequence}`);
      }
    }
  }
  if (method === PerformanceAggregationMethodEnum.ANNUAL_TARGET_ACHIEVEMENT) {
    const target = ensureFiniteNonNegative(
      values.annual_target_score,
      'annual_target_score',
    );
    if (target <= 0) {
      throw new BadRequestException(
        'annual_target_score must be greater than zero.',
      );
    }
    if (values.annual_target_cap !== undefined) {
      const cap = ensureFiniteNonNegative(
        values.annual_target_cap,
        'annual_target_cap',
      );
      if (cap <= 0) {
        throw new BadRequestException(
          'annual_target_cap must be greater than zero.',
        );
      }
    }
  }
}

export function calculateAnnualAggregation(input: {
  method: PerformanceAggregationMethodEnum;
  monthlySources: AnnualMonthlySource[];
  quarterlySources: AnnualQuarterSource[];
  configuration: Record<string, unknown> | null;
}): AnnualAggregationResult | null {
  const monthlySources = usableMonthlySources(input.monthlySources);
  const configuration = input.configuration ?? {};
  validateAnnualAggregationConfiguration(input.method, configuration);

  if (
    input.method === PerformanceAggregationMethodEnum.QUARTERLY_ROLLUP &&
    input.quarterlySources.length > 0
  ) {
    const scores = input.quarterlySources.map((source) =>
      Number(source.aggregateScore),
    );
    if (scores.some((score) => !Number.isFinite(score))) {
      throw new BadRequestException(
        'Quarterly aggregate scores must be finite.',
      );
    }
    return {
      score: average(scores),
      sourceIds: input.quarterlySources.map((source) => source.aggregateId),
      sourceHashes: input.quarterlySources.flatMap(
        (source) => source.sourceReviewHashes,
      ),
      sourceCount: input.quarterlySources.length,
      details: {
        source_period: 'QUARTERLY',
        fallback_to_monthly: false,
      },
    };
  }

  if (!monthlySources.length) return null;
  const scores = monthlySources.map((source) => Number(source.finalScore));
  let score = average(scores);
  let details: Record<string, unknown> = {
    source_period: 'MONTHLY',
    missing_score_review_ids: input.monthlySources
      .filter((source) => source.finalScore === null)
      .map((source) => source.reviewId),
  };

  switch (input.method) {
    case PerformanceAggregationMethodEnum.SIMPLE_MONTHLY_AVERAGE:
      break;
    case PerformanceAggregationMethodEnum.WEIGHTED_MONTHLY_AVERAGE: {
      const weights = configuration.monthly_weights;
      const weightMap = (weights ?? {}) as Record<string, unknown>;
      const weighted = monthlySources.map((source) => {
        const configured = weightMap[String(source.periodSequence)];
        return {
          score: Number(source.finalScore),
          weight:
            configured === undefined
              ? 1
              : ensureFiniteNonNegative(
                  configured,
                  `Weight for month ${source.periodSequence}`,
                ),
          sequence: source.periodSequence,
        };
      });
      const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
      if (totalWeight <= 0) {
        throw new BadRequestException(
          'At least one published month must have a positive aggregation weight.',
        );
      }
      score =
        weighted.reduce((sum, item) => sum + item.score * item.weight, 0) /
        totalWeight;
      details = {
        ...details,
        month_weights: weighted.map(({ sequence, weight }) => ({
          sequence,
          weight,
        })),
        total_weight: totalWeight,
      };
      break;
    }
    case PerformanceAggregationMethodEnum.QUARTERLY_ROLLUP:
      details = { ...details, fallback_to_monthly: true };
      break;
    case PerformanceAggregationMethodEnum.ANNUAL_TARGET_ACHIEVEMENT: {
      const target = Number(configuration.annual_target_score);
      const cap =
        configuration.annual_target_cap === undefined
          ? 120
          : ensureFiniteNonNegative(
              configuration.annual_target_cap,
              'annual_target_cap',
            );
      if (cap <= 0) {
        throw new BadRequestException(
          'annual_target_cap must be greater than zero.',
        );
      }
      score = Math.min(cap, (score / target) * 100);
      details = {
        ...details,
        annual_target_score: target,
        annual_target_cap: cap,
        source_average_score: average(scores),
      };
      break;
    }
    case PerformanceAggregationMethodEnum.MONTHLY_AVERAGE_WITH_ADJUSTMENTS:
      details = {
        ...details,
        adjustment_scores: monthlySources.map((source) => ({
          review_id: source.reviewId,
          adjustment_score: Number(source.adjustmentScore ?? 0),
          already_included_in_final_score: true,
        })),
        adjustments_applied_once: true,
      };
      break;
    default:
      throw new BadRequestException('Unsupported annual aggregation method.');
  }

  return {
    score,
    sourceIds: monthlySources.map((source) => source.reviewId),
    sourceHashes: monthlySources
      .map((source) => source.calculationHash)
      .filter((hash): hash is string => Boolean(hash)),
    sourceCount: monthlySources.length,
    details,
  };
}
