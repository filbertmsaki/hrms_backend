import { ForbiddenException } from '@nestjs/common';
import { PerformanceAggregateSelfService } from './performance-aggregate-self-service.service';

describe('PerformanceAggregateSelfService', () => {
  const repository = { find: jest.fn() };
  const financialYearRepository = { find: jest.fn() };
  const access = { ensureActorCompanyId: jest.fn() };
  let service: PerformanceAggregateSelfService;

  beforeEach(() => {
    jest.clearAllMocks();
    access.ensureActorCompanyId.mockReturnValue(8);
    repository.find.mockResolvedValue([]);
    financialYearRepository.find.mockResolvedValue([]);
    service = new PerformanceAggregateSelfService(
      access as never,
      repository as never,
      financialYearRepository as never,
    );
  });

  it('returns a safe projection scoped to the authenticated employee and company', async () => {
    repository.find.mockResolvedValue([
      {
        id: 4,
        companyId: 8,
        employeeId: 12,
        financialYearId: 3,
        periodType: 'QUARTERLY',
        sequenceNumber: 1,
        name: 'Q1',
        aggregationMethod: 'SIMPLE_MONTHLY_AVERAGE',
        aggregateScore: '82.5000',
        ratingCode: 'GOOD',
        publishedAt: new Date('2026-04-01T00:00:00.000Z'),
        calculationSnapshot: { source_review_ids: [99] },
      },
    ]);
    financialYearRepository.find.mockResolvedValue([
      {
        id: 3,
        code: 'FY26',
        name: 'Financial Year 2026',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      },
    ]);

    const result = await service.listOwn({
      companyId: 8,
      employeeId: 12,
    } as never);

    expect(repository.find).toHaveBeenCalledWith({
      where: {
        companyId: 8,
        employeeId: 12,
        publishedAt: expect.anything(),
      },
      order: {
        financialYearId: 'ASC',
        periodType: 'ASC',
        sequenceNumber: 'ASC',
      },
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: 4,
        aggregate_score: '82.5000',
        period_type: 'QUARTERLY',
        financial_year_code: 'FY26',
        financial_year_name: 'Financial Year 2026',
      }),
    ]);
    expect(result[0]).not.toHaveProperty('calculationSnapshot');
  });

  it('does not query aggregates when the actor has no employee profile', async () => {
    await expect(service.listOwn({ companyId: 8 } as never)).rejects.toThrow(
      ForbiddenException,
    );
    expect(repository.find).not.toHaveBeenCalled();
    expect(financialYearRepository.find).not.toHaveBeenCalled();
  });
});
