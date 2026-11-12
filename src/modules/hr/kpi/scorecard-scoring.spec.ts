import {
  DEFAULT_RATING_BANDS,
  DEFAULT_SCORING_CONFIG,
  previewScorecard,
  scoreMetric,
  validateScoringConfig,
  validateWeights,
} from './scorecard-scoring';

const base = {
  entryId: 1,
  weight: '100',
  required: true,
  type: 'numeric' as const,
  direction: 'higher' as const,
  target: { value: 100 },
};
describe('Phase 2 deterministic scoring', () => {
  it('calculates the documented 88% weighted example', () => {
    const scores = [90, 80, 100, 80],
      weights = ['40', '25', '20', '15'];
    const inputs = scores.map((actual, i) => ({
      ...base,
      entryId: i + 1,
      weight: weights[i],
      actual,
    }));
    expect(validateWeights(weights, 'weighted')).toBe('100');
    const result = previewScorecard(
      inputs,
      'weighted',
      DEFAULT_SCORING_CONFIG,
      DEFAULT_RATING_BANDS,
    );
    expect(result.overallScore).toBe('88');
    expect(result.rating).toBe('Good');
  });
  it('requires exact 100% weighted total and valid precision', () => {
    expect(() => validateWeights(['40', '59.9999'], 'weighted')).toThrow();
    expect(() => validateWeights(['50', '51'], 'weighted')).toThrow();
    expect(() => validateWeights(['-1', '101'], 'weighted')).toThrow();
    expect(() =>
      validateWeights(['33.33333', '66.66667'], 'weighted'),
    ).toThrow();
    expect(validateWeights(['33.3333', '66.6667'], 'weighted')).toBe('100');
    expect(() => validateWeights(['1'], 'strategic')).toThrow();
  });
  it('preserves raw overachievement separately from capped score', () => {
    expect(
      scoreMetric({ ...base, actual: 125 }, DEFAULT_SCORING_CONFIG),
    ).toMatchObject({ rawAchievement: '125', scoredAchievement: '100' });
    expect(
      scoreMetric(
        { ...base, direction: 'lower', target: { value: 50 }, actual: 25 },
        DEFAULT_SCORING_CONFIG,
      ),
    ).toMatchObject({ rawAchievement: '200', scoredAchievement: '100' });
    expect(
      scoreMetric({ ...base, actual: 0 }, DEFAULT_SCORING_CONFIG),
    ).toMatchObject({ rawAchievement: '0', scoredAchievement: '0' });
    expect(
      scoreMetric(
        { ...base, direction: 'lower', actual: 0 },
        DEFAULT_SCORING_CONFIG,
      ).status,
    ).toBe('unscorable');
  });
  it('never divides by zero or invents scores for invalid targets', () => {
    expect(
      scoreMetric(
        { ...base, target: { value: 0 }, actual: 10 },
        DEFAULT_SCORING_CONFIG,
      ).status,
    ).toBe('unscorable');
    expect(
      scoreMetric(
        { ...base, direction: 'lower', actual: -1 },
        DEFAULT_SCORING_CONFIG,
      ).status,
    ).toBe('unscorable');
    expect(
      scoreMetric({ ...base, actual: -10 }, DEFAULT_SCORING_CONFIG),
    ).toMatchObject({ rawAchievement: '-10', scoredAchievement: '0' });
  });
  it('scores exact and range outcomes deterministically', () => {
    expect(
      scoreMetric(
        { ...base, direction: 'exact', target: { value: 5 }, actual: 5 },
        DEFAULT_SCORING_CONFIG,
      ).scoredAchievement,
    ).toBe('100');
    expect(
      scoreMetric(
        { ...base, direction: 'exact', target: { value: 5 }, actual: 4 },
        DEFAULT_SCORING_CONFIG,
      ).scoredAchievement,
    ).toBe('0');
    expect(
      scoreMetric(
        { ...base, direction: 'range', target: { min: 2, max: 4 }, actual: 3 },
        DEFAULT_SCORING_CONFIG,
      ).scoredAchievement,
    ).toBe('100');
    expect(
      scoreMetric(
        { ...base, direction: 'range', target: { min: 2, max: 4 }, actual: 5 },
        DEFAULT_SCORING_CONFIG,
      ).scoredAchievement,
    ).toBe('0');
  });
  it('supports binary, milestone, and configured qualitative examples', () => {
    expect(
      scoreMetric(
        {
          ...base,
          type: 'binary',
          direction: 'not_applicable',
          target: { value: true },
          actual: false,
        },
        DEFAULT_SCORING_CONFIG,
      ).scoredAchievement,
    ).toBe('0');
    expect(
      scoreMetric(
        {
          ...base,
          type: 'milestone',
          direction: 'not_applicable',
          target: { description: 'Finish' },
          actual: { completed: true },
        },
        DEFAULT_SCORING_CONFIG,
      ).scoredAchievement,
    ).toBe('100');
    expect(
      scoreMetric(
        {
          ...base,
          type: 'qualitative',
          direction: 'not_applicable',
          target: { description: 'Quality' },
          actual: 'Strong',
        },
        {
          ...DEFAULT_SCORING_CONFIG,
          qualitativeRubric: [{ label: 'Strong', score: 90 }],
        },
      ).scoredAchievement,
    ).toBe('90');
    expect(
      scoreMetric(
        {
          ...base,
          type: 'qualitative',
          direction: 'not_applicable',
          target: { description: 'Quality' },
          actual: 'Strong',
        },
        DEFAULT_SCORING_CONFIG,
      ).status,
    ).toBe('unscorable');
  });
  it('blocks missing required values and separates completeness from score', () => {
    const result = previewScorecard(
      [
        { ...base, weight: '50', actual: 90 },
        { ...base, entryId: 2, weight: '50' },
      ],
      'weighted',
      DEFAULT_SCORING_CONFIG,
      DEFAULT_RATING_BANDS,
    );
    expect(result.overallScore).toBeNull();
    expect(result.completenessPercent).toBe('50');
    expect(result.status).toBe('awaiting_data');
  });
  it('redistributes only with an explicit policy and never persists preview results', () => {
    const policy = {
      ...DEFAULT_SCORING_CONFIG,
      notApplicableTreatment: 'redistribute' as const,
    };
    const result = previewScorecard(
      [
        { ...base, weight: '50', actual: 80 },
        { ...base, entryId: 2, weight: '50', notApplicable: true },
      ],
      'weighted',
      policy,
      DEFAULT_RATING_BANDS,
    );
    expect(result.overallScore).toBe('80');
    expect(result.entries[1].status).toBe('not_applicable');
  });
  it('uses decimal arithmetic and validates rating boundaries', () => {
    const result = previewScorecard(
      [
        { ...base, weight: '33.3333', actual: 90 },
        { ...base, entryId: 2, weight: '66.6667', actual: 90 },
      ],
      'weighted',
      DEFAULT_SCORING_CONFIG,
      DEFAULT_RATING_BANDS,
    );
    expect(result.overallScore).toBe('90');
    expect(result.rating).toBe('Excellent');
    expect(() =>
      validateScoringConfig(DEFAULT_SCORING_CONFIG, [
        { label: 'A', from: 0, to: 60 },
        { label: 'B', from: 59, to: 100 },
      ]),
    ).toThrow();
  });
});
