import { PayrollRecoveryService } from './payroll-recovery.service';
import {
  PayrollRecoveryLegalBasisEnum,
  PayrollRecoveryMethodEnum,
  PayrollRecoveryStatusEnum,
} from '../entities/payroll-recovery.entities';
import { PayrollRunStatusEnum } from '../payroll.enums';

const actor = { id: 9, companyMembershipId: 9 } as any;

function build(options: {
  run?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  recoveries?: Array<Record<string, unknown>>;
  lines?: Array<Record<string, unknown>>;
  pendingCents?: bigint;
}) {
  const recoveries = options.recoveries ?? [];
  const entries: any[] = [];
  const audits: any[] = [];
  const recoveryRepository: any = {
    create: (value: any) => value,
    save: jest.fn(async (value: any) => ({ id: value.id ?? 1, ...value })),
    find: jest.fn(async () => recoveries),
    findOne: jest.fn(
      async ({ where }: any) =>
        recoveries.find((item) => item.id === where.id) ?? null,
    ),
    manager: {
      transaction: async (fn: any) =>
        fn({
          getRepository: (entity: any) =>
            entity.name === 'PayrollOverpaymentRecovery'
              ? {
                  createQueryBuilder: () => ({
                    setLock() {
                      return this;
                    },
                    where() {
                      return this;
                    },
                    getOne: async () => recoveries[0],
                  }),
                  save: async (value: any) => value,
                }
              : entity.name === 'PayrollOverpaymentRecoveryEntry'
                ? {
                    save: async (value: any) => {
                      entries.push(value);
                      return { id: entries.length, ...value };
                    },
                    findOne: async ({ where }: any) =>
                      entries.find(
                        (item) => item.idempotencyKey === where.idempotencyKey,
                      ) ?? null,
                  }
                : {
                    create: (value: any) => value,
                    save: async (value: any) => audits.push(value),
                  },
        }),
    },
  };
  const service = new PayrollRecoveryService(
    { ensureActorCompanyId: () => 1 } as any,
    recoveryRepository,
    {
      findOne: async ({ where }: any) =>
        entries.find((item) => item.idempotencyKey === where.idempotencyKey) ??
        null,
    } as any,
    { findOne: async () => options.run ?? null } as any,
    { findOne: async () => options.result ?? null } as any,
    { find: async () => options.lines ?? [] } as any,
    { create: (v: any) => v, save: async (v: any) => audits.push(v) } as any,
  );
  jest
    .spyOn(service as any, 'pendingDeductionCents')
    .mockResolvedValue(options.pendingCents ?? 0n);
  return { service, entries, audits, recoveryRepository };
}

const createDto = {
  employee_id: 11,
  original_payroll_run_id: 5,
  overpaid_amount: '300000.00',
  method: PayrollRecoveryMethodEnum.INSTALLMENTS,
  installment_amount: '100000.00',
  legal_basis: PayrollRecoveryLegalBasisEnum.EMPLOYEE_CONSENT,
  consent_reference: 'Consent form 2026-11-20',
  reason: 'Duplicate allowance paid in October',
};

describe('PayrollRecoveryService', () => {
  const paidRun = { id: 5, status: PayrollRunStatusEnum.PAID };

  it('creates a pending recovery for an employee paid in a paid run', async () => {
    const { service } = build({ run: paidRun, result: { id: 50 } });
    const recovery = await service.create(actor, createDto);
    expect(recovery).toMatchObject({
      status: PayrollRecoveryStatusEnum.PENDING_APPROVAL,
      installmentAmount: '100000.00',
    });
  });

  it('refuses salary deductions without a documented legal basis', async () => {
    const { service } = build({ run: paidRun, result: { id: 50 } });
    await expect(
      service.create(actor, { ...createDto, consent_reference: '' }),
    ).rejects.toThrow('consent, agreement or order reference');
    await expect(
      service.create(actor, {
        ...createDto,
        legal_basis: PayrollRecoveryLegalBasisEnum.NOT_APPLICABLE,
      }),
    ).rejects.toThrow('require a legal basis');
  });

  it('only applies to paid payroll', async () => {
    const { service } = build({
      run: { id: 5, status: PayrollRunStatusEnum.LOCKED },
      result: { id: 50 },
    });
    await expect(service.create(actor, createDto)).rejects.toThrow(
      'paid payroll only',
    );
  });

  it('requires an independent approver', async () => {
    const { service } = build({
      recoveries: [
        {
          id: 1,
          status: PayrollRecoveryStatusEnum.PENDING_APPROVAL,
          createdByCompanyUserId: 9,
        },
      ],
    });
    await expect(service.decide(actor, 1, 'APPROVE')).rejects.toThrow(
      'independent approver',
    );
  });

  it('plans the next instalment net of deductions pending in other runs', async () => {
    const { service } = build({
      recoveries: [
        {
          id: 1,
          status: PayrollRecoveryStatusEnum.ACTIVE,
          method: PayrollRecoveryMethodEnum.INSTALLMENTS,
          overpaidAmount: '300000.00',
          recoveredAmount: '250000.00',
          installmentAmount: '100000.00',
        },
      ],
    });
    const planned = await service.plannedDeductions(1, 11, 7);
    expect(planned[0].amount).toBe('50000.00');
  });

  it('books a paid recovery deduction once and settles the balance', async () => {
    const recovery = {
      id: 1,
      status: PayrollRecoveryStatusEnum.ACTIVE,
      method: PayrollRecoveryMethodEnum.NEXT_PAYROLL,
      overpaidAmount: '100.00',
      recoveredAmount: '0.00',
    };
    const { service, entries } = build({
      recoveries: [recovery],
      result: { id: 77 },
      lines: [{ amount: '100.00', sourceReference: '1' }],
    });
    expect(await service.postForPaidPayrollResult(1, 7, 11)).toBe(1);
    expect(await service.postForPaidPayrollResult(1, 7, 11)).toBe(0);
    expect(entries).toHaveLength(1);
    expect(recovery.status).toBe(PayrollRecoveryStatusEnum.SETTLED);
  });

  it('records a refund only within the open balance and with evidence', async () => {
    const recovery = {
      id: 1,
      status: PayrollRecoveryStatusEnum.ACTIVE,
      method: PayrollRecoveryMethodEnum.REFUND,
      overpaidAmount: '100.00',
      recoveredAmount: '0.00',
    };
    const { service } = build({ recoveries: [recovery] });
    await expect(
      service.recordRefund(actor, 1, {
        amount: '150.00',
        reference: 'RCPT-1',
        evidence: 'Bank deposit slip',
      }),
    ).rejects.toThrow('exceeds the open balance');
    await expect(
      service.recordRefund(actor, 1, {
        amount: '40.00',
        reference: 'RCPT-1',
        evidence: '',
      }),
    ).rejects.toThrow('reference and supporting evidence');
    await service.recordRefund(actor, 1, {
      amount: '100.00',
      reference: 'RCPT-1',
      evidence: 'Bank deposit slip',
    });
    expect(recovery.status).toBe(PayrollRecoveryStatusEnum.SETTLED);
  });
});
