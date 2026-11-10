import { ConflictException } from '@nestjs/common';
import { EmployeeMovementTypeEnum } from '../employee-movements/enums/employee-movement-type.enum';
import { ContractMovementListener } from './contract-movement.listener';
import { ContractPayrollWarningsService } from './contract-payroll-warnings.service';
import { expiryWindow } from './contract-reminders.service';
import {
  CONTRACT_TOKENS,
  defaultContractSections,
  renderSections,
  tokensIn,
} from './contract-templates.service';
import {
  EmploymentContractStatus,
  EmploymentContractType,
} from './entities/employment-contract.entity';

describe('contract templates', () => {
  it.each(Object.values(EmploymentContractType))(
    'default %s clauses only use known fields',
    (type) => {
      for (const section of defaultContractSections(type)) {
        for (const token of tokensIn(section.body)) {
          expect(CONTRACT_TOKENS).toContain(token);
        }
      }
    },
  );

  it('fills fields and reports the missing ones', () => {
    const { sections, missing } = renderSections(
      [{ id: 'a', heading: 'Pay', body: '{{currency}} {{salary}}' }],
      { currency: 'TZS' },
    );
    expect(sections[0].body).toBe('TZS [salary]');
    expect(missing).toEqual(['salary']);
  });
});

describe('expiry alert windows', () => {
  it.each([
    [61, null],
    [60, 60],
    [31, 60],
    [30, 30],
    [8, 30],
    [7, 7],
    [1, 7],
    [0, 0],
    [-1, null],
  ])('%i days left → window %s', (days, window) => {
    expect(expiryWindow(days)).toBe(window);
  });
});

describe('ContractPayrollWarningsService', () => {
  function build(contracts: unknown[], acknowledgement: unknown = null) {
    const qb = (rows: unknown[]) => {
      const builder: Record<string, jest.Mock> = {};
      for (const method of ['where', 'andWhere', 'orderBy'])
        builder[method] = jest.fn(() => builder);
      builder.getMany = jest.fn().mockResolvedValue(rows);
      return builder;
    };
    const saved: unknown[] = [];
    const repositories: Record<string, unknown> = {
      PayrollRun: {
        findOneBy: jest.fn().mockResolvedValue({ id: 7, payrollPeriodId: 3 }),
      },
      PayrollPeriod: {
        findOneByOrFail: jest
          .fn()
          .mockResolvedValue({ id: 3, endDate: '2026-11-30' }),
      },
      EmployeePayrollResult: {
        find: jest
          .fn()
          .mockResolvedValue([
            { employeeId: 1 },
            { employeeId: 2 },
            { employeeId: 3 },
          ]),
      },
      Employee: {
        createQueryBuilder: jest.fn(() =>
          qb([
            { id: 1, first_name: 'A', last_name: 'One', employee_no: '1' },
            { id: 2, first_name: 'B', last_name: 'Two', employee_no: '2' },
            { id: 3, first_name: 'C', last_name: 'Three', employee_no: '3' },
          ]),
        ),
      },
      EmploymentContract: { createQueryBuilder: jest.fn(() => qb(contracts)) },
      PayrollAuditLog: {
        findOne: jest.fn().mockResolvedValue(acknowledgement),
        create: jest.fn((value: unknown) => value),
        save: jest.fn((value: unknown) => {
          saved.push(value);
          return Promise.resolve(value);
        }),
      },
    };
    const dataSource = {
      getRepository: jest.fn(
        (entity: { name: string }) => repositories[entity.name],
      ),
    };
    return {
      service: new ContractPayrollWarningsService(dataSource as never),
      saved,
    };
  }

  const contracts = [
    // employee 1: no contract
    {
      id: 10,
      employeeId: 2,
      referenceNo: 'EC-2',
      endDate: '2026-11-15',
      status: EmploymentContractStatus.SIGNED,
    },
    {
      id: 11,
      employeeId: 3,
      referenceNo: 'EC-3',
      endDate: '2026-12-20',
      status: EmploymentContractStatus.SIGNED,
    },
  ];

  it('lists missing, expired and expiring contracts without blocking pay', async () => {
    const { service } = build(contracts);
    const result = await service.warnings(10, 7);
    expect(result.warnings.map((w) => [w.employee_id, w.code])).toEqual([
      [1, 'NO_SIGNED_CONTRACT'],
      [2, 'CONTRACT_EXPIRED'],
      [3, 'CONTRACT_EXPIRING'],
    ]);
    expect(result.acknowledged).toBe(false);
    await expect(service.assertAcknowledged(10, 7)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('accepts an acknowledgement of exactly the current warnings', async () => {
    const first = build(contracts);
    const { warnings_hash } = await first.service.warnings(10, 7);
    await expect(
      first.service.acknowledge(
        { companyMembershipId: 4 } as never,
        10,
        7,
        'a'.repeat(64),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await first.service.acknowledge(
      { companyMembershipId: 4 } as never,
      10,
      7,
      warnings_hash,
    );
    expect(first.saved).toHaveLength(1);

    const acknowledged = build(contracts, {
      summary: { warnings_hash },
      createdAt: new Date(),
      actorCompanyUserId: 4,
    });
    await expect(
      acknowledged.service.assertAcknowledged(10, 7),
    ).resolves.toBeUndefined();
  });
});

describe('ContractMovementListener', () => {
  function build(movementType: string, contract: unknown) {
    const repositories: Record<string, unknown> = {
      EmployeeMovement: {
        findOneBy: jest
          .fn()
          .mockResolvedValue({ id: 5, employeeId: 9, movementType }),
      },
      EmploymentContract: { findOne: jest.fn().mockResolvedValue(contract) },
    };
    const notifier = { notify: jest.fn().mockResolvedValue(true) };
    const listener = new ContractMovementListener(
      {
        getRepository: (entity: { name: string }) => repositories[entity.name],
      } as never,
      notifier as never,
    );
    return { listener, notifier };
  }

  it('suggests an amendment to HR after a promotion', async () => {
    const { listener, notifier } = build(EmployeeMovementTypeEnum.PROMOTION, {
      id: 30,
      referenceNo: 'EC-30',
      issuedByCompanyUserId: 4,
    });
    await expect(listener.suggestAmendment(10, 5)).resolves.toBe(true);
    expect(notifier.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverCompanyUserId: 4,
        title: 'Contract amendment suggested',
        actionUrl: '/dashboard/employees/contracts/30?amend_movement=5',
      }),
    );
  });

  it('ignores movements that do not change contract terms', async () => {
    const { listener, notifier } = build(
      EmployeeMovementTypeEnum.COST_CENTER_CHANGE,
      { id: 30, issuedByCompanyUserId: 4 },
    );
    await expect(listener.suggestAmendment(10, 5)).resolves.toBe(false);
    expect(notifier.notify).not.toHaveBeenCalled();
  });
});
