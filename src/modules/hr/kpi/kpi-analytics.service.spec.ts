import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { KpiAnalyticsService } from './kpi-analytics.service';
import { ScorecardService } from './scorecard.service';

const actor = (roles: string[], employeeId = 17): AuthenticatedUser => ({
  id: 4,
  email: 'synthetic@example.test',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 2,
  companyMembershipId: 4,
  employeeId,
  roles,
  permissions: [],
});

function service(
  raw: Record<string, string> = {
    total: '0',
    approved: '0',
    pending: '0',
    pendingReview: '0',
    missing: '0',
    returned: '0',
    rejected: '0',
    draft: '0',
  },
) {
  const qb: Record<string, jest.Mock> = {};
  for (const method of [
    'innerJoin',
    'leftJoin',
    'where',
    'andWhere',
    'select',
    'addSelect',
    'orderBy',
    'addOrderBy',
    'distinctOn',
    'limit',
  ])
    qb[method] = jest.fn().mockReturnValue(qb);
  qb.getRawOne = jest.fn().mockResolvedValue(raw);
  qb.getRawMany = jest.fn().mockResolvedValue([]);
  const assignments = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
  const scorecards = {
    query: jest.fn().mockResolvedValue([
      {
        eligible_employees: 12,
        employees_with_scorecards: 9,
        scorecards: 11,
        complete_scorecards: 6,
        incomplete_scorecards: 5,
        awaiting_approved_achievements: 3,
      },
    ]),
  };
  const access = {
    ensureActorCompanyId: jest.fn().mockReturnValue(2),
    hasCompanyScope: jest.fn().mockReturnValue(true),
    getReportingEmployeeIds: jest.fn().mockResolvedValue([21, 22]),
    getAccessibleEmployeeIds: jest.fn().mockResolvedValue([21, 22, 31]),
  };
  const empty = {};
  const analytics = new KpiAnalyticsService(
    assignments as never,
    empty as never,
    scorecards as never,
    empty as never,
    empty as never,
    empty as never,
    empty as never,
    empty as never,
    empty as never,
    empty as never,
    access as never,
    empty as never,
  );
  jest.spyOn(analytics, 'evaluations').mockResolvedValue({
    summary: {
      total: 0,
      finalized: 0,
      completionPercent: null,
      acknowledged: 0,
      disputed: 0,
      byStatus: {},
    },
    ratingDistribution: null,
    ratingDistributionStatus: 'Combined rating not configured',
    refreshedAt: '',
  });
  return { analytics, qb, access, scorecards };
}

describe('Phase 5 KPI analytics boundaries', () => {
  it('keeps employees, scorecards, and evaluations as different coverage units', async () => {
    const { analytics, scorecards } = service();
    const result = await analytics.coverage(actor(['COMPANY_ADMIN']), {});
    expect(result).toMatchObject({
      eligibleEmployees: 12,
      employeesWithScorecards: 9,
      employeesWithoutScorecards: 3,
      scorecards: 11,
      completeScorecards: 6,
      incompleteScorecards: 5,
      awaitingApprovedAchievements: 3,
      finalizedEvaluations: 0,
      evaluationsInProgress: 0,
    });
    expect(scorecards.query).toHaveBeenCalledWith(
      expect.stringContaining('approved_revision_id'),
      [2],
    );
  });

  it('includes historically assigned archived definitions in filter choices', async () => {
    const { analytics, qb } = service();
    qb.getRawMany.mockResolvedValue([
      {
        id: '8',
        code: 'OLD',
        status: 'archived',
        name: 'Older KPI',
        category: 'Claims',
        version: '2',
      },
    ]);
    const result = await analytics.historicalDefinitions(
      actor(['EMPLOYEE']),
      {},
    );
    expect(result.rows).toEqual([
      {
        id: 8,
        code: 'OLD',
        status: 'archived',
        name: 'Older KPI',
        category: 'Claims',
        version: 2,
      },
    ]);
    expect(qb.andWhere).toHaveBeenCalledWith('a.subject_type = :subjectType', {
      subjectType: 'employee',
    });
  });
  it('counts only approved revisions as completed, leaving pending and missing distinct', async () => {
    const { analytics, qb } = service({
      total: '3',
      approved: '1',
      pending: '1',
      pendingReview: '1',
      missing: '1',
      returned: '0',
      rejected: '0',
      draft: '0',
    });
    const output = await analytics.overview(actor(['EMPLOYEE']), {});
    expect(output.assignments).toEqual({
      total: 3,
      approved: 1,
      missing: 1,
      pending: 1,
      pendingReview: 1,
      returned: 0,
      rejected: 0,
      draft: 0,
    });
    expect(output.completenessPercent).toBe(33.33);
    expect(output.overallIndex).toBeNull();
    expect(output.riskStatus).toBeNull();
    expect(output.riskStatusStatus).toBe('Risk status not configured');
    expect(qb.addSelect).toHaveBeenCalledWith(
      expect.stringContaining('approved.id IS NOT NULL'),
      'approved',
    );
  });

  it('denies employee filters outside the authenticated identity', async () => {
    const { analytics } = service();
    await expect(
      analytics.overview(actor(['EMPLOYEE']), { employeeId: 18 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('restricts managers to the existing reporting tree', async () => {
    const { analytics, qb, access } = service();
    await expect(
      analytics.overview(actor(['DEPARTMENT_MANAGER']), { employeeId: 99 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await analytics.overview(actor(['DEPARTMENT_MANAGER']), {});
    expect(access.getReportingEmployeeIds).toHaveBeenCalled();
    expect(qb.andWhere).toHaveBeenCalledWith(
      'a.subject_id IN (:...employeeIds)',
      { employeeIds: [21, 22] },
    );
  });

  it('does not permit management to filter to an individual employee', async () => {
    const { analytics } = service();
    await expect(
      analytics.overview(actor(['MANAGEMENT']), { employeeId: 17 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('applies category and approved-status filters to assignment analytics', async () => {
    const { analytics, qb } = service();
    await analytics.overview(actor(['HR_MANAGER']), {
      category: 'Service',
      approvalStatus: 'approved',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('v.category = :category', {
      category: 'Service',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('approved.id IS NOT NULL');
  });

  it('prevents employees from reading another employee scorecard trend', async () => {
    const { analytics } = service();
    await expect(
      analytics.scorecardTrends(actor(['EMPLOYEE']), { employeeId: 18 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a cross-company filter even for a company administrator', async () => {
    const { analytics } = service();
    await expect(
      analytics.overview(actor(['COMPANY_ADMIN']), { companyId: 3 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not let a manager filter by another manager', async () => {
    const { analytics } = service();
    await expect(
      analytics.overview(actor(['DEPARTMENT_MANAGER']), { managerId: 99 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects unconfigured time-based risk filtering', async () => {
    const { analytics } = service();
    await expect(
      analytics.overview(actor(['HR_MANAGER']), {
        performanceStatus: 'at_risk',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('denies direct scorecard detail to aggregate-only management', async () => {
    const empty = {} as never;
    const scorecards = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 5,
        companyId: 2,
        subjectType: 'organization',
        subjectId: 2,
      }),
    };
    const access = {
      ensureActorCompanyId: jest.fn().mockReturnValue(2),
      hasCompanyScope: jest.fn().mockReturnValue(true),
    };
    const scorecard = new ScorecardService(
      empty,
      scorecards as never,
      empty,
      empty,
      empty,
      empty,
      empty,
      empty,
      empty,
      empty,
      empty,
      access as never,
    );
    await expect(
      scorecard.get(actor(['MANAGEMENT']), 5),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
