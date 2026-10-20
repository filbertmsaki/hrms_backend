import { BadRequestException } from '@nestjs/common';
import { PerformanceAggregationMethodEnum as Method } from '../enums/performance-aggregation-method.enum';
import { calculateAnnualAggregation } from './performance-annual-aggregation.calculator';

const months = [
  {
    reviewId: 11,
    periodSequence: 1,
    finalScore: '80.0000',
    adjustmentScore: '0.0000',
    calculationHash: 'review-11',
  },
  {
    reviewId: 12,
    periodSequence: 2,
    finalScore: '100.0000',
    adjustmentScore: '5.0000',
    calculationHash: 'review-12',
  },
];

describe('calculateAnnualAggregation', () => {
  it('averages scored monthly reviews equally and excludes missing scores', () => {
    const result = calculateAnnualAggregation({
      method: Method.SIMPLE_MONTHLY_AVERAGE,
      monthlySources: [
        ...months,
        { ...months[1], reviewId: 13, finalScore: null },
      ],
      quarterlySources: [],
      configuration: null,
    });

    expect(result?.score).toBe(90);
    expect(result?.sourceIds).toEqual([11, 12]);
    expect(result?.details.missing_score_review_ids).toEqual([13]);
  });

  it('applies configured monthly weights with a default weight of one', () => {
    const result = calculateAnnualAggregation({
      method: Method.WEIGHTED_MONTHLY_AVERAGE,
      monthlySources: months,
      quarterlySources: [],
      configuration: { monthly_weights: { '1': 1, '2': 3 } },
    });

    expect(result?.score).toBe(95);
  });

  it('rejects an all-zero weighted configuration', () => {
    expect(() =>
      calculateAnnualAggregation({
        method: Method.WEIGHTED_MONTHLY_AVERAGE,
        monthlySources: months,
        quarterlySources: [],
        configuration: { monthly_weights: { '1': 0, '2': 0 } },
      }),
    ).toThrow(BadRequestException);
  });

  it('uses available quarterly aggregates and falls back to monthly only if none exist', () => {
    const quarterRollup = calculateAnnualAggregation({
      method: Method.QUARTERLY_ROLLUP,
      monthlySources: months,
      quarterlySources: [
        { aggregateId: 21, aggregateScore: '80', sourceReviewHashes: ['q1'] },
        { aggregateId: 22, aggregateScore: '100', sourceReviewHashes: ['q2'] },
      ],
      configuration: null,
    });
    const fallback = calculateAnnualAggregation({
      method: Method.QUARTERLY_ROLLUP,
      monthlySources: months,
      quarterlySources: [],
      configuration: null,
    });

    expect(quarterRollup?.score).toBe(90);
    expect(quarterRollup?.details.fallback_to_monthly).toBe(false);
    expect(fallback?.score).toBe(90);
    expect(fallback?.details.fallback_to_monthly).toBe(true);
  });

  it('calculates annual target attainment and applies its cap', () => {
    const result = calculateAnnualAggregation({
      method: Method.ANNUAL_TARGET_ACHIEVEMENT,
      monthlySources: [
        { ...months[0], finalScore: '150' },
        { ...months[1], finalScore: '150' },
      ],
      quarterlySources: [],
      configuration: { annual_target_score: 100, annual_target_cap: 120 },
    });

    expect(result?.score).toBe(120);
  });

  it('counts scorecard adjustments once through the published final score', () => {
    const result = calculateAnnualAggregation({
      method: Method.MONTHLY_AVERAGE_WITH_ADJUSTMENTS,
      monthlySources: months,
      quarterlySources: [],
      configuration: null,
    });

    expect(result?.score).toBe(90);
    expect(result?.details.adjustments_applied_once).toBe(true);
  });
});
