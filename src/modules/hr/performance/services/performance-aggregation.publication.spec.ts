import { PerformanceAggregationService } from './performance-aggregation.service';
import { PerformancePeriodTypeEnum } from '../enums/performance-period-type.enum';

describe('PerformanceAggregationService publication lifecycle', () => {
  const access = { ensureActorCompanyId: jest.fn() };
  const audit = { log: jest.fn() };
  const financialYearRepository = { findOne: jest.fn() };
  const periodRepository = { find: jest.fn() };
  const reviewRepository = { find: jest.fn() };
  const aggregateRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    create: jest.fn((value = {}) => value),
    save: jest.fn((value) => Promise.resolve(value)),
  };
  const service = new PerformanceAggregationService(
    access as never,
    audit as never,
    financialYearRepository as never,
    periodRepository as never,
    reviewRepository as never,
    aggregateRepository as never,
  );
  const actor = { companyId: 8 } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    access.ensureActorCompanyId.mockReturnValue(8);
    audit.log.mockResolvedValue(undefined);
  });

  it('publishes only draft aggregates for the selected tenant, year, and period type', async () => {
    financialYearRepository.findOne.mockResolvedValue({ id: 3, companyId: 8 });
    aggregateRepository.find.mockResolvedValue([
      { id: 5, publishedAt: null },
      { id: 6, publishedAt: null },
    ]);
    aggregateRepository.save.mockImplementation(async (values) => values);

    const result = await service.publish(
      actor,
      3,
      PerformancePeriodTypeEnum.ANNUAL,
    );

    expect(aggregateRepository.find).toHaveBeenCalledWith({
      where: {
        companyId: 8,
        financialYearId: 3,
        periodType: PerformancePeriodTypeEnum.ANNUAL,
        publishedAt: expect.anything(),
      },
    });
    expect(result).toEqual({
      published_count: 2,
      period_type: PerformancePeriodTypeEnum.ANNUAL,
    });
    expect(aggregateRepository.save.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ publishedAt: expect.any(Date) }),
      ]),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'performance.aggregate.published',
        actor,
      }),
    );
  });

  it('leaves recalculated aggregates unpublished', async () => {
    aggregateRepository.findOne.mockResolvedValue(null);
    aggregateRepository.save.mockImplementation(async (value) => ({
      id: 7,
      ...value,
    }));
    const result = await (service as any).saveAggregate(actor, {
      companyId: 8,
      employeeId: 20,
      financialYearId: 3,
      periodType: PerformancePeriodTypeEnum.ANNUAL,
      sequenceNumber: 1,
      name: 'FY 2026',
      aggregationMethod: 'SIMPLE_MONTHLY_AVERAGE',
      aggregateScore: 81.25,
      sourceReviewHashes: [],
      calculationSnapshot: {},
    });
    expect(result.publishedAt).toBeNull();
  });

  it('withdraws an earlier publication before recalculation, including when no new scores remain', async () => {
    financialYearRepository.findOne.mockResolvedValue({
      id: 3,
      companyId: 8,
      annualAggregationMethod: 'SIMPLE_MONTHLY_AVERAGE',
      aggregationConfiguration: null,
    });
    periodRepository.find.mockResolvedValue([]);
    reviewRepository.find.mockResolvedValue([]);
    aggregateRepository.update.mockResolvedValue({ affected: 2 });

    const result = await service.calculate(
      actor,
      3,
      PerformancePeriodTypeEnum.ANNUAL,
    );

    expect(aggregateRepository.update).toHaveBeenCalledWith(
      {
        companyId: 8,
        financialYearId: 3,
        periodType: PerformancePeriodTypeEnum.ANNUAL,
      },
      { publishedAt: null },
    );
    expect(result.aggregate_count).toBe(0);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'performance.aggregate.invalidated',
        afterValues: expect.objectContaining({ invalidated_count: 2 }),
      }),
    );
  });
});
