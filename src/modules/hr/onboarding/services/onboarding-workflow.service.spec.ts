import { OnboardingWorkflowService } from './onboarding-workflow.service';
import { OnboardingWorkflowStep } from '../entities/onboarding-workflow-step.entity';
import { OnboardingRequest } from '../entities/onboarding-request.entity';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { CompanyUserRole } from '../../../companies/entities/company-user-role.entity';
import { EmployeeDepartment } from '../../employees/entities/employee-department.entity';
import { EntityManager } from 'typeorm';
import { OnboardingApproval } from '../entities/onboarding-approval.entity';
import { OnboardingApprovalStatusEnum } from '../enums/onboarding-approval-status.enum';
import { OnboardingRequestStatusEnum } from '../enums/onboarding-request-status.enum';

describe('OnboardingWorkflowService approver eligibility', () => {
  const step = {
    id: 11,
    step_order: 1,
    name: 'HR Document Collection',
    is_required: true,
    assigned_user_id: null,
    assigned_role_id: null,
    assigned_department_id: null,
  } as OnboardingWorkflowStep;
  let service: OnboardingWorkflowService;
  let membershipRepository: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let roleQuery: Record<string, jest.Mock>;
  let departmentQuery: Record<string, jest.Mock>;

  beforeEach(() => {
    const query = () => ({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () => []),
      getOne: jest.fn(async () => null),
    });
    roleQuery = query();
    departmentQuery = query();
    membershipRepository = {
      findOne: jest.fn(async () => null),
      createQueryBuilder: jest.fn(() => departmentQuery),
    };
    service = Object.assign(
      Object.create(OnboardingWorkflowService.prototype),
      {
        companyUserRepository: membershipRepository,
        companyUserRoleRepository: {
          createQueryBuilder: jest.fn(() => roleQuery),
        },
      },
    );
  });

  it('accepts an explicitly assigned active company user without requiring a role', async () => {
    membershipRepository.findOne.mockResolvedValue({ id: 26 });
    expect(
      await service.resolveApproverMembershipIds(10, {
        ...step,
        assigned_user_id: 26,
        assigned_role_id: 11,
      }),
    ).toEqual([26]);
    expect(membershipRepository.findOne).toHaveBeenCalledWith({
      where: { id: 26, company_id: 10, status: 'active' },
      select: ['id'],
    });
    expect(roleQuery.getRawMany).not.toHaveBeenCalled();
  });

  it('rejects a missing, inactive or foreign company membership', async () => {
    expect(
      await service.resolveApproverMembershipIds(10, {
        ...step,
        assigned_user_id: 26,
      }),
    ).toEqual([]);
  });

  it('uses active role members in the company when the assigned user is unavailable', async () => {
    roleQuery.getRawMany.mockResolvedValue([{ company_user_id: '27' }]);
    expect(
      await service.resolveApproverMembershipIds(10, {
        ...step,
        assigned_user_id: 26,
        assigned_role_id: 7,
      }),
    ).toEqual([27]);
    expect(roleQuery.innerJoin).toHaveBeenCalledWith(
      CompanyUser,
      'membership',
      expect.stringContaining(
        'membership.company_id = :companyId AND membership.status = :status',
      ),
      { companyId: 10, status: 'active' },
    );
    expect(roleQuery.where).toHaveBeenCalledWith(
      'assignment.role_id = :roleId',
      { roleId: 7 },
    );
  });

  it('assigns a department step to every active department member with an active membership', async () => {
    departmentQuery.getRawMany.mockResolvedValue([{ id: '28' }, { id: '29' }]);
    expect(
      await service.resolveApproverMembershipIds(10, {
        ...step,
        assigned_department_id: 5,
      }),
    ).toEqual([28, 29]);
    expect(departmentQuery.innerJoin).toHaveBeenCalledWith(
      EmployeeDepartment,
      'departmentAssignment',
      'departmentAssignment.employee_id = employee.id',
    );
    expect(departmentQuery.where).toHaveBeenCalledWith(
      'membership.company_id = :companyId',
      { companyId: 10 },
    );
    expect(departmentQuery.andWhere).toHaveBeenCalledWith(
      'membership.status = :status',
      { status: 'active' },
    );
    expect(departmentQuery.andWhere).toHaveBeenCalledWith(
      'department.company_id = :companyId',
      { companyId: 10 },
    );
    expect(departmentQuery.andWhere).toHaveBeenCalledWith(
      'employee.employment_status = :employmentStatus',
      { employmentStatus: 'active' },
    );
    expect(departmentQuery.andWhere).toHaveBeenCalledWith(
      'department.id = :departmentId',
      { departmentId: 5 },
    );
  });

  it('reports all required failures, including later steps, and excludes optional steps', async () => {
    const result = await service.prepareApprovers(10, [
      { ...step, assigned_role_id: 7 },
      { ...step, id: 12, step_order: 2, assigned_user_id: 26 },
      { ...step, id: 13, step_order: 3, assigned_department_id: 5 },
      { ...step, id: 14, step_order: 4, is_required: false },
    ]);
    expect(result.failures).toEqual([
      { ...step, assigned_role_id: 7, is_required: undefined },
      {
        ...step,
        id: 12,
        step_order: 2,
        assigned_user_id: 26,
        is_required: undefined,
      },
      {
        ...step,
        id: 13,
        step_order: 3,
        assigned_department_id: 5,
        is_required: undefined,
      },
    ]);
  });

  it('checks every step before persisting any approvals', async () => {
    const save = jest.fn();
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === OnboardingWorkflowStep)
          return {
            find: async () => [
              { ...step, assigned_user_id: 26 },
              { ...step, id: 12, step_order: 2, assigned_role_id: 7 },
            ],
          };
        if (entity === CompanyUser)
          return { findOne: async () => ({ id: 26 }) };
        if (entity === CompanyUserRole)
          return { createQueryBuilder: () => roleQuery };
        return { save };
      }),
    } as unknown as EntityManager;
    Object.assign(service, {
      resolveWorkflow: jest.fn(async () => ({ id: 1 })),
    });
    await expect(
      service.initializeApprovalsForRequest(
        10,
        { id: 55 } as OnboardingRequest,
        1,
        manager,
      ),
    ).rejects.toThrow(
      'Required workflow step at order 2 has no eligible approver',
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('recognizes the assigned approver when an integer membership ID is returned as a string', async () => {
    const request = {
      id: 55,
      status: OnboardingRequestStatusEnum.IN_REVIEW,
      current_approval_level: 1,
      rejection_reason: null,
    } as OnboardingRequest;
    const approval = {
      id: 71,
      onboarding_request_id: 55,
      approval_level: 1,
      approver_company_user_id: '26',
      status: OnboardingApprovalStatusEnum.PENDING,
      comments: null,
      signature_url: null,
      acted_at: null,
    } as unknown as OnboardingApproval;
    const requestRepository = {
      findOne: jest.fn().mockResolvedValue(request),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const approvalRepository = {
      find: jest
        .fn()
        .mockResolvedValueOnce([approval])
        .mockResolvedValueOnce([]),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === OnboardingRequest) return requestRepository;
        if (entity === OnboardingApproval) return approvalRepository;
        throw new Error(`Unexpected repository: ${entity?.name}`);
      }),
    } as unknown as EntityManager;
    Object.assign(service, {
      emitOnboardingOutcome: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.applyApprovalAction(55, 26, { approve: true }, manager),
    ).resolves.toMatchObject({
      current_approval_level: 0,
      status: OnboardingRequestStatusEnum.IN_PROGRESS,
    });
    expect(approval.status).toBe(OnboardingApprovalStatusEnum.APPROVED);
  });
});
