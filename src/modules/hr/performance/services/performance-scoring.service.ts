import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import { KpiScoringFormulaEnum } from '../enums/kpi-scoring-formula.enum';

type ScoreInput = {
  formula: KpiScoringFormulaEnum;
  targetValue: string | number | null;
  achievementValue: string | number | null;
  weight: string | number;
  formulaConfiguration?: Record<string, unknown> | null;
};

type ScoreOutput = {
  rawScore: string | null;
  cappedScore: string | null;
  weightedScore: string | null;
};

@Injectable()
export class PerformanceScoringService {
  constructor(private readonly configService: ConfigService) {}

  score(input: ScoreInput): ScoreOutput {
    if (
      input.achievementValue === null ||
      input.achievementValue === undefined
    ) {
      return {
        rawScore: null,
        cappedScore: null,
        weightedScore: null,
      };
    }

    this.toDecimal(input.achievementValue, 'KPI achievement value');
    const weight = this.toDecimal(input.weight, 'KPI weight');
    if (weight.lt(0) || weight.gt(100)) {
      throw new BadRequestException('KPI weight must be between 0 and 100.');
    }
    if (input.targetValue !== null && input.targetValue !== undefined) {
      this.toDecimal(input.targetValue, 'KPI target value');
    }
    // Validate configured formulas on every scoring path, including legacy
    // records, so malformed stored configuration cannot silently score as 0.
    this.validateFormulaConfiguration(
      input.formula,
      input.formulaConfiguration,
    );

    const rawScore = this.calculateRawScore(input);
    const scoreCap = this.toDecimal(
      this.configService.get<number>('PERFORMANCE_DEFAULT_SCORE_CAP', 120),
      'Performance score cap',
    );
    if (scoreCap.lte(0)) {
      throw new BadRequestException('Performance score cap must be positive.');
    }
    const cappedScore = Decimal.min(rawScore, scoreCap);
    const weightedScore = cappedScore
      .mul(new Decimal(input.weight).div(100))
      .toDecimalPlaces(4);

    return {
      rawScore: rawScore.toDecimalPlaces(4).toFixed(4),
      cappedScore: cappedScore.toDecimalPlaces(4).toFixed(4),
      weightedScore: weightedScore.toFixed(4),
    };
  }

  validateFormulaConfiguration(
    formula: KpiScoringFormulaEnum,
    configuration: Record<string, unknown> | null | undefined,
  ): void {
    if (formula === KpiScoringFormulaEnum.THRESHOLD_BANDS) {
      if (!Array.isArray(configuration?.bands) || !configuration.bands.length) {
        throw new BadRequestException(
          'Threshold-band scoring requires at least one configured band.',
        );
      }
      const bands = configuration.bands
        .map((item, index) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new BadRequestException(
              `Threshold band ${index + 1} is invalid.`,
            );
          }
          const band = item as {
            min?: unknown;
            max?: unknown;
            score?: unknown;
          };
          const min =
            band.min === undefined
              ? null
              : this.toDecimal(band.min, `Threshold band ${index + 1} minimum`);
          const max =
            band.max === undefined
              ? null
              : this.toDecimal(band.max, `Threshold band ${index + 1} maximum`);
          const score =
            band.score === undefined
              ? null
              : this.toDecimal(band.score, `Threshold band ${index + 1} score`);
          if ((min === null && max === null) || score === null || score.lt(0)) {
            throw new BadRequestException(
              `Threshold band ${index + 1} must define a bound and a nonnegative score.`,
            );
          }
          if (min !== null && max !== null && min.gt(max)) {
            throw new BadRequestException(
              `Threshold band ${index + 1} minimum cannot exceed its maximum.`,
            );
          }
          return { min, max };
        })
        .sort((left, right) => {
          if (left.min === null) return -1;
          if (right.min === null) return 1;
          return left.min.comparedTo(right.min);
        });

      for (let index = 1; index < bands.length; index += 1) {
        const previous = bands[index - 1];
        const current = bands[index];
        // The scoring predicate includes both endpoints, so equal endpoints
        // overlap too.
        if (
          previous.max === null ||
          current.min === null ||
          previous.max.gte(current.min)
        ) {
          throw new BadRequestException(
            'Threshold band configuration contains overlapping ranges.',
          );
        }
      }
      return;
    }

    if (formula === KpiScoringFormulaEnum.RANGE_COMPLIANCE) {
      const minimum = configuration?.minimum;
      const maximum = configuration?.maximum;
      if (minimum === undefined && maximum === undefined) {
        throw new BadRequestException(
          'Range-compliance scoring requires a minimum or maximum bound.',
        );
      }
      const min =
        minimum === undefined ? null : this.toDecimal(minimum, 'Range minimum');
      const max =
        maximum === undefined ? null : this.toDecimal(maximum, 'Range maximum');
      if (min !== null && max !== null && min.gt(max)) {
        throw new BadRequestException(
          'Range minimum cannot exceed range maximum.',
        );
      }
    }

    if (formula === KpiScoringFormulaEnum.MANUAL_RATING) {
      const maximum = this.toDecimal(
        configuration?.maximum_rating ?? 5,
        'Manual-rating maximum',
      );
      if (maximum.lte(0)) {
        throw new BadRequestException(
          'Manual-rating KPI configuration requires a positive maximum rating.',
        );
      }
    }
  }

  private toDecimal(value: unknown, label: string): Decimal {
    if (
      (typeof value !== 'string' && typeof value !== 'number') ||
      (typeof value === 'string' && value.trim() === '')
    ) {
      throw new BadRequestException(`${label} must be a finite number.`);
    }
    let decimal: Decimal;
    try {
      decimal = new Decimal(value);
    } catch {
      throw new BadRequestException(`${label} must be a finite number.`);
    }
    if (!decimal.isFinite()) {
      throw new BadRequestException(`${label} must be a finite number.`);
    }
    return decimal;
  }

  private calculateRawScore(input: ScoreInput): Decimal {
    const target =
      input.targetValue === null ? null : new Decimal(input.targetValue);
    const achievement = new Decimal(input.achievementValue as string | number);

    switch (input.formula) {
      case KpiScoringFormulaEnum.PERCENT_TO_TARGET:
        if (!target || target.eq(0)) {
          return achievement.eq(0) ? new Decimal(100) : new Decimal(0);
        }
        return achievement.div(target).mul(100);

      case KpiScoringFormulaEnum.INVERSE_PERCENT_TO_TARGET:
        if (!target || target.eq(0)) {
          return new Decimal(100);
        }
        if (achievement.eq(0)) {
          return new Decimal(
            this.configService.get<number>(
              'PERFORMANCE_DEFAULT_SCORE_CAP',
              120,
            ),
          );
        }
        return target.div(achievement).mul(100);

      case KpiScoringFormulaEnum.TARGET_VARIANCE:
        if (!target || target.eq(0)) {
          return achievement.eq(0) ? new Decimal(100) : new Decimal(0);
        }
        return Decimal.max(
          new Decimal(0),
          new Decimal(100).minus(
            achievement.minus(target).abs().div(target).mul(100),
          ),
        );

      case KpiScoringFormulaEnum.THRESHOLD_BANDS:
        return this.scoreThresholdBands(
          achievement,
          input.formulaConfiguration,
        );

      case KpiScoringFormulaEnum.RANGE_COMPLIANCE:
        return this.scoreRangeCompliance(
          achievement,
          input.formulaConfiguration,
        );

      case KpiScoringFormulaEnum.BINARY_RESULT:
        return achievement.gt(0) ? new Decimal(100) : new Decimal(0);

      case KpiScoringFormulaEnum.MANUAL_RATING:
        return this.scoreManualRating(achievement, input.formulaConfiguration);

      default:
        throw new BadRequestException('Unsupported KPI scoring formula.');
    }
  }

  private scoreThresholdBands(
    achievement: Decimal,
    configuration: Record<string, unknown> | null | undefined,
  ): Decimal {
    const bands = Array.isArray(configuration?.bands)
      ? (configuration?.bands as Array<{
          min?: number;
          max?: number;
          score: number;
        }>)
      : [];

    for (const band of bands) {
      const min = band.min === undefined ? null : new Decimal(band.min);
      const max = band.max === undefined ? null : new Decimal(band.max);

      if (
        (min === null || achievement.gte(min)) &&
        (max === null || achievement.lte(max))
      ) {
        return new Decimal(band.score);
      }
    }

    return new Decimal(0);
  }

  private scoreRangeCompliance(
    achievement: Decimal,
    configuration: Record<string, unknown> | null | undefined,
  ): Decimal {
    const min =
      configuration?.minimum === undefined
        ? null
        : new Decimal(configuration.minimum as string | number);
    const max =
      configuration?.maximum === undefined
        ? null
        : new Decimal(configuration.maximum as string | number);

    if (
      (min === null || achievement.gte(min)) &&
      (max === null || achievement.lte(max))
    ) {
      return new Decimal(100);
    }

    return new Decimal(0);
  }

  private scoreManualRating(
    achievement: Decimal,
    configuration: Record<string, unknown> | null | undefined,
  ): Decimal {
    const maximum = new Decimal(
      (configuration?.maximum_rating as string | number | undefined) ?? 5,
    );

    if (maximum.lte(0)) {
      throw new BadRequestException(
        'Manual-rating KPI configuration requires a positive maximum rating.',
      );
    }

    return achievement.div(maximum).mul(100);
  }
}
