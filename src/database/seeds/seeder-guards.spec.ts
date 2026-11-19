import { assertSchemaResetAllowed } from './seeder-guards';

describe('schema reset production guard', () => {
  it('permits non-production environments', () => {
    expect(() =>
      assertSchemaResetAllowed({ APP_ENV: 'uat', DB_NAME: 'hrms_uat_db' }),
    ).not.toThrow();
  });

  it.each([
    { APP_ENV: 'production', DB_NAME: 'hrms_db' },
    { NODE_ENV: 'production', DB_NAME: 'hrms_db' },
    { APP_ENV: 'production', DB_NAME: 'hrms_db', DB_RESET_CONFIRM: 'YES' },
    { APP_ENV: 'production', DB_RESET_CONFIRM: '' },
  ])('refuses production without the database name: %o', (env) => {
    expect(() => assertSchemaResetAllowed(env)).toThrow(
      /Refusing to drop the database schema in production/,
    );
  });

  it('permits production when DB_RESET_CONFIRM names the target database', () => {
    expect(() =>
      assertSchemaResetAllowed({
        APP_ENV: 'production',
        DB_NAME: 'hrms_db',
        DB_RESET_CONFIRM: 'hrms_db',
      }),
    ).not.toThrow();
  });
});
