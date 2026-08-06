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
    if (input.achievementValue === null || input.achievementValue === undefined) {
      return {
        rawScore: null,
        cappedScore: null,
        weightedScore: null,
      };
    }

    const rawScore = this.calculateRawScore(input);
    const scoreCap = new Decimal(
      this.configService.get<number>('PERFORMANCE_DEFAULT_SCORE_CAP', 120),
    );
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
    if (
      formula !== KpiScoringFormulaEnum.THRESHOLD_BANDS ||
      !configuration?.bands ||
      !Array.isArray(configuration.bands)
    ) {
      return;
    }

    const bands = configuration.bands
      .map((item) => item as { min?: number; max?: number })
      .sort((left, right) => (left.min ?? 0) - (right.min ?? 0));

    for (let index = 1; index < bands.length; index += 1) {
      const previous = bands[index - 1];
      const current = bands[index];

      if (
        previous.max !== undefined &&
        current.min !== undefined &&
        previous.max > current.min
      ) {
        throw new BadRequestException(
          'Threshold band configuration contains overlapping ranges.',
        );
      }
    }
  }

  private calculateRawScore(input: ScoreInput): Decimal {
    const target = input.targetValue === null ? null : new Decimal(input.targetValue);
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
            this.configService.get<number>('PERFORMANCE_DEFAULT_SCORE_CAP', 120),
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
        return this.scoreThresholdBands(achievement, input.formulaConfiguration);

      case KpiScoringFormulaEnum.RANGE_COMPLIANCE:
        return this.scoreRangeCompliance(achievement, input.formulaConfiguration);

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

      if ((min === null || achievement.gte(min)) && (max === null || achievement.lte(max))) {
        return new Decimal(band.score);
      }
    }

    return new Decimal(0);
  }

  private scoreRangeCompliance(
    achievement: Decimal,
    configuration: Record<string, unknown> | null | undefined,
  ): Decimal {
    const min = configuration?.minimum === undefined
      ? null
      : new Decimal(configuration.minimum as string | number);
    const max = configuration?.maximum === undefined
      ? null
      : new Decimal(configuration.maximum as string | number);

    if ((min === null || achievement.gte(min)) && (max === null || achievement.lte(max))) {
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
