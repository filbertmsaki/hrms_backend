import { ConflictException } from '@nestjs/common';
import { EmploymentContractsService } from './employment-contracts.service';
import {
  EmploymentContract,
  EmploymentContractStatus,
} from './entities/employment-contract.entity';
import { Document } from '../documents/entities/document.entity';

describe('delete draft contract', () => {
  function setup(status: EmploymentContractStatus, sentAt: Date | null = null) {
    const contracts = { delete: jest.fn().mockResolvedValue({ affected: 1 }) };
    const documents = { find: jest.fn().mockResolvedValue([{ id: 11 }]) };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === EmploymentContract
          ? contracts
          : entity === Document
            ? documents
            : null,
      ),
      query: jest.fn().mockResolvedValue([]),
    };
    const purgeForEntity = jest.fn().mockResolvedValue(1);
    const service = Object.assign(
      Object.create(EmploymentContractsService.prototype),
      {
        dataSource: {
          transaction: (fn: (manager: unknown) => unknown) => fn(manager),
        },
        documents: { purgeForEntity },
        loadForManage: jest.fn().mockResolvedValue({
          companyId: 7,
          contract: { id: 12, status, sentAt },
        }),
      },
    ) as EmploymentContractsService;
    return { service, contracts, manager, purgeForEntity };
  }
  it('removes the scoped draft and its files', async () => {
    const { service, contracts, manager, purgeForEntity } = setup(
      EmploymentContractStatus.DRAFT,
    );
    await expect(service.deleteDraft({} as never, 12)).resolves.toEqual({
      deleted: true,
    });
    expect(contracts.delete).toHaveBeenCalledWith({ id: 12, companyId: 7 });
    expect(purgeForEntity).toHaveBeenCalledWith(7, 'CONTRACT', 12, manager);
  });
  it.each([
    [EmploymentContractStatus.SIGNED, null],
    [EmploymentContractStatus.DRAFT, new Date()],
  ])('rejects a signed or previously sent contract', async (status, sentAt) => {
    const { service, contracts, purgeForEntity } = setup(status, sentAt);
    await expect(service.deleteDraft({} as never, 12)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(contracts.delete).not.toHaveBeenCalled();
    expect(purgeForEntity).not.toHaveBeenCalled();
  });
});
