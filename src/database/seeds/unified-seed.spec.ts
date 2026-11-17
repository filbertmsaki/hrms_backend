import { DataSource, EntityManager } from 'typeorm';
import { resolveUnifiedSeedModules, runUnifiedSeed } from './unified-seed';
import { REGISTERED_REPORT_DEFINITIONS } from '../../modules/scheduled-reporting/services/report-registry.service';

describe('unified seeding', () => {
  it('requires explicit company-specific proposals and orders workflow dependencies', () => {
    expect(
      resolveUnifiedSeedModules({ companyId: 4, modules: ['onboarding'] }),
    ).toEqual(['authorization', 'onboarding']);
    expect(() =>
      resolveUnifiedSeedModules({ companyId: 4, modules: ['attendance'] }),
    ).toThrow(/proposed-attendance/);
    expect(() =>
      resolveUnifiedSeedModules({ companyId: 4, modules: ['probation'] }),
    ).toThrow(/effective-from/);
  });
  it('orders and deduplicates selected modules', () => {
    expect(
      resolveUnifiedSeedModules({
        companyId: 42,
        modules: ['activities', 'reports', 'activities'],
      }),
    ).toEqual(['reports', 'activities']);
  });

  it('rejects an invalid selection or an unscoped company module before accessing the database', async () => {
    const transaction = jest.fn();
    const source = { transaction } as unknown as DataSource;
    await expect(
      runUnifiedSeed(source, { modules: ['activities'] }),
    ).rejects.toThrow(/company ID/i);
    await expect(
      runUnifiedSeed(source, { modules: ['bad' as never] }),
    ).rejects.toThrow(/unknown/i);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('refuses to write when another execution holds the lock', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([{ locked: false }]),
      getRepository: jest.fn(),
    };
    const source = {
      transaction: (fn: (manager: EntityManager) => unknown) =>
        fn(manager as unknown as EntityManager),
    } as DataSource;
    await expect(
      runUnifiedSeed(source, { modules: ['reports'] }),
    ).rejects.toThrow(/in progress/);
    expect(manager.getRepository).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent company before any module runs', async () => {
    const repository = { findOne: jest.fn().mockResolvedValue(null) };
    const manager = {
      query: jest.fn().mockResolvedValue([{ locked: true }]),
      getRepository: jest.fn().mockReturnValue(repository),
    };
    const source = {
      transaction: (fn: (manager: EntityManager) => unknown) =>
        fn(manager as unknown as EntityManager),
    } as DataSource;
    await expect(
      runUnifiedSeed(source, { modules: ['activities'], companyId: 42 }),
    ).rejects.toThrow(/does not exist/);
    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 42 } });
  });

  it('preserves existing report definitions and inserts only missing registrations', async () => {
    const existingCode = REGISTERED_REPORT_DEFINITIONS[0].reportCode;
    const execute = jest.fn().mockResolvedValue({});
    const values = jest.fn().mockReturnValue({ orIgnore: () => ({ execute }) });
    const repository = {
      find: jest.fn().mockResolvedValue([{ reportCode: existingCode }]),
      createQueryBuilder: () => ({
        insert: () => ({ into: () => ({ values }) }),
      }),
    };
    const manager = {
      query: jest.fn().mockResolvedValue([{ locked: true }]),
      getRepository: jest.fn().mockReturnValue(repository),
    };
    const source = {
      transaction: (fn: (manager: EntityManager) => unknown) =>
        fn(manager as unknown as EntityManager),
    } as DataSource;
    await expect(
      runUnifiedSeed(source, { modules: ['reports'] }),
    ).resolves.toEqual(['reports']);
    const inserted = values.mock.calls[0][0] as Array<{ reportCode: string }>;
    expect(inserted.map((row) => row.reportCode)).not.toContain(existingCode);
    expect(inserted).toHaveLength(REGISTERED_REPORT_DEFINITIONS.length - 1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('requests rollback after a dry run and returns the selected modules', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([{ locked: true }]),
      getRepository: jest.fn().mockReturnValue({
        find: jest.fn().mockResolvedValue(
          REGISTERED_REPORT_DEFINITIONS.map((row) => ({
            reportCode: row.reportCode,
          })),
        ),
      }),
    };
    let rolledBack = false;
    const source = {
      transaction: async (fn: (manager: EntityManager) => unknown) => {
        try {
          return await fn(manager as unknown as EntityManager);
        } catch (error) {
          rolledBack = true;
          throw error;
        }
      },
    } as DataSource;
    await expect(
      runUnifiedSeed(source, { modules: ['reports'], dryRun: true }),
    ).resolves.toEqual(['reports']);
    expect(rolledBack).toBe(true);
  });
});
