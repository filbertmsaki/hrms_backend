import { BadRequestException } from '@nestjs/common';
import {
  validateMeasurement,
  validatePeriod,
  validateTarget,
} from './kpi-policy';

describe('Phase 1A KPI measurement and target policy', () => {
  it('accepts numeric, range, binary, and qualitative targets with matching definitions', () => {
    expect(() =>
      validateMeasurement('currency', 'TZS', 'higher'),
    ).not.toThrow();
    expect(() =>
      validateTarget('numeric', 'higher', { value: 12 }),
    ).not.toThrow();
    expect(() =>
      validateTarget('percentage', 'range', { min: 20, max: 80 }),
    ).not.toThrow();
    expect(() =>
      validateTarget('binary', 'not_applicable', { value: true }),
    ).not.toThrow();
    expect(() =>
      validateTarget('qualitative', 'not_applicable', {
        description: 'Complete audit',
      }),
    ).not.toThrow();
  });
  it('rejects incompatible measurement configurations and malformed targets', () => {
    expect(() => validateMeasurement('currency', '', 'higher')).toThrow(
      BadRequestException,
    );
    expect(() => validateMeasurement('qualitative', null, 'higher')).toThrow(
      BadRequestException,
    );
    expect(() =>
      validateTarget('percentage', 'higher', { value: 120 }),
    ).toThrow(BadRequestException);
    expect(() => validateTarget('duration', 'lower', { value: -1 })).toThrow(
      BadRequestException,
    );
    expect(() =>
      validateTarget('numeric', 'range', { min: 8, max: 3 }),
    ).toThrow(BadRequestException);
    expect(() =>
      validateTarget('milestone', 'not_applicable', { value: 10 }),
    ).toThrow(BadRequestException);
  });
  it('rejects reversed and invalid reporting boundaries', () => {
    expect(() => validatePeriod('2026-01-01', '2026-01-31')).not.toThrow();
    expect(() => validatePeriod('2026-02-01', '2026-01-31')).toThrow(
      BadRequestException,
    );
    expect(() => validatePeriod('2026-02-30', '2026-03-01')).toThrow(
      BadRequestException,
    );
  });
});
