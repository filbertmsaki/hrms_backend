import { Repository } from 'typeorm';
import { LeaveBalanceCronService } from './leave-balance-cron.service';
import { Company } from '../../../companies/entities/company.entity';
import { LeaveBalanceService } from './leave-balance.service';

type MockRepo = Record<string, jest.Mock>;

const createRepositoryMock = (): MockRepo => ({
  find: jest.fn(),
});

describe('LeaveBalanceCronService', () => {
  let service: LeaveBalanceCronService;
  let companyRepository: MockRepo;
  let leaveBalanceService: {
    getFiscalYearFromDate: jest.Mock;
    generateBalancesForCompany: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };

  beforeEach(() => {
    companyRepository = createRepositoryMock();
    leaveBalanceService = {
      getFiscalYearFromDate: jest.fn().mockReturnValue('2026'),
      generateBalancesForCompany: jest
        .fn()
        .mockResolvedValue({ generated_balances: 5 }),
    };
    configService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    service = new LeaveBalanceCronService(
      companyRepository as unknown as Repository<Company>,
      leaveBalanceService as unknown as LeaveBalanceService,
      configService as never,
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
    expect(
      leaveBalanceService.generateBalancesForCompany,
    ).toHaveBeenCalledTimes(2);
    expect(
      leaveBalanceService.generateBalancesForCompany,
    ).toHaveBeenNthCalledWith(1, 1, '2026');
    expect(
      leaveBalanceService.generateBalancesForCompany,
    ).toHaveBeenNthCalledWith(2, 2, '2026');
  });

  it('skips startup backfill in the test environment', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'APP_ENV' ? 'test' : undefined,
    );

    await service.onModuleInit();

    expect(companyRepository.find).not.toHaveBeenCalled();
    expect(
      leaveBalanceService.generateBalancesForCompany,
    ).not.toHaveBeenCalled();
  });
});
