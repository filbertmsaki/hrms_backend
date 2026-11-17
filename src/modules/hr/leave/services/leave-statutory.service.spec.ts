import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  LeaveStatutoryService,
  assertFinanceReady,
} from './leave-statutory.service';

function service(env: Record<string, string> = {}) {
  const instance = Object.create(
    LeaveStatutoryService.prototype,
  ) as LeaveStatutoryService & Record<string, unknown>;
  Object.assign(instance, {
    configService: { get: (key: string) => env[key] },
  });
  return instance;
}

describe('LeaveStatutoryService.validateRuleSettings', () => {
  it('accepts a complete sick-leave rule', () => {
    expect(() =>
      service().validateRuleSettings({
        rule_type: 'sick_leave',
        leave_type_id: 3,
        settings: {
          reference_period_months: 36,
          stages: [
            { days: 63, pay_percent: 100 },
            { days: 63, pay_percent: 50 },
          ],
        },
      }),
    ).not.toThrow();
  });

  it('rejects missing values instead of inventing them', () => {
    expect(() =>
      service().validateRuleSettings({
        rule_type: 'annual_leave',
        leave_type_id: null,
        settings: {},
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service().validateRuleSettings({
        rule_type: 'sick_leave',
        leave_type_id: 3,
        settings: {
          reference_period_months: 36,
          stages: [{ days: 5, pay_percent: 150 }],
        },
      }),
    ).toThrow('pay_percent');
  });
});

describe('LeaveStatutoryService.sickPayBreakdown', () => {
  it('counts earlier sick days first, then splits this request into stages', async () => {
    const instance = service();
    const stages = [
      { days: 63, pay_percent: 100 },
      { days: 63, pay_percent: 50 },
    ];
    Object.assign(instance, {
      ruleFor: jest.fn().mockResolvedValue({
        set: { id: 9 },
        rule: { leave_type_id: 3 },
        settings: { reference_period_months: 36, stages },
      }),
      dataSource: {
        manager: {
          getRepository: () => ({
            createQueryBuilder: () => {
              const qb = {
                select: () => qb,
                where: () => qb,
                andWhere: () => qb,
                getRawOne: () => Promise.resolve({ days: '60' }),
              };
              return qb;
            },
          }),
        },
      },
    });
    const result = await instance.sickPayBreakdown(
      10,
      { id: 1, company_id: 10 },
      3,
      { id: 5, start_date: '2026-11-01', total_days: '10' },
    );
    expect(result?.bands).toEqual([
      { days: 3, pay_percent: 100 },
      { days: 7, pay_percent: 50 },
    ]);
    expect(result?.rule_set_id).toBe(9);
  });

  it('returns nothing when no rule governs the leave type', async () => {
    const instance = service();
    Object.assign(instance, { ruleFor: jest.fn().mockResolvedValue(null) });
    await expect(
      instance.sickPayBreakdown(10, { id: 1, company_id: 10 }, 3, {
        id: 5,
        start_date: '2026-11-01',
        total_days: '2',
      }),
    ).resolves.toBeNull();
  });
});

describe('LeaveStatutoryService.familyLeaveIssues', () => {
  it('limits paternity days and the window after birth', async () => {
    const instance = service();
    Object.assign(instance, {
      ruleFor: jest.fn((_c, _e, type: string) =>
        Promise.resolve(
          type === 'paternity_leave'
            ? {
                set: { id: 2, name: 'Test set' },
                rule: { leave_type_id: 8 },
                settings: { days: 3, within_days_of_birth: 7 },
              }
            : null,
        ),
      ),
    });
    const ok = await instance.familyLeaveIssues(
      10,
      { id: 1, company_id: 10 },
      8,
      {
        start_date: '2026-11-05',
        total_days: 3,
        event_date: '2026-11-01',
      },
    );
    expect(ok).toEqual([]);
    const issues = await instance.familyLeaveIssues(
      10,
      { id: 1, company_id: 10 },
      8,
      {
        start_date: '2026-11-20',
        total_days: 5,
        event_date: '2026-11-01',
      },
    );
    expect(issues.join(' ')).toContain('limited to 3 day(s)');
    expect(issues.join(' ')).toContain('within 7 day(s)');
    const missing = await instance.familyLeaveIssues(
      10,
      { id: 1, company_id: 10 },
      8,
      {
        start_date: '2026-11-05',
        total_days: 1,
      },
    );
    expect(missing.join(' ')).toContain('date of birth');
  });
});

describe('activation guard', () => {
  it('refuses unverified sets and test sets in production', async () => {
    const actor = {
      companyMembershipId: 4,
      permissions: ['leave_statutory:approve'],
    } as unknown as AuthenticatedUser;
    const makeManager = (set: Record<string, unknown>) => ({
      getRepository: () => ({
        findOne: jest.fn().mockResolvedValue(set),
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn(),
      }),
    });
    const run = (env: Record<string, string>, set: Record<string, unknown>) => {
      const instance = service(env);
      Object.assign(instance, {
        dataSource: {
          transaction: (fn: (m: unknown) => unknown) => fn(makeManager(set)),
        },
      });
      return instance.activateRuleSet(
        10,
        1,
        { effective_from: '2026-12-01' },
        actor,
      );
    };
    await expect(
      run(
        {},
        {
          id: 1,
          status: 'draft',
          verification_status: 'unverified',
          is_test_configuration: false,
        },
      ),
    ).rejects.toThrow('legal verification');
    await expect(
      run(
        { APP_ENV: 'production' },
        {
          id: 1,
          status: 'draft',
          verification_status: 'unverified',
          is_test_configuration: true,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('assertFinanceReady', () => {
  const component = (config: Record<string, unknown>, status = 'ACTIVE') =>
    ({ status, calculationConfiguration: config }) as never;

  it('needs Finance confirmation (or a test flag outside production)', () => {
    expect(() =>
      assertFinanceReady(component({ finance_verified: true }), 'X', true),
    ).not.toThrow();
    expect(() =>
      assertFinanceReady(component({ finance_verified: false }), 'X', false),
    ).toThrow(ConflictException);
    expect(() =>
      assertFinanceReady(component({ test_configuration: true }), 'X', false),
    ).not.toThrow();
    expect(() =>
      assertFinanceReady(component({ test_configuration: true }), 'X', true),
    ).toThrow('waiting for Finance');
    expect(() =>
      assertFinanceReady(
        component({ finance_verified: true }, 'INACTIVE'),
        'X',
        false,
      ),
    ).toThrow('not set up or not active');
    expect(() => assertFinanceReady(null, 'X', false)).toThrow(
      ConflictException,
    );
  });
});
