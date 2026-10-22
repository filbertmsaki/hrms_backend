import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OffboardingWorkflowService } from './offboarding-workflow.service';
import { OffboardingApproval } from '../entities/offboarding-approval.entity';
import { OffboardingApprovalStatusEnum } from '../enums/offboarding-approval-status.enum';
import type { OffboardingWorkflow } from '../entities/offboarding-workflow.entity';
import type { OffboardingWorkflowStep } from '../entities/offboarding-workflow-step.entity';
import type { OffboardingRequest } from '../entities/offboarding-request.entity';
import type { OffboardingTask } from '../entities/offboarding-task.entity';
import type { CompanyUser } from '../../../companies/entities/company-user.entity';
import type { CompanyUserRole } from '../../../companies/entities/company-user-role.entity';
import type { EmployeePosition } from '../../employees/entities/employee-position.entity';
import type { Employee } from '../../employees/entities/employee.entity';
import { OffboardingApproverTypeEnum } from '../enums/offboarding-approver-type.enum';
import { OffboardingRejectedEvent } from '../../notifications/events';

const createRepoMock = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  create: jest.fn((value: unknown) => value),
  save: jest.fn((value: unknown) => value),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('OffboardingWorkflowService.delegateApproval', () => {
  let service: OffboardingWorkflowService;
  let approvalRepository: ReturnType<typeof createRepoMock>;
  let requestRepository: ReturnType<typeof createRepoMock>;
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    approvalRepository = createRepoMock();
    requestRepository = createRepoMock();

    eventEmitter = { emit: jest.fn() };
    service = new OffboardingWorkflowService(
      createRepoMock() as unknown as Repository<OffboardingWorkflow>,
      createRepoMock() as unknown as Repository<OffboardingWorkflowStep>,
      approvalRepository as unknown as Repository<OffboardingApproval>,
      requestRepository as unknown as Repository<OffboardingRequest>,
      createRepoMock() as unknown as Repository<OffboardingTask>,
      createRepoMock() as unknown as Repository<CompanyUser>,
      createRepoMock() as unknown as Repository<CompanyUserRole>,
      createRepoMock() as unknown as Repository<EmployeePosition>,
      createRepoMock() as unknown as Repository<Employee>,
      eventEmitter as unknown as EventEmitter2,
      { get: jest.fn() } as unknown as ConfigService,
    );
  });

  const baseApproval = () => ({
    id: 1,
    offboarding_request_id: 55,
    approver_company_user_id: 90,
    status: OffboardingApprovalStatusEnum.PENDING,
    original_approver_company_user_id: null,
    delegated_from_company_user_id: null,
    delegated_at: null,
    delegation_reason: null,
  });

  it('uses PostgreSQL date syntax for position eligibility', async () => {
    const query = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ company_user_id: 90 }]),
    };
    Object.assign(service, {
      employeePositionRepository: { createQueryBuilder: () => query },
    });
    await expect(
      service.resolveApproverMembershipIds(10, {
        approver_type: OffboardingApproverTypeEnum.POSITION,
        position_id: 3,
      } as OffboardingWorkflowStep),
    ).resolves.toEqual([90]);
    expect(query.andWhere).toHaveBeenCalledWith(
      '(employeePosition.end_date IS NULL OR employeePosition.end_date >= CURRENT_DATE)',
    );
  });

  it('scopes department-manager approvals to the employee reporting manager', async () => {
    const employeeRepo = createRepoMock();
    employeeRepo.findOne.mockResolvedValue({ id: 44, company_user_id: 90 });
    const roleQuery = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ company_user_id: 90 }),
    };
    const roleRepo = createRepoMock();
    roleRepo.createQueryBuilder.mockReturnValue(roleQuery);
    Object.assign(service, {
      employeeRepository: employeeRepo,
      companyUserRoleRepository: roleRepo,
    });

    await expect(
      service.resolveApproverMembershipIds(
        10,
        {
          approver_type: OffboardingApproverTypeEnum.ROLE,
          role_id: 7,
          role: { name: 'DEPARTMENT_MANAGER' },
        } as OffboardingWorkflowStep,
        undefined,
        { id: 55, company_id: 10, reports_to: 44 } as any,
      ),
    ).resolves.toEqual([90]);
    expect(employeeRepo.findOne).toHaveBeenCalledWith({
      where: {
        id: 44,
        company_id: 10,
        employment_status: 'active',
      },
      select: ['id', 'company_user_id'],
    });
    expect(roleQuery.andWhere).toHaveBeenCalledWith(
      'assignment.company_user_id = :membershipId',
      { membershipId: 90 },
    );
  });

  it('does not widen a department-manager step when the employee has no manager', async () => {
    await expect(
      service.resolveApproverMembershipIds(
        10,
        {
          approver_type: OffboardingApproverTypeEnum.ROLE,
          role_id: 7,
          role: { name: 'DEPARTMENT_MANAGER' },
        } as OffboardingWorkflowStep,
        undefined,
        { id: 55, company_id: 10, reports_to: null } as any,
      ),
    ).resolves.toEqual([]);
  });

  it('rejects delegating a non-pending approval', async () => {
    approvalRepository.findOne.mockResolvedValue({
      ...baseApproval(),
      status: OffboardingApprovalStatusEnum.APPROVED,
    });

    await expect(
      service.delegateApproval(55, 1, 90, 91, 'handover', false, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects delegation by someone other than the assigned approver when not elevated', async () => {
    approvalRepository.findOne.mockResolvedValue(baseApproval());

    await expect(
      service.delegateApproval(55, 1, 99, 91, 'handover', false, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows an HR actor with delegate-any to delegate someone else's approval", async () => {
    approvalRepository.findOne.mockResolvedValue(baseApproval());
    requestRepository.findOne.mockResolvedValue({
      id: 55,
      employee: { company_user_id: 12 },
    });

    const result = await service.delegateApproval(
      55,
      1,
      99,
      91,
      'HR reassignment',
      true,
      undefined,
    );

    expect(result.approver_company_user_id).toBe(91);
    expect(result.original_approver_company_user_id).toBe(90);
    expect(result.delegated_from_company_user_id).toBe(90);
  });

  it('blocks assigning the exiting employee as their own approver', async () => {
    approvalRepository.findOne.mockResolvedValue(baseApproval());
    requestRepository.findOne.mockResolvedValue({
      id: 55,
      employee: { company_user_id: 91 },
    });

    await expect(
      service.delegateApproval(55, 1, 90, 91, 'handover', false, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('preserves the original approver across a second delegation', async () => {
    const approval = {
      ...baseApproval(),
      approver_company_user_id: 91,
      original_approver_company_user_id: 90,
    };
    approvalRepository.findOne.mockResolvedValue(approval);
    requestRepository.findOne.mockResolvedValue({
      id: 55,
      employee: { company_user_id: 12 },
    });

    const result = await service.delegateApproval(
      55,
      1,
      91,
      92,
      'second handover',
      false,
      undefined,
    );

    expect(result.original_approver_company_user_id).toBe(90);
    expect(result.delegated_from_company_user_id).toBe(91);
    expect(result.approver_company_user_id).toBe(92);
  });

  it('emits an employee outcome notification with rejection comments', async () => {
    const rejectedRequest = {
      id: 55,
      company_id: 10,
      status: 'rejected',
      last_working_date: '2026-11-30',
      employee: {
        first_name: 'Asha',
        last_name: 'Msuya',
        company_user: { id: 22, user: { email: 'asha@example.com' } },
      },
    };
    requestRepository.findOne.mockResolvedValue(rejectedRequest);
    approvalRepository.findOne.mockResolvedValue({
      comments: 'Please attach the required supporting documents.',
    });

    await (service as any).emitOffboardingOutcome(rejectedRequest);

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      OffboardingRejectedEvent.EVENT,
      expect.objectContaining({
        employeeEmail: 'asha@example.com',
        employeeCompanyUserId: 22,
        reason: 'Please attach the required supporting documents.',
        offboardingRequestId: 55,
      }),
    );
  });
});
