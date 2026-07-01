import { Repository } from 'typeorm';
import { LeaveBalanceCronService } from './leave-balance-cron.service';
import { Company } from '../../../companies/entities/company.entity';
import { LeaveBalanceService } from './leave-balance.service';

type MockRepo<T = unknown> = Record<string, jest.Mock>;

const createRepositoryMock = <T>(): MockRepo<T> => ({
  find: jest.fn(),
});

describe('LeaveBalanceCronService', () => {
  let service: LeaveBalanceCronService;
  let companyRepository: MockRepo<Company>;
  let leaveBalanceService: {
    getFiscalYearFromDate: jest.Mock;
    generateBalancesForCompany: jest.Mock;
  };

  beforeEach(() => {
    companyRepository = createRepositoryMock();
    leaveBalanceService = {
      getFiscalYearFromDate: jest.fn().mockReturnValue('2026'),
      generateBalancesForCompany: jest
        .fn()
        .mockResolvedValue({ generated_balances: 5 }),
    };

    service = new LeaveBalanceCronService(
      companyRepository as unknown as Repository<Company>,
      leaveBalanceService as unknown as LeaveBalanceService,
    );
  });

  it('backfills current-year balances for all companies on module init', async () => {
    companyRepository.find.mockResolvedValue([
      { id: 1, name: 'Alpha' },
      { id: 2, name: 'Beta' },
    ]);

    await service.onModuleInit();

    expect(companyRepository.find).toHaveBeenCalledWith({
      select: ['id', 'name'],
    });
    expect(leaveBalanceService.generateBalancesForCompany).toHaveBeenCalledTimes(
      2,
    );
    expect(leaveBalanceService.generateBalancesForCompany).toHaveBeenNthCalledWith(
      1,
      1,
      '2026',
    );
    expect(leaveBalanceService.generateBalancesForCompany).toHaveBeenNthCalledWith(
      2,
      2,
      '2026',
    );
  });
});
