/** The legacy chain includes company-specific and unapproved policy data. */
export function assertLegacySeedChainAllowed(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const appEnv = env.APP_ENV?.trim().toLowerCase();
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase();
  const database = env.DB_NAME?.trim().toLowerCase() ?? '';
  const explicitUat =
    appEnv === 'uat' &&
    env.LEGACY_UAT_SEED_CONFIRM === 'YES' &&
    database.includes('uat') &&
    !database.includes('prod');
  if (appEnv === 'production' || (nodeEnv === 'production' && !explicitUat)) {
    throw new Error(
      'The legacy seed chain is blocked in production pending a production seeder audit and replacement.',
    );
  }
}

export function assertSecureSeederPasswords(): void {
  const requiredPasswords = [
    {
      key: 'PLATFORM_ADMIN_PASSWORD',
      value:
        process.env.PLATFORM_ADMIN_PASSWORD ??
        process.env.INITIAL_OWNER_PASSWORD,
    },
    {
      key: 'COMPANY_ADMIN_PASSWORD',
      value: process.env.COMPANY_ADMIN_PASSWORD,
    },
    {
      key: 'EMPLOYEE_IMPORT_DEFAULT_PASSWORD',
      value: process.env.EMPLOYEE_IMPORT_DEFAULT_PASSWORD,
    },
  ];

  const insecureDefaults = new Set(['Owner123!', 'Admin123!']);

  for (const item of requiredPasswords) {
    const normalized = item.value?.trim() ?? '';

    if (!normalized || insecureDefaults.has(normalized)) {
      throw new Error(
        `Seeder configuration requires a secure value for ${item.key}.`,
      );
    }
  }
}
