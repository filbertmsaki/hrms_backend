import { AppDataSource } from '../data-source';

const DEMO_SLUG = 'hrms-payroll-demo';
type QueryRow = Record<string, unknown>;

async function queryRows<T extends QueryRow>(
  query: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await query.query(sql, params)) as T[];
}

async function run() {
  if (process.env.PAYROLL_DEMO_RESET_CONFIRM !== 'YES') {
    throw new Error(
      'Set PAYROLL_DEMO_RESET_CONFIRM=YES to delete the isolated payroll demo tenant.',
    );
  }
  await AppDataSource.initialize();
  const query = AppDataSource.createQueryRunner();
  await query.connect();
  await query.startTransaction();
  try {
    const companies = await queryRows<{
      id: number;
      metadata: Record<string, unknown> | null;
    }>(query, 'SELECT id, metadata FROM companies WHERE slug = $1 FOR UPDATE', [
      DEMO_SLUG,
    ]);
    if (companies.length === 0) {
      await query.commitTransaction();
      console.log(
        '[PayrollDemoReset] Demo tenant does not exist; nothing to remove.',
      );
      return;
    }
    const metadata = companies[0].metadata ?? {};
    if (
      metadata.demo !== true ||
      metadata.demo_module !== 'payroll' ||
      metadata.resettable !== true
    ) {
      throw new Error(
        'Refusing reset: target is not explicitly marked as a resettable payroll demo tenant.',
      );
    }
    const companyId = Number(companies[0].id);
    const userIds = await queryRows<{ id: number }>(
      query,
      `SELECT u.id FROM users u JOIN company_users cu ON cu.user_id = u.id
       WHERE cu.company_id = $1 AND u.email LIKE 'payroll.%@demo.invalid'`,
      [companyId],
    );
    await query.query('DELETE FROM companies WHERE id = $1', [companyId]);
    for (const user of userIds) {
      await query.query(
        "DELETE FROM users WHERE id = $1 AND email LIKE 'payroll.%@demo.invalid'",
        [user.id],
      );
    }
    await query.query(
      "DELETE FROM roles WHERE company_id = $1 AND name LIKE 'PAYROLL_DEMO_%'",
      [companyId],
    );
    await query.commitTransaction();
    console.log(
      `[PayrollDemoReset] Removed explicitly marked demo tenant ${companyId} and ${userIds.length} synthetic users.`,
    );
  } catch (error) {
    await query.rollbackTransaction();
    throw error;
  } finally {
    await query.release();
    await AppDataSource.destroy();
  }
}

void run().catch((error: unknown) => {
  console.error(
    '[PayrollDemoReset] Failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
