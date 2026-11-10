import { EmploymentEventTypeEnum } from '../employment-history/enums/employment-event-type.enum';
import { ContractExitService } from './contract-exit.service';
import { EmploymentContractStatus as S } from './entities/employment-contract.entity';

function build(contracts: Array<{ id: number; status: S }>) {
  const rows = contracts.map((row) => ({
    ...row,
    referenceNo: `EC-2026-0000${row.id}`,
    version: row.id,
    cancelledAt: null as Date | null,
    cancelReason: null as string | null,
  }));
  const qb: Record<string, jest.Mock> = {};
  for (const method of ['update', 'set', 'where'])
    qb[method] = jest.fn(() => qb);
  qb.execute = jest.fn();
  const repository = {
    find: jest.fn().mockResolvedValue(rows),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
    createQueryBuilder: jest.fn(() => qb),
  };
  const manager = { getRepository: jest.fn(() => repository) };
  const history = { record: jest.fn() };
  const service = new ContractExitService(history as never);
  return { service, manager, history, rows, qb };
}

const input = {
  companyId: 10,
  employeeId: 5,
  exitDate: '2020-01-31',
  reason: 'Resignation',
  source: 'offboarding' as const,
  sourceEntityId: 300,
  actorCompanyUserId: 99,
};

describe('ContractExitService.endContractsForExit', () => {
  it('terminates the signed contract and cancels unsigned ones', async () => {
    const { service, manager, history, rows, qb } = build([
      { id: 1, status: S.SIGNED },
      { id: 2, status: S.PENDING_EMPLOYEE_SIGNATURE },
    ]);

    const result = await service.endContractsForExit(manager as never, input);

    expect(rows[0].status).toBe(S.TERMINATED);
    expect(rows[1].status).toBe(S.CANCELLED);
    expect(rows[1].cancelReason).toContain('Employee exited');
    expect(result).toEqual({
      terminated_contract_ids: [1],
      scheduled_contract_ids: [],
      cancelled_contract_ids: [2],
    });
    expect(rows[0]).toEqual(
      expect.objectContaining({
        endedAt: '2020-01-31',
        offboardingRequestId: 300,
      }),
    );
    expect(history.record).toHaveBeenCalledTimes(2);
    expect(history.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: EmploymentEventTypeEnum.CONTRACT_ENDED,
        effectiveDate: '2020-01-31',
      }),
      manager,
    );
    // Pending signing codes of cancelled contracts are invalidated.
    expect(qb.execute).toHaveBeenCalled();
  });

  it('schedules the end of a signed contract when the exit date is in the future', async () => {
    const { service, manager, rows } = build([{ id: 1, status: S.SIGNED }]);

    const result = await service.endContractsForExit(manager as never, {
      ...input,
      exitDate: '2999-12-31',
    });

    expect(rows[0].status).toBe(S.SIGNED);
    expect(rows[0]).toEqual(expect.objectContaining({ endedAt: '2999-12-31' }));
    expect(result.scheduled_contract_ids).toEqual([1]);
  });

  it('does nothing when the employee has no live contract', async () => {
    const { service, manager, history, qb } = build([]);

    await service.endContractsForExit(manager as never, input);

    expect(history.record).not.toHaveBeenCalled();
    expect(qb.execute).not.toHaveBeenCalled();
  });
});
