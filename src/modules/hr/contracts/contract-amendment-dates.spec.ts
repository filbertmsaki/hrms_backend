import { EmploymentContractsService } from './employment-contracts.service';
import {
  EmploymentContractStatus,
  EmploymentContractType,
} from './entities/employment-contract.entity';

describe('amendment dates', () => {
  it('uses the hire date for a new contract even if another date is supplied', async () => {
    const transaction = jest.fn().mockResolvedValue({});
    const service = Object.assign(Object.create(EmploymentContractsService.prototype), {
      access: { ensureActorCompanyId: () => 1, assertCanAccessEmployee: jest.fn() },
      employees: { findOne: jest.fn().mockResolvedValue({ id: 13, hire_date: '2026-11-01' }) },
      dataSource: { transaction },
    }) as EmploymentContractsService;
    const validate = jest.spyOn(service as never, 'validateDates' as never);
    await service.createDraft({ permissions: [] } as never, { employee_id: 13, contract_type: EmploymentContractType.UNSPECIFIED, start_date: '2026-11-09' });
    expect(validate).toHaveBeenCalledWith(EmploymentContractType.UNSPECIFIED, '2026-11-01', null);
  });
  it('preserves existing dates unless HR explicitly changes them', async () => {
    const source = {
      id: 4,
      employeeId: 13,
      status: EmploymentContractStatus.SIGNED,
      contractType: EmploymentContractType.UNSPECIFIED,
      startDate: '2026-11-09',
      endDate: '2027-11-08',
    };
    const createDraft = jest.fn().mockResolvedValue({ id: 5 });
    const service = Object.assign(
      Object.create(EmploymentContractsService.prototype),
      {
        access: { ensureActorCompanyId: () => 1 },
        contracts: {
          findOneBy: jest.fn().mockResolvedValue(source),
          update: jest.fn(),
          findOneByOrFail: jest.fn().mockResolvedValue({ id: 5 }),
        },
        history: { record: jest.fn() },
        createDraft,
      },
    ) as EmploymentContractsService;
    const actor = { companyMembershipId: 1 } as never;
    await service.renewOrAmend(actor, 4, {
      kind: 'AMENDMENT',
      reason: 'Correct date',
    });
    expect(createDraft).toHaveBeenLastCalledWith(
      actor,
      expect.objectContaining({
        start_date: '2026-11-09',
        end_date: '2027-11-08',
      }),
    );
    await service.renewOrAmend(actor, 4, {
      kind: 'AMENDMENT',
      reason: 'Correct date',
      start_date: '2026-11-01',
      end_date: null,
    });
    expect(createDraft).toHaveBeenLastCalledWith(
      actor,
      expect.objectContaining({
        start_date: '2026-11-01',
        end_date: undefined,
      }),
    );
  });
});
