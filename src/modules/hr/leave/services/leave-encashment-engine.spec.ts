import { BadRequestException } from '@nestjs/common';
import { LeaveEncashmentCalculatorService } from './leave-encashment-calculator.service';
import { LeaveEncashmentPaymentSyncService } from './leave-encashment-payment-sync.service';

function qbReturning(value: unknown) {
  const qb = {
    where: () => qb,
    andWhere: () => qb,
    orderBy: () => qb,
    addOrderBy: () => qb,
    getOne: () => Promise.resolve(value),
  };
  return qb;
}

function calculator(
  compensation: unknown,
  profile: unknown = { currency: 'TZS' },
) {
  const instance = Object.create(
    LeaveEncashmentCalculatorService.prototype,
  ) as LeaveEncashmentCalculatorService;
  Object.assign(instance, {
    dataSource: {
      manager: {
        getRepository: (entity: { name?: string }) =>
          entity.name === 'EmployeeCompensationVersion'
            ? { createQueryBuilder: () => qbReturning(compensation) }
            : { findOne: () => Promise.resolve(profile) },
      },
    },
  });
  return instance;
}

describe('LeaveEncashmentCalculatorService', () => {
  const compensation = {
    id: 3,
    baseSalary: '2600000.00',
    currency: 'TZS',
    componentOverrides: {
      HOUSING: { amount: '520000' },
      OLD: { amount: '100000', excluded: true },
    },
  };

  it('prices days from basic salary ÷ divisor', async () => {
    const result = await calculator(compensation).calculate({
      companyId: 1,
      employeeId: 2,
      policyType: {
        encashment_rate_divisor: '26',
        encashment_salary_basis: 'basic',
      },
      days: 3,
      asOf: '2026-12-31',
    });
    expect(result).toMatchObject({
      salary_basis: 'basic',
      salary_amount: 2600000,
      daily_rate: 100000,
      amount: 300000,
      currency: 'TZS',
    });
  });

  it('adds non-excluded recurring components for a gross basis', async () => {
    const result = await calculator(compensation).calculate({
      companyId: 1,
      employeeId: 2,
      policyType: {
        encashment_rate_divisor: '26',
        encashment_salary_basis: 'gross',
      },
      days: 1,
      asOf: '2026-12-31',
    });
    expect(result.salary_amount).toBe(3120000);
    expect(result.amount).toBe(120000);
  });

  it('refuses to guess a missing divisor or salary', async () => {
    await expect(
      calculator(compensation).calculate({
        companyId: 1,
        employeeId: 2,
        policyType: {
          encashment_rate_divisor: null,
          encashment_salary_basis: 'basic',
        },
        days: 1,
        asOf: '2026-12-31',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      calculator(null).calculate({
        companyId: 1,
        employeeId: 2,
        policyType: {
          encashment_rate_divisor: '26',
          encashment_salary_basis: 'basic',
        },
        days: 1,
        asOf: '2026-12-31',
      }),
    ).rejects.toThrow('No effective compensation');
  });
});

describe('LeaveEncashmentPaymentSyncService.syncOne', () => {
  function setup(
    run: { status: string } | null,
    result: { status: string } | null,
  ) {
    const update = jest.fn();
    const log = jest.fn();
    const instance = Object.create(
      LeaveEncashmentPaymentSyncService.prototype,
    ) as LeaveEncashmentPaymentSyncService;
    const repos: Record<string, unknown> = {
      EmployeePayrollLineItem: {
        find: () =>
          Promise.resolve(
            run
              ? [
                  {
                    id: 1,
                    payrollRunId: 50,
                    employeePayrollResultId: 60,
                    amount: '300000.00',
                  },
                ]
              : [],
          ),
      },
      PayrollRun: {
        find: () => Promise.resolve(run ? [{ id: 50, ...run }] : []),
      },
      EmployeePayrollResult: {
        find: () => Promise.resolve(result ? [{ id: 60, ...result }] : []),
      },
      LeaveEncashmentRequest: { update },
    };
    Object.assign(instance, {
      dataSource: {
        getRepository: (entity: { name: string }) => repos[entity.name],
      },
      leaveAuditService: { log },
    });
    return { instance, update, log };
  }
  const item = (payment: string, via: string | null = null) =>
    ({
      id: 7,
      company_id: 1,
      payment_status: payment,
      payment_confirmed_via: via,
      payroll_run_id: 50,
    }) as never;

  it('stays IN_PAYROLL until the payroll run is paid', async () => {
    const { instance, update } = setup(
      { status: 'APPROVED' },
      { status: 'APPROVED' },
    );
    await expect(instance.syncOne(item('IN_PAYROLL'))).resolves.toBe(
      'unchanged',
    );
    expect(update).toHaveBeenCalledWith(
      { id: 7 },
      expect.not.objectContaining({ payment_status: 'PAID' }),
    );
  });

  it('marks PAID from a paid run, with the run reference', async () => {
    const { instance, update, log } = setup(
      { status: 'PAID' },
      { status: 'PAID' },
    );
    await expect(instance.syncOne(item('IN_PAYROLL'))).resolves.toBe('paid');
    expect(update).toHaveBeenCalledWith(
      { id: 7 },
      expect.objectContaining({
        payment_status: 'PAID',
        payment_confirmed_via: 'payroll',
        payment_reference: 'payroll-run:50',
      }),
    );
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'leave_encashment.paid_by_payroll' }),
    );
  });

  it('marks REVERSED when payroll reverses a payroll-confirmed payment', async () => {
    const { instance, update } = setup(
      { status: 'REVERSED' },
      { status: 'REVERSED' },
    );
    await expect(instance.syncOne(item('PAID', 'payroll'))).resolves.toBe(
      'reversed',
    );
    expect(update).toHaveBeenCalledWith(
      { id: 7 },
      expect.objectContaining({ payment_status: 'REVERSED' }),
    );
  });

  it('does not touch manually recorded payments', async () => {
    const { instance } = setup({ status: 'REVERSED' }, { status: 'REVERSED' });
    await expect(instance.syncOne(item('PAID', 'manual'))).resolves.toBe(
      'unchanged',
    );
  });
});
