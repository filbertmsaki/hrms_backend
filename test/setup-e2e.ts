jest.setTimeout(60000);

beforeAll(() => {
  const databaseName = process.env.DB_NAME ?? '';

  const isAllowedDedicatedName =
    databaseName === 'hrms_test' || databaseName === 'hrms_migration_test';

  if (
    !isAllowedDedicatedName &&
    !databaseName.endsWith('_test_db') &&
    !databaseName.endsWith('_e2e')
  ) {
    throw new Error(
      `E2E tests require a dedicated test database (ending with "_test_db" or "_e2e"). Current database: ${databaseName}`,
    );
  }
});
