import { validateEnv } from './env.validation';

function buildEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  const longSecret =
    'this-is-a-long-enough-secret-for-production-validation-12345';

  return {
    DB_NAME: 'hrms_test',
    JWT_ACCESS_SECRET: longSecret,
    JWT_REFRESH_SECRET: `${longSecret}-refresh`,
    JWT_RESET_SECRET: `${longSecret}-reset`,
    NODE_ENV: 'uat',
    APP_ENV: 'uat',
    APP_URL: 'https://api.example.com',
    APP_FRONTEND_URL: 'https://uat.example.com',
    APP_ALLOWED_ORIGINS: 'https://uat.example.com',
    MAIL_HOST: 'smtp.example.com',
    MAIL_USER: 'mailer@example.com',
    MAIL_PASS: 'secret',
    ...overrides,
  };
}

function productionRequirements(
  appEnv: string,
): Record<string, string | undefined> {
  return appEnv === 'production'
    ? {
        FILE_MALWARE_SCAN_MODE: 'required',
      }
    : {};
}

describe('validateEnv', () => {
  // Invitation, reset and verification links are built from APP_FRONTEND_URL,
  // so the app must refuse to start without a valid one.
  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a URL', 'hrms.example.com'],
  ])('rejects an APP_FRONTEND_URL that is %s', (_label, value) => {
    expect(() => validateEnv(buildEnv({ APP_FRONTEND_URL: value }))).toThrow(
      /APP_FRONTEND_URL/,
    );
  });

  it.each(['uat', 'production'])('allows a local APP_URL in %s', (appEnv) => {
    expect(() =>
      validateEnv(
        buildEnv({
          NODE_ENV: appEnv,
          APP_ENV: appEnv,
          ...productionRequirements(appEnv),
          APP_URL: 'http://127.0.0.1:8888',
        }),
      ),
    ).not.toThrow();
  });

  it.each(['uat', 'production'])(
    'allows wildcard-port IP origins in %s',
    (appEnv) => {
      const config = validateEnv(
        buildEnv({
          NODE_ENV: appEnv,
          APP_ENV: appEnv,
          ...productionRequirements(appEnv),
          APP_ALLOWED_ORIGINS: 'http://192.168.1.30:*,http://154.72.81.122:*,',
        }),
      );

      expect(config.APP_ALLOWED_ORIGINS).toEqual([
        'http://192.168.1.30:*',
        'http://154.72.81.122:*',
      ]);
    },
  );

  it.each(['uat', 'production'])(
    'allows a local APP_FRONTEND_URL in %s',
    (appEnv) => {
      expect(() =>
        validateEnv(
          buildEnv({
            NODE_ENV: appEnv,
            APP_ENV: appEnv,
            ...productionRequirements(appEnv),
            APP_FRONTEND_URL: 'http://192.168.1.30:5173',
          }),
        ),
      ).not.toThrow();
    },
  );

  it('normalizes the production wildcard-port IP origins', () => {
    const config = validateEnv(
      buildEnv({
        NODE_ENV: 'production',
        APP_ENV: 'production',
        FILE_MALWARE_SCAN_MODE: 'required',
        APP_ALLOWED_ORIGINS: 'http://192.168.1.30:*,http://154.72.81.122:*,',
      }),
    );

    expect(config.APP_ALLOWED_ORIGINS).toEqual([
      'http://192.168.1.30:*',
      'http://154.72.81.122:*',
    ]);
  });
});
