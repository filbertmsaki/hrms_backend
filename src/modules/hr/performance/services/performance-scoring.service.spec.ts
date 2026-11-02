import { ConfigService } from '@nestjs/config';
import { KpiScoringFormulaEnum } from '../enums/kpi-scoring-formula.enum';
import { PerformanceScoringService } from './performance-scoring.service';

describe('PerformanceScoringService', () => {
  const service = new PerformanceScoringService(
    new ConfigService({
      PERFORMANCE_DEFAULT_SCORE_CAP: 120,
    }),
  );

  it('caps percent-to-target scores at the configured limit', () => {
    const result = service.score({
      formula: KpiScoringFormulaEnum.PERCENT_TO_TARGET,
      targetValue: 100,
      achievementValue: 150,
      weight: 20,
    });

    expect(result.rawScore).toBe('150.0000');
    expect(result.cappedScore).toBe('120.0000');
    expect(result.weightedScore).toBe('24.0000');
  });

  it('supports inverse target scoring for lower-is-better KPIs', () => {
    const result = service.score({
      formula: KpiScoringFormulaEnum.INVERSE_PERCENT_TO_TARGET,
      targetValue: 5,
      achievementValue: 4,
      weight: 20,
    });

    expect(result.rawScore).toBe('125.0000');
    expect(result.cappedScore).toBe('120.0000');
    expect(result.weightedScore).toBe('24.0000');
  });

  it('validates threshold bands for overlaps', () => {
    expect(() =>
      service.validateFormulaConfiguration(
        KpiScoringFormulaEnum.THRESHOLD_BANDS,
        {
          bands: [
            { min: 0, max: 50, score: 40 },
            { min: 49, max: 100, score: 100 },
          ],
        },
      ),
    ).toThrow('Threshold band configuration contains overlapping ranges.');
  });

  it('rejects malformed threshold bands instead of silently scoring zero', () => {
    expect(() =>
      service.validateFormulaConfiguration(
        KpiScoringFormulaEnum.THRESHOLD_BANDS,
        { bands: [] },
      ),
    ).toThrow('Threshold-band scoring requires at least one configured band.');
    expect(() =>
      service.validateFormulaConfiguration(
        KpiScoringFormulaEnum.THRESHOLD_BANDS,
        { bands: [{ min: 10, max: 1, score: 80 }] },
      ),
    ).toThrow('minimum cannot exceed its maximum');
  });

  it('rejects non-finite achievements and invalid weights', () => {
    expect(() =>
      service.score({
        formula: KpiScoringFormulaEnum.PERCENT_TO_TARGET,
        targetValue: 100,
        achievementValue: Number.NaN,
        weight: 20,
      }),
    ).toThrow('KPI achievement value must be a finite number.');
    expect(() =>
      service.score({
        formula: KpiScoringFormulaEnum.PERCENT_TO_TARGET,
        targetValue: 100,
        achievementValue: 50,
        weight: 101,
      }),
    ).toThrow('KPI weight must be between 0 and 100.');
  });
});
