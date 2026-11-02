import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { PublishedScoreDrilldownService } from './published-score-drilldown.service';

describe('PublishedScoreDrilldownService', () => {
  const actor: AuthenticatedUser = {
    id: 1,
    email: 'manager@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 10,
    companyMembershipId: 20,
    employeeId: 30,
    roles: [],
    permissions: ['performance_aggregates:read'],
  };

  const query = {
    date_from: '2026-09-01',
    date_to: '2026-09-30',
    period_type: 'MONTHLY' as const,
    page: 2,
    limit: 25,
    period_id: 12,
    rating_band_id: 4,
    score_state: 'scored' as const,
    branch_id: 7,
    department_id: 4,
    employee_id: 43,
  };

  function makeService(emptyScope = false) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const periodQuery: Record<string, jest.Mock> = {};
    for (const method of [
      'innerJoin',
      'where',
      'andWhere',
      'setParameters',
      'select',
      'addSelect',
      'orderBy',
      'addOrderBy',
      'skip',
      'take',
    ]) {
      periodQuery[method] = jest.fn((...args: unknown[]) => {
        calls.push({ method: `review.${method}`, args });
        return periodQuery;
      });
    }
    periodQuery.clone = jest.fn().mockReturnValue(periodQuery);
    periodQuery.getCount = jest.fn().mockResolvedValue(1);
    periodQuery.getRawMany = jest.fn().mockResolvedValue([
      {
        review_id: '901',
        employee_id: '101',
        employee_no: 'EMP-101',
        employee_name: 'Asha Example',
        period_id: '12',
        period_name: 'September 2026',
        period_type: 'MONTHLY',
        period_start: '2026-09-01',
        period_end: '2026-09-30',
        final_score: '88.5',
        rating_code: 'MEETS',
        published_at: '2026-10-01T08:00:00.000Z',
      },
    ]);

    const hrAccessService = {
      ensureActorCompanyId: jest.fn().mockReturnValue(10),
      getAccessibleEmployeeSqlScope: jest.fn().mockResolvedValue(
        emptyScope
          ? {
              companyWide: false,
              actorEmployeeId: null,
              branchIds: [],
              departmentIds: [],
              managerEmployeeId: null,
            }
          : {
              companyWide: false,
              actorEmployeeId: null,
              branchIds: [5],
              departmentIds: [9],
              managerEmployeeId: null,
            },
      ),
    };
    const reviewRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(periodQuery),
    };
    const service = new PublishedScoreDrilldownService(
      hrAccessService as never,
      reviewRepository as never,
    );
    return {
      service,
      calls,
      hrAccessService,
      periodQuery,
    };
  }

  it('applies tenant, employee, branch, department, publication, date, and paging filters', async () => {
    const fixture = makeService();
    const result = await fixture.service.getPage(actor, query);

    expect(fixture.periodQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining(
        'review.employee_id IN (SELECT employee_scope.id',
      ),
    );
    expect(fixture.periodQuery.setParameters).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeCompanyId: 10,
        scopeBranchIds: [5],
        scopeDepartmentIds: [9],
        filterBranchId: 7,
        filterDepartmentId: 4,
        filterEmployeeId: 43,
      }),
    );
    expect(fixture.periodQuery.andWhere).toHaveBeenCalledWith(
      'review.status = :status',
      { status: 'PUBLISHED' },
    );
    expect(fixture.periodQuery.andWhere).toHaveBeenCalledWith(
      'period.end_date >= :dateFrom',
      { dateFrom: query.date_from },
    );
    expect(fixture.periodQuery.andWhere).toHaveBeenCalledWith(
      'period.start_date <= :dateTo',
      { dateTo: query.date_to },
    );
    expect(fixture.periodQuery.andWhere).toHaveBeenCalledWith(
      'period.id = :periodId',
      { periodId: 12 },
    );
    expect(fixture.periodQuery.andWhere).toHaveBeenCalledWith(
      'review.rating_band_id = :ratingBandId',
      { ratingBandId: 4 },
    );
    expect(fixture.periodQuery.andWhere).toHaveBeenCalledWith(
      'review.final_score IS NOT NULL',
    );
    expect(fixture.periodQuery.skip).toHaveBeenCalledWith(25);
    expect(fixture.periodQuery.take).toHaveBeenCalledWith(25);
    expect(result.pagination).toEqual({
      page: 2,
      limit: 25,
      total: 1,
      total_pages: 1,
    });
    expect(result.filters).toMatchObject({
      employee_id: 43,
      branch_id: 7,
      department_id: 4,
    });
    expect(result.items[0]).toMatchObject({
      review_id: 901,
      employee_id: 101,
      employee_name: 'Asha Example',
      final_score: 88.5,
    });
  });

  it('does not query review rows for a denied performance permission', async () => {
    const fixture = makeService();
    await expect(
      fixture.service.getPage(
        { ...actor, permissions: ['dashboard:management'] },
        query,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fixture.hrAccessService.ensureActorCompanyId).not.toHaveBeenCalled();
  });

  it('returns no rows for an empty authorized employee scope', async () => {
    const fixture = makeService(true);
    const result = await fixture.service.getPage(actor, query);
    expect(result.pagination.total).toBe(0);
    expect(result.items).toEqual([]);
    expect(
      fixture.hrAccessService.getAccessibleEmployeeSqlScope,
    ).toHaveBeenCalled();
    expect(fixture.periodQuery.where).not.toHaveBeenCalled();
  });

  it('filters the unbanded and unscored buckets independently', async () => {
    const fixture = makeService();
    await fixture.service.getPage(actor, {
      ...query,
      rating_band_id: 0,
      score_state: 'unscored',
    });
    expect(fixture.periodQuery.andWhere).toHaveBeenCalledWith(
      'review.rating_band_id IS NULL',
    );
    expect(fixture.periodQuery.andWhere).toHaveBeenCalledWith(
      'review.final_score IS NULL',
    );
  });
});
