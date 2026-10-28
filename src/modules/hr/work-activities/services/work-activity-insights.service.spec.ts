import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { FieldParty } from '../entities/activity-config.entities';
import { WorkActivityInsightsService } from './work-activity-insights.service';

function queryBuilder(count = 2) {
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
    'where',
    'andWhere',
    'setParameters',
    'setParameter',
    'innerJoin',
    'leftJoin',
    'select',
    'addSelect',
    'groupBy',
    'addGroupBy',
    'orderBy',
    'addOrderBy',
    'skip',
    'take',
  ]) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.getCount = jest.fn().mockResolvedValue(count);
  builder.getRawMany = jest.fn().mockResolvedValue([]);
  builder.getRawOne = jest.fn().mockResolvedValue({});
  return builder;
}

describe('WorkActivityInsightsService dashboard SQL scope', () => {
  it('returns a paginated eligible planned-visit detail under the same employee scope', async () => {
    const builder = queryBuilder();
    builder.getCount.mockResolvedValue(1);
    builder.getRawMany.mockResolvedValue([
      {
        plan_item_id: 81,
        plan_date: '2026-10-20',
        employee_id: 31,
        linked_visit_count: 1,
        qualifying_completed_visit_count: 1,
        cancelled_visit_count: 0,
      },
    ]);
    const service = Object.assign(
      Object.create(WorkActivityInsightsService.prototype),
      {
        hrAccessService: {
          ensureActorCompanyId: jest.fn().mockReturnValue(7),
          getAccessibleEmployeeSqlScope: jest.fn().mockResolvedValue({
            companyWide: false,
            actorEmployeeId: null,
            branchIds: [4],
            departmentIds: [],
            managerEmployeeId: null,
          }),
        },
        visitPlanItemRepository: {
          createQueryBuilder: jest.fn().mockReturnValue(builder),
        },
      },
    ) as WorkActivityInsightsService;
    const actor = {
      id: 4,
      email: 'manager@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 7,
      companyMembershipId: 17,
      employeeId: 31,
      roles: [],
      permissions: ['data_scope:branch'],
    } as AuthenticatedUser;

    const result = await service.getSalesFieldDetails(actor, {
      metric: 'PLANNED_VISITS',
      date_from: '2026-10-01',
      date_to: '2026-10-31',
      employee_id: 31,
      page: 1,
      limit: 1,
    });

    expect(result).toMatchObject({
      metric: 'PLANNED_VISITS',
      rows: [{ plan_item_id: 81 }],
      pagination: { page: 1, limit: 1, total: 1, total_pages: 1 },
    });
    expect(builder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('employee_scope.id = :filterEmployeeId'),
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('plan.visitDate BETWEEN :dateFrom AND :dateTo'),
      { dateFrom: '2026-10-01', dateTo: '2026-10-31' },
    );
    expect(builder.setParameters).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeCompanyId: 7,
        scopeBranchIds: [4],
        filterEmployeeId: 31,
      }),
    );
    expect(builder.skip).toHaveBeenCalledWith(0);
    expect(builder.take).toHaveBeenCalledWith(1);
  });

  it('calculates planned completion from eligible plan items and separates unplanned visits', async () => {
    const planItems = queryBuilder();
    planItems.getRawOne.mockResolvedValue({
      planned_item_count: '8',
      completed_item_count: '6',
    });
    const visits = queryBuilder();
    visits.getRawOne.mockResolvedValue({ unplanned_completed_count: '2' });
    const service = Object.assign(
      Object.create(WorkActivityInsightsService.prototype),
      {
        visitPlanItemRepository: {
          createQueryBuilder: jest.fn().mockReturnValue(planItems),
        },
        visitRepository: {
          createQueryBuilder: jest.fn().mockReturnValue(visits),
        },
      },
    ) as WorkActivityInsightsService;

    await expect(
      service['getPlannedVisitProductivity'](7, '2026-10-01', '2026-10-31', {
        sql: 'SELECT employee_scope.id FROM employees employee_scope WHERE employee_scope.company_id = :scopeCompanyId',
        params: { scopeCompanyId: 7 },
      }),
    ).resolves.toEqual({
      planned_visit_items: 8,
      completed_planned_visit_items: 6,
      planned_visit_completion_rate: 75,
      unplanned_completed_visits: 2,
    });
    expect(planItems.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('plan.status IN'),
      expect.objectContaining({
        eligibleStatuses: expect.arrayContaining(['SUBMITTED', 'APPROVED']),
      }),
    );
    expect(planItems.select).toHaveBeenCalledWith(
      expect.stringContaining('visit.status <> :cancelledStatus'),
      'planned_item_count',
    );
    expect(planItems.setParameters).toHaveBeenCalledWith(
      expect.objectContaining({ cancelledStatus: 'CANCELLED' }),
    );
    expect(planItems.andWhere).toHaveBeenCalledWith(
      'plan.visitDate BETWEEN :dateFrom AND :dateTo',
      { dateFrom: '2026-10-01', dateTo: '2026-10-31' },
    );
    expect(visits.andWhere).toHaveBeenCalledWith(
      'visit.isUnplanned = :isUnplanned',
      { isUnplanned: true },
    );
  });

  it('returns no percentage when no eligible planned items remain', async () => {
    const planItems = queryBuilder();
    planItems.getRawOne.mockResolvedValue({
      planned_item_count: '0',
      completed_item_count: '0',
    });
    const visits = queryBuilder();
    visits.getRawOne.mockResolvedValue({ unplanned_completed_count: '0' });
    const service = Object.assign(
      Object.create(WorkActivityInsightsService.prototype),
      {
        visitPlanItemRepository: {
          createQueryBuilder: jest.fn().mockReturnValue(planItems),
        },
        visitRepository: {
          createQueryBuilder: jest.fn().mockReturnValue(visits),
        },
      },
    ) as WorkActivityInsightsService;

    const result = await service['getPlannedVisitProductivity'](
      7,
      '2026-10-01',
      '2026-10-31',
      {
        sql: 'SELECT id FROM employees WHERE company_id = :scopeCompanyId',
        params: {},
      },
    );

    expect(result.planned_visit_completion_rate).toBeNull();
  });

  it('uses compact company, access and requested filters for summary and commercial aggregates', async () => {
    const builders = Array.from({ length: 10 }, () => queryBuilder());
    const repositories = builders.slice(0, 4).map((builder) => ({
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    }));
    repositories[1].createQueryBuilder = jest
      .fn()
      .mockReturnValueOnce(builders[1])
      .mockReturnValueOnce(builders[9]);
    let opportunityBuilderIndex = 4;
    const opportunityRepository = {
      createQueryBuilder: jest
        .fn()
        .mockImplementation(() => builders[opportunityBuilderIndex++]),
    };
    const hrAccessService = {
      ensureActorCompanyId: jest.fn().mockReturnValue(7),
      getAccessibleEmployeeIds: jest.fn(),
      getAccessibleEmployeeSqlScope: jest.fn().mockResolvedValue({
        companyWide: false,
        actorEmployeeId: 31,
        branchIds: [4],
        departmentIds: [8],
        managerEmployeeId: 31,
      }),
    };
    const service = Object.assign(
      Object.create(WorkActivityInsightsService.prototype),
      {
        hrAccessService,
        commercialPolicyRepository: {
          findOne: jest.fn().mockResolvedValue({ defaultCurrency: 'TZS' }),
        },
        reportRepository: repositories[0],
        visitRepository: repositories[1],
        followUpRepository: repositories[2],
        exceptionRepository: repositories[3],
        visitPlanItemRepository: {
          createQueryBuilder: jest.fn().mockReturnValue(builders[8]),
        },
        opportunityRepository,
      },
    ) as WorkActivityInsightsService;
    const actor: AuthenticatedUser = {
      id: 4,
      email: 'manager@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 7,
      companyMembershipId: 17,
      employeeId: 31,
      roles: [],
      permissions: ['data_scope:branch', 'data_scope:department'],
    };

    const summary = await service.getCompanySummary(
      actor,
      '2026-10-01',
      '2026-10-31',
      {
        branch_id: 4,
        department_id: 8,
      },
    );

    expect(summary).toMatchObject({
      customer_visits: 0,
      broker_intermediary_visits: 0,
    });
    expect(builders[1].leftJoin).toHaveBeenCalledWith(
      FieldParty,
      'party',
      expect.stringContaining('party.company_id'),
    );
    expect(builders[1].addSelect).toHaveBeenCalledWith(
      expect.stringContaining('party.party_type'),
      'customer_visits',
    );

    expect(hrAccessService.getAccessibleEmployeeSqlScope).toHaveBeenCalledWith(
      actor,
    );
    expect(hrAccessService.getAccessibleEmployeeIds).not.toHaveBeenCalled();
    for (const builder of builders) {
      expect(builder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('IN (SELECT employee_scope.id'),
      );
      expect(builder.setParameters).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeCompanyId: 7,
          scopeActorEmployeeId: 31,
          scopeBranchIds: [4],
          scopeDepartmentIds: [8],
          scopeManagerEmployeeId: 31,
          filterBranchId: 4,
          filterDepartmentId: 8,
        }),
      );
    }
  });

  it('keeps the manager activity-review summary in SQL without employee ID lists', async () => {
    const reportBuilders = [queryBuilder(), queryBuilder()];
    const visitBuilders = [queryBuilder(), queryBuilder()];
    const hrAccessService = {
      getAccessibleEmployeeSqlScope: jest.fn().mockResolvedValue({
        companyWide: false,
        actorEmployeeId: 31,
        branchIds: [4],
        departmentIds: [],
        managerEmployeeId: 31,
      }),
      getAccessibleEmployeeIds: jest.fn(),
    };
    const service = Object.assign(
      Object.create(WorkActivityInsightsService.prototype),
      {
        hrAccessService,
        reportRepository: {
          createQueryBuilder: jest
            .fn()
            .mockReturnValueOnce(reportBuilders[0])
            .mockReturnValueOnce(reportBuilders[1]),
        },
        visitRepository: {
          createQueryBuilder: jest
            .fn()
            .mockReturnValueOnce(visitBuilders[0])
            .mockReturnValueOnce(visitBuilders[1]),
        },
      },
    ) as WorkActivityInsightsService;
    const actor: AuthenticatedUser = {
      id: 4,
      email: 'manager@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 7,
      companyMembershipId: 17,
      employeeId: 31,
      roles: [],
      permissions: ['data_scope:branch', 'manager_team:read'],
    };

    await service.getManagerSummary(actor);

    expect(hrAccessService.getAccessibleEmployeeSqlScope).toHaveBeenCalledWith(
      actor,
    );
    expect(hrAccessService.getAccessibleEmployeeIds).not.toHaveBeenCalled();
    const scopedBuilders = [
      ...reportBuilders.map((builder) => ({ alias: 'report', builder })),
      ...visitBuilders.map((builder) => ({ alias: 'visit', builder })),
    ];
    for (const { alias, builder } of scopedBuilders) {
      expect(builder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining(
          `${alias}.employeeId IN (SELECT employee_scope.id`,
        ),
      );
      expect(builder.setParameters).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeCompanyId: 7,
          scopeActorEmployeeId: 31,
          scopeBranchIds: [4],
          scopeManagerEmployeeId: 31,
        }),
      );
    }
  });
});
