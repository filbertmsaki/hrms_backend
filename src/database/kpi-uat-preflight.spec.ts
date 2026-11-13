import {
  assessKpiUatMigrationState,
  KPI_RELEASE_MIGRATIONS,
  KPI_RELEASE_TABLES,
  KPI_RELEASE_TRIGGERS,
} from './kpi-uat-preflight';

const discovered = KPI_RELEASE_MIGRATIONS.map(([, name]) => name);
const baseTables = ['companies', 'employees', 'company_users'];
const ledger = KPI_RELEASE_MIGRATIONS.map(([timestamp, name]) => ({
  timestamp,
  name,
}));

describe('KPI UAT read-only migration preflight', () => {
  it('allows a reviewed first upgrade only when release objects are absent', () => {
    expect(
      assessKpiUatMigrationState({
        discovered,
        baseTables,
        ledger: [],
        tables: [],
        triggers: [],
      }),
    ).toBe('pending');
    expect(() =>
      assessKpiUatMigrationState({
        discovered,
        baseTables,
        ledger: [],
        tables: [KPI_RELEASE_TABLES[0]],
        triggers: [],
      }),
    ).toThrow('already exist');
  });

  it('allows an already applied release with all expected objects', () => {
    expect(
      assessKpiUatMigrationState({
        discovered,
        baseTables,
        ledger,
        tables: [...KPI_RELEASE_TABLES],
        triggers: [...KPI_RELEASE_TRIGGERS],
      }),
    ).toBe('applied');
  });

  it('blocks unregistered, partial, conflicting, or incomplete migration states', () => {
    expect(() =>
      assessKpiUatMigrationState({
        discovered: [],
        baseTables,
        ledger: [],
        tables: [],
        triggers: [],
      }),
    ).toThrow('normal TypeORM discovery');
    expect(() =>
      assessKpiUatMigrationState({
        discovered,
        baseTables,
        ledger: ledger.slice(0, 1),
        tables: [],
        triggers: [],
      }),
    ).toThrow('partly applied');
    expect(() =>
      assessKpiUatMigrationState({
        discovered,
        baseTables,
        ledger: [
          {
            timestamp: ledger[0].timestamp,
            name: 'OtherMigration1797100000000',
          },
        ],
        tables: [],
        triggers: [],
      }),
    ).toThrow('identifier is already used');
    expect(() =>
      assessKpiUatMigrationState({
        discovered,
        baseTables,
        ledger,
        tables: KPI_RELEASE_TABLES.slice(1),
        triggers: [...KPI_RELEASE_TRIGGERS],
      }),
    ).toThrow('does not match');
    expect(() =>
      assessKpiUatMigrationState({
        discovered,
        baseTables: ['companies', 'employees'],
        ledger: [],
        tables: [],
        triggers: [],
      }),
    ).toThrow('Required HRMS');
  });
});
