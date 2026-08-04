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

describe('ManagerSelfServiceService', () => {
  let service: ManagerSelfServiceService;
  let hrAccessService: { getAccessibleEmployeeIds: jest.Mock };
  let employeeRepository: { createQueryBuilder: jest.Mock };

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

  beforeEach(() => {
    hrAccessService = { getAccessibleEmployeeIds: jest.fn() };
    employeeRepository = { createQueryBuilder: jest.fn() };

    service = new ManagerSelfServiceService(
      hrAccessService as unknown as HrAccessService,
      employeeRepository as unknown as Repository<Employee>,
      {} as Repository<AttendanceDailySummary>,
      {} as Repository<AttendanceCorrectionRequest>,
      {} as Repository<LeaveRequest>,
      {} as unknown as ActionItemsService,
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
});
