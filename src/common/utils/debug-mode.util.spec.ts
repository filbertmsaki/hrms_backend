import { isDebugModeEnabled, resolveDebugMode } from './debug-mode.util';

describe('debug-mode util', () => {
  it('enables debug mode only for explicit truthy values', () => {
    expect(resolveDebugMode('true')).toBe(true);
    expect(resolveDebugMode('TRUE')).toBe(true);
    expect(resolveDebugMode('1')).toBe(true);
    expect(resolveDebugMode('yes')).toBe(true);
    expect(resolveDebugMode('on')).toBe(true);
  });

  it('disables debug mode for explicit false values and empty input', () => {
    expect(resolveDebugMode('false')).toBe(false);
    expect(resolveDebugMode('FALSE')).toBe(false);
    expect(resolveDebugMode('0')).toBe(false);
    expect(resolveDebugMode('no')).toBe(false);
    expect(resolveDebugMode('off')).toBe(false);
    expect(resolveDebugMode('')).toBe(false);
    expect(resolveDebugMode(undefined)).toBe(false);
  });

  it('fails closed for non-boolean host debug values', () => {
    expect(resolveDebugMode('release')).toBe(false);
    expect(resolveDebugMode('express:*')).toBe(false);
  });

  it('reads the DEBUG flag from process-like env objects', () => {
    expect(isDebugModeEnabled({ DEBUG: 'true' } as NodeJS.ProcessEnv)).toBe(
      true,
    );
    expect(isDebugModeEnabled({ DEBUG: 'release' } as NodeJS.ProcessEnv)).toBe(
      false,
    );
  });
});
