import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { DashboardDateService } from './dashboard-date.service';

describe('DashboardDateService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const createService = async (timezone?: string) => {
    const companyRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue(
          timezone
            ? { id: 10, metadata: { timezone } }
            : { id: 10, metadata: {} },
        ),
    };
    const configService = {
      get: jest.fn((key: string) =>
        key === 'DASHBOARD_DEFAULT_PERIOD_DAYS'
          ? 30
          : key === 'DASHBOARD_MAX_DATE_RANGE_DAYS'
            ? 366
            : undefined,
      ),
    };
    return {
      service: new DashboardDateService(
        configService as unknown as ConfigService,
        companyRepository as unknown as Repository<Company>,
      ),
      companyRepository,
    };
  };

  it('resolves default dates and as-of day in the configured company timezone', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-27T01:00:00.000Z'));
    const { service, companyRepository } = await createService(
      'America/Los_Angeles',
    );

    await expect(service.resolve({}, 10)).resolves.toEqual({
      dateFrom: '2026-09-27',
      dateTo: '2026-10-26',
      today: '2026-10-26',
      timezone: 'America/Los_Angeles',
    });
    expect(companyRepository.findOne).toHaveBeenCalledWith({
      where: { id: 10 },
      select: ['id', 'metadata'],
    });
  });

  it('fails visibly when the company timezone is missing or invalid', async () => {
    const missing = await createService();
    await expect(missing.service.resolve({}, 10)).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({
        code: 'COMPANY_TIMEZONE_NOT_CONFIGURED',
      }),
    });

    const invalid = await createService('Not/A_Timezone');
    await expect(invalid.service.resolve({}, 10)).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({ code: 'COMPANY_TIMEZONE_INVALID' }),
    });
  });

  it('rejects reversed date ranges after resolving company configuration', async () => {
    const { service } = await createService('Africa/Dar_es_Salaam');
    await expect(
      service.resolve({ date_from: '2026-10-27', date_to: '2026-10-01' }, 10),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
