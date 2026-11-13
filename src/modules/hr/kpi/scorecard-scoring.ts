import Decimal from 'decimal.js';
import { BadRequestException } from '@nestjs/common';
import type { KpiDirection, KpiMeasurement } from './kpi.entities';
import type { RatingBand, ScorecardMode } from './scorecard.entities';

export type ScoringConfig = {
  minScore: number;
  maxScore: number;
  scoreCap: number;
  displayDecimals: number;
  missingTreatment: 'block' | 'exclude_optional';
  notApplicableTreatment: 'block' | 'redistribute';
  exactTolerance: number;
  qualitativeRubric: Array<{ label: string; score: number }>;
};
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  minScore: 0,
  maxScore: 100,
  scoreCap: 100,
  displayDecimals: 2,
  missingTreatment: 'block',
  notApplicableTreatment: 'block',
  exactTolerance: 0,
  qualitativeRubric: [],
};
// Illustrative, provisional bands. Each band is [from, to), except the final upper bound.
export const DEFAULT_RATING_BANDS: RatingBand[] = [
  { label: 'Unsatisfactory', from: 0, to: 60 },
  { label: 'Needs Improvement', from: 60, to: 70 },
  { label: 'Satisfactory', from: 70, to: 80 },
  { label: 'Good', from: 80, to: 90 },
  { label: 'Excellent', from: 90, to: 100 },
];
const D = (value: Decimal.Value) => new Decimal(value);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const serialized = (value: Decimal) => value.toDecimalPlaces(12).toString();

export function validateScoringConfig(
  config: ScoringConfig,
  bands: RatingBand[],
): void {
  if (
    ![
      config.minScore,
      config.maxScore,
      config.scoreCap,
      config.exactTolerance,
    ].every(finite) ||
    config.minScore < 0 ||
    config.maxScore <= config.minScore ||
    config.scoreCap < config.minScore ||
    config.scoreCap > config.maxScore ||
    config.exactTolerance < 0 ||
    !Number.isInteger(config.displayDecimals) ||
    config.displayDecimals < 0 ||
    config.displayDecimals > 6 ||
    !['block', 'exclude_optional'].includes(config.missingTreatment) ||
    !['block', 'redistribute'].includes(config.notApplicableTreatment)
  )
    throw new BadRequestException('Invalid scoring policy configuration');
  if (
    !Array.isArray(config.qualitativeRubric) ||
    config.qualitativeRubric.some(
      (r) =>
        !r.label?.trim() ||
        !finite(r.score) ||
        r.score < config.minScore ||
        r.score > config.maxScore,
    )
  )
    throw new BadRequestException('Invalid qualitative rubric');
  if (
    new Set(config.qualitativeRubric.map((r) => r.label.trim().toLowerCase()))
      .size !== config.qualitativeRubric.length
  )
    throw new BadRequestException('Duplicate qualitative rubric labels');
  if (!Array.isArray(bands) || bands.length === 0)
    throw new BadRequestException('Rating bands required');
  const sorted = [...bands].sort((a, b) => a.from - b.from);
  if (
    sorted.some(
      (b) =>
        !b.label?.trim() || !finite(b.from) || !finite(b.to) || b.from >= b.to,
    ) ||
    !D(sorted[0].from).eq(config.minScore) ||
    !D(sorted.at(-1)!.to).eq(config.scoreCap) ||
    sorted.some((b, i) => i > 0 && !D(sorted[i - 1].to).eq(b.from))
  )
    throw new BadRequestException(
      'Rating bands must cover the scoring range without gaps or overlap',
    );
}

export function validateWeights(
  weights: Array<string | number>,
  mode: ScorecardMode,
): string {
  if (!weights.length)
    throw new BadRequestException('At least one KPI entry is required');
  const values = weights.map((value) => {
    try {
      return D(value);
    } catch {
      throw new BadRequestException('Invalid KPI weight');
    }
  });
  if (
    values.some(
      (value) =>
        !value.isFinite() || value.isNegative() || value.decimalPlaces() > 4,
    )
  )
    throw new BadRequestException(
      'KPI weights must be non-negative with at most four decimals',
    );
  const total = values.reduce((sum, value) => sum.plus(value), D(0));
  if (mode === 'weighted' && !total.eq(100))
    throw new BadRequestException(
      `Published weights must total exactly 100%; current total ${total.toString()}%`,
    );
  if (mode === 'strategic' && total.gt(0))
    throw new BadRequestException(
      'Strategic status-only scorecards cannot have weights',
    );
  return total.toString();
}

export type PreviewInput = {
  entryId: number;
  weight: string;
  required: boolean;
  type: KpiMeasurement;
  direction: KpiDirection;
  target: Record<string, unknown>;
  actual?: unknown;
  notApplicable?: boolean;
};
export type MetricResult = {
  status: 'scored' | 'missing' | 'unscorable' | 'not_applicable';
  rawAchievement: string | null;
  scoredAchievement: string | null;
  reason?: string;
};

export function scoreMetric(
  input: PreviewInput,
  policy: ScoringConfig,
): MetricResult {
  if (input.notApplicable)
    return {
      status: 'not_applicable',
      rawAchievement: null,
      scoredAchievement: null,
    };
  if (
    input.actual === undefined ||
    input.actual === null ||
    input.actual === ''
  )
    return { status: 'missing', rawAchievement: null, scoredAchievement: null };
  const unscorable = (reason: string): MetricResult => ({
    status: 'unscorable',
    rawAchievement: null,
    scoredAchievement: null,
    reason,
  });
  let raw: Decimal;
  const target = input.target;
  if (['numeric', 'percentage', 'currency', 'duration'].includes(input.type)) {
    if (!finite(input.actual)) return unscorable('Numeric actual required');
    const actual = D(input.actual);
    if (input.type === 'percentage' && (actual.lt(0) || actual.gt(100)))
      return unscorable('Percentage actual outside 0–100');
    if (['currency', 'duration'].includes(input.type) && actual.lt(0))
      return unscorable('Negative actual is invalid');
    if (input.direction === 'range') {
      if (!finite(target.min) || !finite(target.max) || target.min > target.max)
        return unscorable('Invalid range target');
      raw = actual.gte(target.min) && actual.lte(target.max) ? D(100) : D(0);
    } else if (input.direction === 'exact') {
      if (!finite(target.value)) return unscorable('Invalid exact target');
      raw = actual.minus(target.value).abs().lte(policy.exactTolerance)
        ? D(100)
        : D(0);
    } else if (input.direction === 'higher' || input.direction === 'lower') {
      if (
        !finite(target.value) ||
        target.value <= 0 ||
        (input.direction === 'lower' && actual.lte(0))
      )
        return unscorable(
          'Positive target and, for lower-is-better, positive actual required',
        );
      raw =
        input.direction === 'higher'
          ? actual.div(target.value).times(100)
          : D(target.value).div(actual).times(100);
    } else return unscorable('No numeric scoring direction');
  } else if (input.type === 'binary') {
    if (typeof target.value !== 'boolean' || typeof input.actual !== 'boolean')
      return unscorable('Binary target and actual required');
    raw = input.actual === target.value ? D(100) : D(0);
  } else if (input.type === 'milestone') {
    if (
      typeof input.actual !== 'object' ||
      input.actual === null ||
      typeof (input.actual as { completed?: unknown }).completed !== 'boolean'
    )
      return unscorable('Milestone completion required');
    raw = (input.actual as { completed: boolean }).completed ? D(100) : D(0);
  } else if (input.type === 'qualitative') {
    const rating = typeof input.actual === 'string' ? input.actual : null;
    const match = policy.qualitativeRubric.find((r) => r.label === rating);
    if (!match)
      return unscorable('Configured qualitative rubric rating required');
    raw = D(match.score);
  } else return unscorable('Unsupported measurement type');
  const scored = Decimal.min(
    D(policy.scoreCap),
    Decimal.max(D(policy.minScore), raw),
  );
  return {
    status: 'scored',
    rawAchievement: serialized(raw),
    scoredAchievement: serialized(scored),
  };
}

export function previewScorecard(
  inputs: PreviewInput[],
  mode: ScorecardMode,
  policy: ScoringConfig,
  bands: RatingBand[],
) {
  validateScoringConfig(policy, bands);
  const entries = inputs.map((input) => ({
    ...scoreMetric(input, policy),
    entryId: input.entryId,
    weight: input.weight,
  }));
  const completeWeight = inputs.reduce(
    (sum, input, i) =>
      entries[i].status === 'scored' ? sum.plus(input.weight) : sum,
    D(0),
  );
  const applicableWeight = inputs.reduce(
    (sum, input, i) =>
      entries[i].status !== 'not_applicable' &&
      !(
        entries[i].status === 'missing' &&
        !input.required &&
        policy.missingTreatment === 'exclude_optional'
      )
        ? sum.plus(input.weight)
        : sum,
    D(0),
  );
  const blocked = entries.some(
    (row, i) =>
      row.status === 'unscorable' ||
      (row.status === 'missing' &&
        (inputs[i].required ||
          policy.missingTreatment === 'block' ||
          policy.notApplicableTreatment !== 'redistribute')) ||
      (row.status === 'not_applicable' &&
        policy.notApplicableTreatment === 'block'),
  );
  const contributions = entries.map((row, i) =>
    row.status === 'scored'
      ? D(row.scoredAchievement!).times(inputs[i].weight).div(100)
      : D(0),
  );
  const base = contributions.reduce((sum, value) => sum.plus(value), D(0));
  const adjusted =
    policy.notApplicableTreatment === 'redistribute' && applicableWeight.gt(0)
      ? base.times(100).div(applicableWeight)
      : base;
  const score =
    mode === 'weighted' &&
    !blocked &&
    completeWeight.eq(applicableWeight) &&
    applicableWeight.gt(0)
      ? adjusted
      : null;
  const rating =
    score === null
      ? null
      : (bands.find(
          (b, i) =>
            score.gte(b.from) &&
            (score.lt(b.to) || (i === bands.length - 1 && score.lte(b.to))),
        )?.label ?? null);
  return {
    entries: entries.map((row, i) => ({
      ...row,
      weightedContribution:
        row.status === 'scored' ? serialized(contributions[i]) : null,
    })),
    completenessPercent: applicableWeight.gt(0)
      ? serialized(completeWeight.times(100).div(applicableWeight))
      : '0',
    overallScore:
      score?.toDecimalPlaces(policy.displayDecimals).toString() ?? null,
    rating,
    status:
      mode === 'strategic'
        ? 'status_only'
        : score === null
          ? 'awaiting_data'
          : 'preview_only',
  };
}
