import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CompanyUserBranchAccess } from '../branches/entities/company-user-branch-access.entity';
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
  let departmentAccessRepository: MockRepo<CompanyUserDepartmentAccess>;
  let departmentRepository: MockRepo<Department>;
  let employeeRepository: MockRepo<Employee>;

  beforeEach(() => {
    branchAccessRepository = createRepositoryMock<CompanyUserBranchAccess>();
    departmentAccessRepository =
      createRepositoryMock<CompanyUserDepartmentAccess>();
    departmentRepository = createRepositoryMock<Department>();
    employeeRepository = createRepositoryMock<Employee>();

    service = new HrAccessService(
      branchAccessRepository as Repository<CompanyUserBranchAccess>,
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
    departmentRepository.find!.mockResolvedValue([{ id: 9 }, { id: 12 }]);

    await expect(service.getAccessibleDepartmentIds(actor)).resolves.toEqual([
      7, 9, 12,
    ]);
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
});
