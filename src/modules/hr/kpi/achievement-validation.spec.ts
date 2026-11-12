import { validateActual } from './achievement-validation';

describe('KPI actual measurement validation', () => {
  it('accepts valid typed actuals', () => {
    expect(() => validateActual('numeric', -2)).not.toThrow();
    expect(() => validateActual('percentage', 90)).not.toThrow();
    expect(() => validateActual('binary', false)).not.toThrow();
    expect(() =>
      validateActual('milestone', { completed: true }),
    ).not.toThrow();
    expect(() => validateActual('qualitative', 'Met', ['Met'])).not.toThrow();
  });
  it('rejects mismatched, missing and invalid values', () => {
    for (const [type, value] of [
      ['numeric', '90'],
      ['percentage', 101],
      ['duration', -1],
      ['binary', 1],
      ['milestone', { completed: 'yes' }],
      ['qualitative', 'Unknown'],
      ['currency', null],
    ] as const)
      expect(() => validateActual(type, value, ['Met'])).toThrow();
  });
});
