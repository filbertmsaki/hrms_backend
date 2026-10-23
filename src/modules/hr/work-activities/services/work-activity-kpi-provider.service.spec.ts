import { WorkActivityKpiProviderService } from './work-activity-kpi-provider.service';
import { FieldVisitStatusEnum } from '../enums/work-activity.enums';

describe('WorkActivityKpiProviderService field productivity metrics', () => {
  const reportRepository = {};
  const entryRepository = {};
  const visitRepository = { createQueryBuilder: jest.fn() };
  const opportunityRepository = { createQueryBuilder: jest.fn() };
  const followUpRepository = {};
  const commercialPolicyRepository = { findOne: jest.fn() };
  let service: WorkActivityKpiProviderService;

  function builder(rawValue?: unknown) {
    const qb: Record<string, jest.Mock> = {};
    for (const method of [
      'where',
      'andWhere',
      'innerJoin',
      'select',
      'addSelect',
    ]) {
      qb[method] = jest.fn(() => qb);
    }
    qb.getCount = jest.fn().mockResolvedValue(3);
    qb.getRawOne = jest.fn().mockResolvedValue(rawValue);
    return qb;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WorkActivityKpiProviderService(
      reportRepository as never,
      entryRepository as never,
      visitRepository as never,
      opportunityRepository as never,
      followUpRepository as never,
      commercialPolicyRepository as never,
    );
  });

  it('excludes cancelled and unplanned visits from the planned KPI denominator', async () => {
    const qb = builder();
    visitRepository.createQueryBuilder.mockReturnValue(qb);
    await expect(
      service.getMetric(
        7,
        4,
        '2026-10-01',
        '2026-10-31',
        'FIELD_VISITS_PLANNED',
      ),
    ).resolves.toBe(3);
    expect(qb.andWhere).toHaveBeenCalledWith('visit.isUnplanned = false');
    expect(qb.andWhere).toHaveBeenCalledWith(
      'visit.status != :cancelledStatus',
      { cancelledStatus: FieldVisitStatusEnum.CANCELLED },
    );
  });

  it('keeps unplanned visits out of the planned completion numerator', async () => {
    const qb = builder();
    visitRepository.createQueryBuilder.mockReturnValue(qb);
    await expect(
      service.getMetric(
        7,
        4,
        '2026-10-01',
        '2026-10-31',
        'FIELD_VISITS_COMPLETED',
      ),
    ).resolves.toBe(3);
    expect(qb.andWhere).toHaveBeenCalledWith('visit.isUnplanned = false');
  });

  it('reports potential value in the configured default currency instead of summing unlike currencies', async () => {
    commercialPolicyRepository.findOne.mockResolvedValue({
      defaultCurrency: 'USD',
    });
    const qb = builder({ total: '120.00' });
    opportunityRepository.createQueryBuilder.mockReturnValue(qb);
    await expect(
      service.getMetric(
        7,
        4,
        '2026-10-01',
        '2026-10-31',
        'POTENTIAL_VALUE_REPORTED',
      ),
    ).resolves.toBe(120);
    expect(qb.andWhere).toHaveBeenCalledWith(
      "UPPER(COALESCE(NULLIF(opportunity.currency, ''), :defaultCurrency)) = :defaultCurrency",
      { defaultCurrency: 'USD' },
    );
  });
});
