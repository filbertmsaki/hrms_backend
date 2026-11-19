/**
 * Dropping the schema destroys all data. In production it requires
 * DB_RESET_CONFIRM to equal the target DB_NAME.
 */
export function assertSchemaResetAllowed(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const appEnv = env.APP_ENV?.trim().toLowerCase();
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase();
  const database = env.DB_NAME?.trim().toLowerCase() ?? '';
  const production = appEnv === 'production' || nodeEnv === 'production';
  if (!production) return;
  if (database && env.DB_RESET_CONFIRM?.trim().toLowerCase() === database) {
    return;
  }
  throw new Error(
    'Refusing to drop the database schema in production. Set DB_RESET_CONFIRM ' +
      'to the target DB_NAME to confirm that all data will be deleted.',
  );
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
