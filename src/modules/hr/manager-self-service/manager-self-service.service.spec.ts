import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ManagerSelfServiceService } from './manager-self-service.service';
import { HrAccessService } from '../shared/hr-access.service';
import { Employee } from '../employees/entities/employee.entity';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceCorrectionRequest } from '../self-service/entities/attendance-correction-request.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { ActionItemsService } from '../action-inbox/action-items.service';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { PerformanceInsightsService } from '../performance/services/performance-insights.service';
import { WorkActivityInsightsService } from '../work-activities/services/work-activity-insights.service';
import { ProbationCase } from '../probation/entities/probation-case.entity';
import { ProbationCaseStatusEnum } from '../probation/enums/probation-case-status.enum';

describe('ManagerSelfServiceService', () => {
  let service: ManagerSelfServiceService;
  let hrAccessService: { getAccessibleEmployeeIds: jest.Mock };
  let employeeRepository: { createQueryBuilder: jest.Mock };
  let attendanceDailySummaryRepository: { createQueryBuilder: jest.Mock };
  let correctionRequestRepository: { createQueryBuilder: jest.Mock };
  let leaveRequestRepository: { createQueryBuilder: jest.Mock };
  let probationCaseRepository: { count: jest.Mock };
  let actionItemsService: { countOpen: jest.Mock };
  let performanceInsightsService: { getManagerSummary: jest.Mock };
  let workActivityInsightsService: { getManagerSummary: jest.Mock };

  const actor: AuthenticatedUser = {
    id: 1,
    email: 'manager@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 10,
    companyMembershipId: 20,
    employeeId: 30,
    roles: [],
    permissions: [],
  };

  const buildQueryBuilder = (result: unknown[]) => {
    const qb: Record<string, jest.Mock> = {
      leftJoinAndSelect: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      skip: jest.fn(),
      take: jest.fn(),
      getManyAndCount: jest.fn().mockResolvedValue([result, result.length]),
    };
    for (const key of [
      'leftJoinAndSelect',
      'where',
      'andWhere',
      'orderBy',
      'addOrderBy',
      'skip',
      'take',
    ]) {
      qb[key].mockReturnValue(qb);
    }
    return qb;
  };

  const buildCountQueryBuilder = (count = 0) => {
    const qb: Record<string, jest.Mock> = {
      select: jest.fn(),
      addSelect: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      getCount: jest.fn().mockResolvedValue(count),
      getRawOne: jest.fn().mockResolvedValue({
        total_records: '0',
        present: '0',
        absent: '0',
        late: '0',
        early_departure: '0',
      }),
    };
    for (const key of ['select', 'addSelect', 'where', 'andWhere']) {
      qb[key].mockReturnValue(qb);
    }
    return qb;
  };

  beforeEach(() => {
    hrAccessService = { getAccessibleEmployeeIds: jest.fn() };
    employeeRepository = { createQueryBuilder: jest.fn() };
    attendanceDailySummaryRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(buildCountQueryBuilder()),
    };
    correctionRequestRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(buildCountQueryBuilder()),
    };
    leaveRequestRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(buildCountQueryBuilder()),
    };
    probationCaseRepository = { count: jest.fn().mockResolvedValue(0) };
    actionItemsService = { countOpen: jest.fn().mockResolvedValue(0) };
    performanceInsightsService = {
      getManagerSummary: jest.fn().mockResolvedValue({
        pending_team_validations: 0,
        published_team_reviews: 0,
      }),
    };
    workActivityInsightsService = {
      getManagerSummary: jest.fn().mockResolvedValue({
        pending_activity_reviews: 0,
      }),
    };

    service = new ManagerSelfServiceService(
      hrAccessService as unknown as HrAccessService,
      employeeRepository as unknown as Repository<Employee>,
      attendanceDailySummaryRepository as unknown as Repository<AttendanceDailySummary>,
      correctionRequestRepository as unknown as Repository<AttendanceCorrectionRequest>,
      leaveRequestRepository as unknown as Repository<LeaveRequest>,
      probationCaseRepository as unknown as Repository<ProbationCase>,
      actionItemsService as unknown as ActionItemsService,
      performanceInsightsService as unknown as PerformanceInsightsService,
      workActivityInsightsService as unknown as WorkActivityInsightsService,
    );
  });

  it('rejects a caller with no employee profile', async () => {
    await expect(
      service.getTeamMembers({ ...actor, employeeId: undefined }, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns an empty page without querying employees when scope resolves to zero access', async () => {
    hrAccessService.getAccessibleEmployeeIds.mockResolvedValue([]);

    const result = await service.getTeamMembers(actor, {});

    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
    expect(employeeRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('scopes the team query to the accessible employee ids returned by HrAccessService', async () => {
    hrAccessService.getAccessibleEmployeeIds.mockResolvedValue([30, 31, 32]);
    const qb = buildQueryBuilder([]);
    employeeRepository.createQueryBuilder.mockReturnValue(qb);

    await service.getTeamMembers(actor, {});

    expect(qb.andWhere).toHaveBeenCalledWith(
      'employee.id IN (:...employeeIds)',
      { employeeIds: [30, 31, 32] },
    );
  });

  it('does not add an employee-id filter for company-wide scope (null)', async () => {
    hrAccessService.getAccessibleEmployeeIds.mockResolvedValue(null);
    const qb = buildQueryBuilder([]);
    employeeRepository.createQueryBuilder.mockReturnValue(qb);

    await service.getTeamMembers(actor, {});

    const scopeCalls = qb.andWhere.mock.calls.filter(
      (call) => call[0] === 'employee.id IN (:...employeeIds)',
    );
    expect(scopeCalls).toHaveLength(0);
  });

  it('exposes probation recommendation capability from pending manager review cases', async () => {
    hrAccessService.getAccessibleEmployeeIds.mockResolvedValue([30, 31]);
    probationCaseRepository.count.mockResolvedValue(2);

    const result = await service.getDashboard(actor, {
      date_from: '2026-09-01',
      date_to: '2026-09-30',
    });

    expect(probationCaseRepository.count).toHaveBeenCalledWith({
      where: {
        companyId: 10,
        managerEmployeeId: 30,
        status: ProbationCaseStatusEnum.MANAGER_REVIEW_PENDING,
      },
    });
    expect(result.capabilities.probation_recommendation).toEqual({
      available: true,
      pending_recommendations: 2,
    });
  });
});
