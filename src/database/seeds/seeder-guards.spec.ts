import { assertLegacySeedChainAllowed } from './seeder-guards';

describe('legacy seed chain production guard', () => {
  it.each([
    { APP_ENV: 'production' },
    { NODE_ENV: 'production' },
    { APP_ENV: 'development', NODE_ENV: ' Production ' },
    { APP_ENV: 'production', NODE_ENV: 'test' },
  ])('blocks production environment markers: %o', (env) => {
    expect(() => assertLegacySeedChainAllowed(env)).toThrow(
      /blocked in production/,
    );
  });

  it('permits a non-production environment', () => {
    expect(() =>
      assertLegacySeedChainAllowed({ APP_ENV: 'test' }),
    ).not.toThrow();
  });
});
