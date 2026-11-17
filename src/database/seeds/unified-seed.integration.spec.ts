import { AppDataSource } from '../data-source';
import { Company } from '../../modules/companies/entities/company.entity';
import { LeaveType } from '../../modules/hr/leave/entities/leave-type.entity';
import { AttendancePolicy } from '../../modules/hr/attendance/policies/entities/attendance-policy.entity';
import { PayrollComponent } from '../../modules/hr/payroll/entities/payroll-configuration.entities';
import { runUnifiedSeed } from './unified-seed';

const enabled = process.env.HRMS_SEED_INTEGRATION === 'YES';
const integration = enabled ? describe : describe.skip;

integration('unified seed against isolated PostgreSQL', () => {
  let first: Company;
  let second: Company;
  const settings = {
    employeeNumber: { prefix: 'AICL', padding: 3, nextNumber: 1 },
    proposedAttendance: true,
    probationEffectiveFrom: '2026-11-17',
  };
  beforeAll(async () => {
    if (
      process.env.DB_HOST !== '127.0.0.1' ||
      process.env.DB_PORT !== '55489' ||
      process.env.DB_NAME !== 'hrms_seed_isolated'
    )
      throw new Error(
        'Integration test requires the dedicated local test database.',
      );
    await AppDataSource.initialize();
    const companies = AppDataSource.getRepository(Company);
    first = await companies.save(
      companies.create({
        name: 'Seeder isolation A',
        slug: `seeder-a-${Date.now()}`,
        status: 'active',
        metadata: null,
      }),
    );
    second = await companies.save(
      companies.create({
        name: 'Seeder isolation B',
        slug: `seeder-b-${Date.now()}`,
        status: 'active',
        metadata: null,
      }),
    );
  }, 120000);
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('initializes, repeats without duplicates, preserves settings and isolates companies', async () => {
    await runUnifiedSeed(AppDataSource, { companyId: first.id, ...settings });
    const leave = AppDataSource.getRepository(LeaveType);
    const payroll = AppDataSource.getRepository(PayrollComponent);
    const initial = await leave.find({ where: { company_id: first.id } });
    expect(initial.length).toBeGreaterThan(0);
    expect(initial.every((row) => row.status === 'inactive')).toBe(true);
    expect(
      await payroll.countBy({ companyId: first.id, status: 'ACTIVE' }),
    ).toBe(0);
    await leave.update(
      { id: initial[0].id },
      { name: 'Company approved custom name' },
    );
    await runUnifiedSeed(AppDataSource, { companyId: first.id, ...settings });
    expect(await leave.countBy({ company_id: first.id })).toBe(initial.length);
    expect((await leave.findOneByOrFail({ id: initial[0].id })).name).toBe(
      'Company approved custom name',
    );
    expect(await leave.countBy({ company_id: second.id })).toBe(0);
    expect(
      await AppDataSource.getRepository(AttendancePolicy).countBy({
        company_id: first.id,
        is_active: true,
      }),
    ).toBe(0);
    const history = (await AppDataSource.query(
      'SELECT outcome, seed_version FROM unified_seed_execution_history WHERE company_id = $1 ORDER BY id',
      [first.id],
    )) as Array<{ outcome: string; seed_version: string }>;
    expect(history).toHaveLength(2);
    expect(
      history.every(
        (row) => row.outcome === 'COMPLETED' && row.seed_version === '1.0.0',
      ),
    ).toBe(true);
  }, 120000);

  it('rolls back dry-run writes and rejects a concurrent lock holder', async () => {
    await runUnifiedSeed(AppDataSource, {
      companyId: second.id,
      ...settings,
      dryRun: true,
    });
    expect(
      await AppDataSource.getRepository(LeaveType).countBy({
        company_id: second.id,
      }),
    ).toBe(0);
    const dryRunHistory = (await AppDataSource.query(
      'SELECT id FROM unified_seed_execution_history WHERE company_id = $1',
      [second.id],
    )) as unknown[];
    expect(dryRunHistory).toHaveLength(0);
    const qr = AppDataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query('SELECT pg_advisory_xact_lock($1, $2)', [1213353299, 1]);
      await expect(
        runUnifiedSeed(AppDataSource, { companyId: second.id, ...settings }),
      ).rejects.toThrow(/in progress/);
    } finally {
      await qr.rollbackTransaction();
      await qr.release();
    }
    const history = (await AppDataSource.query(
      'SELECT outcome FROM unified_seed_execution_history WHERE company_id = $1',
      [second.id],
    )) as Array<{ outcome: string }>;
    expect(history.map((row) => row.outcome)).toEqual(['FAILED']);
  }, 120000);
});
