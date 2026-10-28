import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CompanyUserBranchAccess } from '../branches/entities/company-user-branch-access.entity';
import { Branch } from '../branches/entities/branch.entity';
import { CompanyUserDepartmentAccess } from '../departments/entities/company-user-department-access.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { HrAccessService } from './hr-access.service';

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const createRepositoryMock = <T>(): MockRepo<T> => ({
  find: jest.fn(),
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('HrAccessService', () => {
  let service: HrAccessService;
  let branchAccessRepository: MockRepo<CompanyUserBranchAccess>;
  let branchRepository: MockRepo<Branch>;
  let departmentAccessRepository: MockRepo<CompanyUserDepartmentAccess>;
  let departmentRepository: MockRepo<Department>;
  let employeeRepository: MockRepo<Employee>;

  beforeEach(() => {
    branchAccessRepository = createRepositoryMock<CompanyUserBranchAccess>();
    branchRepository = createRepositoryMock<Branch>();
    departmentAccessRepository =
      createRepositoryMock<CompanyUserDepartmentAccess>();
    departmentRepository = createRepositoryMock<Department>();
    employeeRepository = createRepositoryMock<Employee>();

    service = new HrAccessService(
      branchAccessRepository as Repository<CompanyUserBranchAccess>,
      branchRepository as Repository<Branch>,
      departmentAccessRepository as Repository<CompanyUserDepartmentAccess>,
      departmentRepository as Repository<Department>,
      employeeRepository as Repository<Employee>,
    );
  });

  it('returns no branch assignments for a branch-scoped actor with no grants', async () => {
    const actor: AuthenticatedUser = {
      id: 10,
      email: 'branch.manager@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 3,
      companyMembershipId: 27,
      employeeId: 81,
      roles: ['BRANCH_MANAGER'],
      permissions: ['data_scope:branch'],
    };

    branchAccessRepository.find!.mockResolvedValue([]);

    await expect(service.getAccessibleBranchIds(actor)).resolves.toEqual([]);
  });

  it('describes the same union of self, branch, department, and team access for SQL scopes', async () => {
    const actor: AuthenticatedUser = {
      id: 101,
      email: 'scoped.manager@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 3,
      companyMembershipId: 27,
      employeeId: 81,
      roles: [],
      permissions: [
        'data_scope:branch',
        'data_scope:department',
        'manager_team:read',
      ],
    };
    branchAccessRepository.find!.mockResolvedValue([{ branch_id: 4 }]);
    branchRepository.find!.mockResolvedValue([{ id: 4 }]);
    departmentAccessRepository.find!.mockResolvedValue([{ department_id: 7 }]);
    departmentRepository.find!.mockResolvedValue([{ id: 7 }]);

    await expect(service.getAccessibleEmployeeSqlScope(actor)).resolves.toEqual(
      {
        companyWide: false,
        actorEmployeeId: 81,
        branchIds: [4],
        departmentIds: [7],
        managerEmployeeId: 81,
      },
    );
  });

  it('filters branch grants to the active company', async () => {
    const actor: AuthenticatedUser = {
      id: 18,
      email: 'branch.manager@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 3,
      companyMembershipId: 28,
      employeeId: 82,
      roles: ['BRANCH_MANAGER'],
      permissions: ['data_scope:branch'],
    };
    branchAccessRepository.find!.mockResolvedValue([
      { branch_id: 4 },
      { branch_id: 404 },
    ]);
    branchRepository.find!.mockResolvedValue([{ id: 4 }]);

    await expect(service.getAccessibleBranchIds(actor)).resolves.toEqual([4]);
    expect(branchRepository.find).toHaveBeenCalledWith({
      where: { company_id: 3, id: expect.anything() },
      select: ['id'],
    });
  });

  it('hides departments from another company during direct access checks', async () => {
    const actor: AuthenticatedUser = {
      id: 19,
      email: 'hr@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 3,
      companyMembershipId: 29,
      employeeId: 83,
      roles: ['HR'],
      permissions: ['data_scope:company'],
    };
    departmentRepository.findOne!.mockResolvedValue(null);

    await expect(service.assertCanAccessDepartment(actor, 999)).rejects.toThrow(
      NotFoundException,
    );
    expect(departmentRepository.findOne).toHaveBeenCalledWith({
      where: { id: 999, company_id: 3 },
      select: ['id', 'branch_id'],
    });
  });

  it('combines assigned and managed departments for a department-scoped actor', async () => {
    const actor: AuthenticatedUser = {
      id: 11,
      email: 'department.manager@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 3,
      companyMembershipId: 31,
      employeeId: 94,
      roles: ['DEPARTMENT_MANAGER'],
      permissions: ['data_scope:department'],
    };

    departmentAccessRepository.find!.mockResolvedValue([
      { department_id: 7 },
      { department_id: 9 },
    ]);
    departmentRepository
      .find!.mockResolvedValueOnce([{ id: 12 }])
      .mockResolvedValueOnce([{ id: 9 }]);

    await expect(service.getAccessibleDepartmentIds(actor)).resolves.toEqual([
      9, 12,
    ]);
    expect(departmentRepository.find).toHaveBeenLastCalledWith({
      where: { company_id: 3, id: expect.anything() },
      select: ['id'],
    });
  });

  it('filters stale department grants to the active company', async () => {
    const actor: AuthenticatedUser = {
      id: 111,
      email: 'cross-company-department-scope@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 3,
      companyMembershipId: 32,
      employeeId: 95,
      roles: [],
      permissions: ['data_scope:department'],
    };
    departmentAccessRepository.find!.mockResolvedValue([
      { department_id: 700 },
    ]);
    departmentRepository
      .find!.mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(service.getAccessibleDepartmentIds(actor)).resolves.toEqual(
      [],
    );
    expect(departmentRepository.find).toHaveBeenLastCalledWith({
      where: { company_id: 3, id: expect.anything() },
      select: ['id'],
    });
  });

  it('allows a self-scoped actor to access only their own employee record', async () => {
    const actor: AuthenticatedUser = {
      id: 12,
      email: 'employee@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 5,
      companyMembershipId: 44,
      employeeId: 205,
      roles: ['EMPLOYEE'],
      permissions: ['data_scope:self'],
    };

    await expect(
      service.assertCanAccessEmployee(actor, {
        id: 205,
        primary_branch_id: null,
        department_assignments: [],
        primary_department: null,
        primary_position: null,
      }),
    ).resolves.toBeUndefined();

    await expect(
      service.assertCanAccessEmployee(actor, {
        id: 999,
        primary_branch_id: null,
        department_assignments: [],
        primary_department: null,
        primary_position: null,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns no department assignments for a department-scoped actor with no grants or managed teams', async () => {
    const actor: AuthenticatedUser = {
      id: 13,
      email: 'department.lead@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 6,
      companyMembershipId: 52,
      employeeId: 300,
      roles: ['DEPARTMENT_MANAGER'],
      permissions: ['data_scope:department'],
    };

    departmentAccessRepository.find!.mockResolvedValue([]);
    departmentRepository.find!.mockResolvedValue([]);

    await expect(service.getAccessibleDepartmentIds(actor)).resolves.toEqual(
      [],
    );
  });

  it('includes direct reports for an actor with manager team access', async () => {
    const actor: AuthenticatedUser = {
      id: 14,
      email: 'team.manager@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 6,
      companyMembershipId: 53,
      employeeId: 301,
      roles: ['DEPARTMENT_MANAGER'],
      permissions: ['manager_team:read', 'onboarding_requests:read'],
    };

    const query = jest
      .fn()
      .mockResolvedValue([{ id: '302' }, { id: '303' }, { id: '304' }]);
    (employeeRepository as any).manager = { query };

    await expect(service.getAccessibleEmployeeIds(actor)).resolves.toEqual([
      301, 302, 303, 304,
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([6, 301]);
    expect(query.mock.calls[0][0]).toContain(
      'WITH RECURSIVE accessible_reports',
    );
    expect(query.mock.calls[0][0]).toContain('WHERE child.company_id = $1');
  });

  it('combines multiple assigned branches with the manager and employees in those branches', async () => {
    const actor: AuthenticatedUser = {
      id: 15,
      email: 'regional.manager@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 6,
      companyMembershipId: 54,
      employeeId: 401,
      roles: ['REGIONAL_MANAGER'],
      permissions: ['data_scope:branch'],
    };
    branchAccessRepository.find!.mockResolvedValue([
      { branch_id: 3 },
      { branch_id: 8 },
    ]);
    branchRepository.find!.mockResolvedValue([{ id: 3 }, { id: 8 }]);
    const qb = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ id: '402' }, { id: '403' }]),
    };
    employeeRepository.createQueryBuilder!.mockReturnValue(qb);

    await expect(service.getAccessibleEmployeeIds(actor)).resolves.toEqual([
      401, 402, 403,
    ]);
    expect(qb.where).toHaveBeenCalledWith('employee.company_id = :companyId', {
      companyId: 6,
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      '(employee.primary_branch_id IN (:...branchIds) OR department.branch_id IN (:...branchIds))',
      { branchIds: [3, 8] },
    );
  });

  it('does not include the manager in their own reports when reporting data is circular', async () => {
    const actor: AuthenticatedUser = {
      id: 16,
      email: 'circular.manager@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 6,
      companyMembershipId: 55,
      employeeId: 501,
      roles: ['MANAGER'],
      permissions: ['manager_team:read'],
    };

    const query = jest.fn().mockResolvedValue([{ id: '502' }]);
    (employeeRepository as any).manager = { query };

    await expect(service.getReportingEmployeeIds(actor)).resolves.toEqual([
      502,
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([6, 501]);
    expect(query.mock.calls[0][0]).toContain('id <> $2');
  });

  it('rejects scoped employee resolution without an active company', async () => {
    await expect(
      service.getAccessibleEmployeeIds({
        id: 17,
        email: 'missing-company@example.com',
        scope: 'company',
        userType: 'COMPANY_USER',
        companyMembershipId: 56,
        employeeId: 503,
        roles: [],
        permissions: ['manager_team:read'],
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
