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

  it('permits an explicitly confirmed UAT database with production runtime settings', () => {
    expect(() =>
      assertLegacySeedChainAllowed({
        APP_ENV: 'uat',
        NODE_ENV: 'production',
        DB_NAME: 'hrms_uat',
        LEGACY_UAT_SEED_CONFIRM: 'YES',
      }),
    ).not.toThrow();
  });

  it.each([
    { APP_ENV: 'uat', NODE_ENV: 'production', DB_NAME: 'hrms_uat' },
    {
      APP_ENV: 'uat',
      NODE_ENV: 'production',
      DB_NAME: 'hrms_prod_uat',
      LEGACY_UAT_SEED_CONFIRM: 'YES',
    },
    {
      APP_ENV: 'uat',
      NODE_ENV: 'production',
      DB_NAME: 'hrms',
      LEGACY_UAT_SEED_CONFIRM: 'YES',
    },
    {
      APP_ENV: 'production',
      NODE_ENV: 'production',
      DB_NAME: 'hrms_uat',
      LEGACY_UAT_SEED_CONFIRM: 'YES',
    },
  ])('rejects an incomplete or conflicting UAT confirmation: %o', (env) => {
    expect(() => assertLegacySeedChainAllowed(env)).toThrow(
      /blocked in production/,
    );
  });
});
