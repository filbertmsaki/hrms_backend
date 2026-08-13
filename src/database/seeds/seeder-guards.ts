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

  const insecureDefaults = new Set(['Owner123!', 'Admin123!', 'Employee!123']);

  for (const item of requiredPasswords) {
    const normalized = item.value?.trim() ?? '';

    if (!normalized || insecureDefaults.has(normalized)) {
      throw new Error(
        `Seeder configuration requires a secure value for ${item.key}.`,
      );
    }
  }
}
