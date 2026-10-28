import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { PerformanceInsightsService } from './performance-insights.service';

describe('PerformanceInsightsService dashboard distributions', () => {
  const actor: AuthenticatedUser = {
    id: 1,
    email: 'executive@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 10,
    companyMembershipId: 20,
    employeeId: 30,
    roles: [],
    permissions: ['performance_aggregates:read'],
  };

  it('counts only published reviews whose periods overlap the dashboard range', async () => {
    const predicates: Array<{ expression: string; parameters?: unknown }> = [];
    const query: Record<string, jest.Mock> = {};
    for (const method of ['innerJoin', 'where', 'andWhere']) {
      query[method] = jest.fn((expression: string, parameters?: unknown) => {
        if (method !== 'innerJoin') predicates.push({ expression, parameters });
        return query;
      });
    }
    query.getCount = jest.fn().mockResolvedValue(3);
    const reviewRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
      count: jest.fn(),
    };
    const achievementQuery: Record<string, jest.Mock> = {};
    for (const method of ['innerJoin', 'where', 'andWhere']) {
      achievementQuery[method] = jest.fn().mockReturnThis();
    }
    achievementQuery.getCount = jest.fn().mockResolvedValue(0);
    const subject = Object.assign(
      Object.create(PerformanceInsightsService.prototype),
      {
        hrAccessService: {
          ensureActorCompanyId: jest.fn().mockReturnValue(10),
        },
        achievementRepository: {
          createQueryBuilder: jest.fn().mockReturnValue(achievementQuery),
        },
        reviewRepository,
        employeeKpiRepository: { count: jest.fn().mockResolvedValue(0) },
        developmentPlanRepository: { count: jest.fn().mockResolvedValue(0) },
        feedback360Repository: {
          createQueryBuilder: jest.fn().mockImplementation(() => {
            const feedbackQuery: Record<string, jest.Mock> = {};
            for (const method of ['innerJoin', 'where', 'andWhere']) {
              feedbackQuery[method] = jest.fn().mockReturnThis();
            }
            feedbackQuery.getCount = jest.fn().mockResolvedValue(0);
            return feedbackQuery;
          }),
        },
      },
    ) as PerformanceInsightsService;

    const result = await subject.getManagerSummary(
      actor,
      '2026-10-01',
      '2026-10-31',
    );

    expect(result.published_team_reviews).toBe(3);
    expect(predicates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expression: 'period.end_date >= :dateFrom',
          parameters: { dateFrom: '2026-10-01' },
        }),
        expect.objectContaining({
          expression: 'period.start_date <= :dateTo',
          parameters: { dateTo: '2026-10-31' },
        }),
      ]),
    );
    expect(reviewRepository.count).not.toHaveBeenCalled();
  });

  it('aggregates published monthly reviews and preserves unscored and unbanded counts', async () => {
    const rows = [
      {
        period_id: 8,
        period_name: 'September 2026',
        period_start: '2026-09-01',
        period_end: '2026-09-30',
        band_id: 2,
        band_code: 'MEETS',
        band_label: 'Meets expectations',
        minimum_score: '70',
        maximum_score: '89.99',
        display_order: 2,
        requires_improvement_plan: false,
        published_review_count: '2',
        scored_review_count: '2',
        average_score: '81.5',
      },
      {
        period_id: 8,
        period_name: 'September 2026',
        period_start: '2026-09-01',
        period_end: '2026-09-30',
        band_id: null,
        band_code: null,
        band_label: null,
        minimum_score: null,
        maximum_score: null,
        display_order: null,
        requires_improvement_plan: null,
        published_review_count: '1',
        scored_review_count: '0',
        average_score: null,
      },
      {
        period_id: 8,
        period_name: 'September 2026',
        period_start: '2026-09-01',
        period_end: '2026-09-30',
        band_id: null,
        band_code: null,
        band_label: null,
        minimum_score: null,
        maximum_score: null,
        display_order: null,
        requires_improvement_plan: null,
        published_review_count: '1',
        scored_review_count: '1',
        average_score: '61',
      },
    ];
    const calls: Array<{
      where: string;
      parameters?: Record<string, unknown>;
    }> = [];
    const buildQuery = () => {
      const query: Record<string, jest.Mock> = {
        innerJoin: jest.fn(),
        leftJoin: jest.fn(),
        where: jest.fn(
          (where: string, parameters?: Record<string, unknown>) => {
            calls.push({ where, parameters });
            return query;
          },
        ),
        andWhere: jest.fn(
          (where: string, parameters?: Record<string, unknown>) => {
            calls.push({ where, parameters });
            return query;
          },
        ),
        setParameters: jest.fn(),
        select: jest.fn(),
        addSelect: jest.fn(),
        groupBy: jest.fn(),
        addGroupBy: jest.fn(),
        orderBy: jest.fn(),
        addOrderBy: jest.fn(),
        getRawMany: jest.fn().mockResolvedValue(rows),
        getRawOne: jest.fn().mockResolvedValue({ employee_count: '1' }),
      };
      for (const key of [
        'innerJoin',
        'leftJoin',
        'select',
        'addSelect',
        'groupBy',
        'addGroupBy',
        'orderBy',
        'addOrderBy',
        'setParameters',
      ]) {
        query[key].mockReturnValue(query);
      }
      return query;
    };
    const subject = Object.assign(
      Object.create(PerformanceInsightsService.prototype),
      {
        hrAccessService: {
          ensureActorCompanyId: jest.fn().mockReturnValue(10),
          getAccessibleEmployeeSqlScope: jest.fn().mockResolvedValue({
            companyWide: false,
            actorEmployeeId: 30,
            branchIds: [4],
            departmentIds: [],
            managerEmployeeId: null,
          }),
        },
        reviewRepository: {
          createQueryBuilder: jest.fn().mockImplementation(buildQuery),
        },
      },
    ) as PerformanceInsightsService;

    const result = await subject.getPublishedMonthlyScoreDistribution(
      actor,
      '2026-09-01',
      '2026-09-30',
      { branch_id: 4 },
    );

    expect(result).toEqual({
      periods: [
        {
          period_id: 8,
          period_name: 'September 2026',
          period_start: '2026-09-01',
          period_end: '2026-09-30',
          published_review_count: 4,
          scored_review_count: 3,
          unscored_review_count: 1,
          unbanded_scored_review_count: 1,
          bands: [
            {
              band_id: 2,
              code: 'MEETS',
              label: 'Meets expectations',
              minimum_score: 70,
              maximum_score: 89.99,
              requires_improvement_plan: false,
              published_review_count: 2,
              scored_review_count: 2,
              average_score: 81.5,
            },
          ],
        },
      ],
      low_performer_employee_count: 1,
    });
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ where: 'review.company_id = :companyId' }),
        expect.objectContaining({
          where: expect.stringContaining(
            'review.employee_id IN (SELECT employee_scope.id',
          ),
        }),
        expect.objectContaining({
          where: 'period.end_date >= :dateFrom',
          parameters: { dateFrom: '2026-09-01' },
        }),
        expect.objectContaining({
          where: 'period.start_date <= :dateTo',
          parameters: { dateTo: '2026-09-30' },
        }),
      ]),
    );
    const scopedQuery = (
      subject as unknown as {
        reviewRepository: { createQueryBuilder: jest.Mock };
      }
    ).reviewRepository.createQueryBuilder.mock.results[0].value;
    expect(scopedQuery.setParameters).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeCompanyId: 10,
        scopeActorEmployeeId: 30,
        scopeBranchIds: [4],
        filterBranchId: 4,
      }),
    );
  });
});
