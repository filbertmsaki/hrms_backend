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
  it('accepts zero allowed extensions and uses whole days for probation configuration', () => {
    expect(
      validateEnv(
        buildEnv({
          PROBATION_MAX_EXTENSIONS: '0',
          PROBATION_REMINDER_DAYS: '12,3,0',
        }),
      ),
    ).toMatchObject({
      PROBATION_MAX_EXTENSIONS: 0,
      PROBATION_REMINDER_DAYS: [12, 3, 0],
    });
    for (const invalid of ['-1', '0.5', '15days', 'Infinity']) {
      expect(() =>
        validateEnv(buildEnv({ PROBATION_REMINDER_DAYS: invalid })),
      ).toThrow(/PROBATION_REMINDER_DAYS/);
      expect(() =>
        validateEnv(buildEnv({ PROBATION_MAX_EXTENSIONS: invalid })),
      ).toThrow(/PROBATION_MAX_EXTENSIONS/);
    }
    expect(() =>
      validateEnv(
        buildEnv({
          PROBATION_DEFAULT_EXTENSION_DAYS: '11',
          PROBATION_MAX_EXTENSION_DAYS: '10',
        }),
      ),
    ).toThrow(/PROBATION_DEFAULT_EXTENSION_DAYS/);
  });

  it('validates the absolute session lifetime within supported bounds', () => {
    expect(validateEnv(buildEnv()).AUTH_SESSION_ABSOLUTE_MAX_SECONDS).toBe(
      604800,
    );
    expect(
      validateEnv(buildEnv({ AUTH_SESSION_ABSOLUTE_MAX_SECONDS: '3600' }))
        .AUTH_SESSION_ABSOLUTE_MAX_SECONDS,
    ).toBe(3600);
    for (const invalid of ['0', '3599', '7776001', '3600x', '1.5']) {
      expect(() =>
        validateEnv(buildEnv({ AUTH_SESSION_ABSOLUTE_MAX_SECONDS: invalid })),
      ).toThrow(/AUTH_SESSION_ABSOLUTE_MAX_SECONDS/);
    }
  });
  it('keeps raw-log purge disabled without an approved retention period', () => {
    const config = validateEnv(buildEnv());
    expect(config.ATTENDANCE_RAW_LOG_RETENTION_DAYS).toBe(0);
    expect(config.ATTENDANCE_RAW_LOG_RETENTION_PURGE_ENABLED).toBe(false);
  });

  it('rejects raw-log purge without a configured retention period', () => {
    expect(() =>
      validateEnv(
        buildEnv({ ATTENDANCE_RAW_LOG_RETENTION_PURGE_ENABLED: 'true' }),
      ),
    ).toThrow(/must be at least 1/);
  });

  it('rejects negative raw-log retention periods', () => {
    expect(() =>
      validateEnv(buildEnv({ ATTENDANCE_RAW_LOG_RETENTION_DAYS: '-1' })),
    ).toThrow(/must be 0 or greater/);
  });

  it('keeps selfie retention disabled without an approved retention period', () => {
    const config = validateEnv(buildEnv());
    expect(config.ATTENDANCE_SELFIE_RETENTION_DAYS).toBe(0);
    expect(config.ATTENDANCE_SELFIE_RETENTION_PURGE_ENABLED).toBe(false);
  });

  it('rejects selfie purge without a configured retention period', () => {
    expect(() =>
      validateEnv(
        buildEnv({ ATTENDANCE_SELFIE_RETENTION_PURGE_ENABLED: 'true' }),
      ),
    ).toThrow(/ATTENDANCE_SELFIE_RETENTION_DAYS must be at least 1/);
  });
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
          APP_ALLOWED_ORIGINS: 'http://192.168.1.30:*,http://196.41.62.162:*,',
        }),
      );

      expect(config.APP_ALLOWED_ORIGINS).toEqual([
        'http://192.168.1.30:*',
        'http://196.41.62.162:*',
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
        APP_ALLOWED_ORIGINS: 'http://192.168.1.30:*,http://196.41.62.162:*,',
      }),
    );

    expect(config.APP_ALLOWED_ORIGINS).toEqual([
      'http://192.168.1.30:*',
      'http://196.41.62.162:*',
    ]);
  });
});
