import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { LeaveWorkflowService } from './leave-workflow.service';
import { LeaveApprovalWorkflow } from '../entities/leave-approval-workflow.entity';
import { LeaveApprovalWorkflowStep } from '../entities/leave-approval-workflow-step.entity';
import { LeaveRequestApproval } from '../entities/leave-request-approval.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { CompanyUserRole } from '../../../companies/entities/company-user-role.entity';
import { EmployeePosition } from '../../employees/entities/employee-position.entity';
import { Department } from '../../departments/entities/department.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveApprovalActionEnum } from '../enums/leave-approval-action.enum';
import { LeaveApprovalStatusEnum } from '../enums/leave-approval-status.enum';
import { LeaveApproverTypeEnum } from '../enums/leave-approver-type.enum';
import { LeaveStatusEnum } from '../enums/leave-status.enum';

type MockRepo = Record<string, jest.Mock>;

const createRepositoryMock = (): MockRepo => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn((value: unknown) => Promise.resolve(value)),
  create: jest.fn((value: unknown) => value),
});

describe('LeaveWorkflowService', () => {
  let service: LeaveWorkflowService;
  let workflowRepository: MockRepo;
  let workflowStepRepository: MockRepo;
  let leaveRequestApprovalRepository: MockRepo;
  let leaveRequestRepository: MockRepo;
  let companyUserRepository: MockRepo;
  let companyUserRoleRepository: MockRepo;
  let employeePositionRepository: MockRepo;
  let departmentRepository: MockRepo;
  let employeeRepository: MockRepo;

  const HR_ROLE_ID = 1;
  const COMPANY_ID = 10;

  const buildWorkflow = () => ({
    id: 1,
    name: 'Default Leave Approval Workflow',
    company_id: COMPANY_ID,
  });

  const buildSteps = () => [
    {
      id: 1,
      workflow_id: 1,
      approval_level: 1,
      approver_type: LeaveApproverTypeEnum.ROLE,
      role_id: 99,
    },
    {
      id: 2,
      workflow_id: 1,
      approval_level: 2,
      approver_type: LeaveApproverTypeEnum.ROLE,
      role_id: HR_ROLE_ID,
    },
  ];

  const buildEmployee = (overrides: Partial<Employee> = {}): Employee =>
    ({
      id: 501,
      company_user_id: 44,
      primary_department_id: 2,
      reports_to: null,
      ...overrides,
    }) as Employee;

  const roleAssignmentQueryBuilder = (companyUserIds: number[]) => ({
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest
      .fn()
      .mockResolvedValue(companyUserIds.map((id) => ({ company_user_id: id }))),
  });

  beforeEach(() => {
    workflowRepository = createRepositoryMock();
    workflowStepRepository = createRepositoryMock();
    leaveRequestApprovalRepository = createRepositoryMock();
    leaveRequestRepository = createRepositoryMock();
    companyUserRepository = createRepositoryMock();
    companyUserRoleRepository = createRepositoryMock();
    employeePositionRepository = createRepositoryMock();
    departmentRepository = createRepositoryMock();
    employeeRepository = createRepositoryMock();

    workflowRepository.findOne.mockResolvedValue(buildWorkflow());
    workflowStepRepository.find.mockResolvedValue(buildSteps());
    companyUserRoleRepository.createQueryBuilder = jest
      .fn()
      .mockReturnValue(roleAssignmentQueryBuilder([77]));

    service = new LeaveWorkflowService(
      workflowRepository as unknown as Repository<LeaveApprovalWorkflow>,
      workflowStepRepository as unknown as Repository<LeaveApprovalWorkflowStep>,
      leaveRequestApprovalRepository as unknown as Repository<LeaveRequestApproval>,
      leaveRequestRepository as unknown as Repository<LeaveRequest>,
      companyUserRepository as unknown as Repository<CompanyUser>,
      companyUserRoleRepository as unknown as Repository<CompanyUserRole>,
      employeePositionRepository as unknown as Repository<EmployeePosition>,
      departmentRepository as unknown as Repository<Department>,
      employeeRepository as unknown as Repository<Employee>,
      { emit: jest.fn() } as unknown as EventEmitter2,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
    );
  });

  describe('initializeWorkflowForRequest', () => {
    it('creates a pending department-manager approval and sets PENDING_DEPARTMENT_MANAGER', async () => {
      departmentRepository.findOne.mockResolvedValue({
        id: 2,
        company_id: COMPANY_ID,
        manager_employee_id: 900,
      });
      employeeRepository.findOne.mockResolvedValue({
        id: 900,
        company_user_id: 12,
      });

      const leaveRequest = {
        id: 55,
        leave_type_id: 7,
        approval_cycle: 1,
        current_approval_level: 0,
        status: LeaveStatusEnum.DRAFT,
      } as LeaveRequest;

      await service.initializeWorkflowForRequest(
        COMPANY_ID,
        leaveRequest,
        buildEmployee(),
      );

      expect(leaveRequestApprovalRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          approval_level: 1,
          approval_cycle: 1,
          approver_company_user_id: 12,
          status: LeaveApprovalStatusEnum.PENDING,
        }),
      );
      expect(leaveRequest.status).toBe(
        LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
      );
      expect(leaveRequest.current_approval_level).toBe(1);
    });

    it('skips to HR when the department has no configured manager', async () => {
      departmentRepository.findOne.mockResolvedValue({
        id: 2,
        company_id: COMPANY_ID,
        manager_employee_id: null,
      });

      const leaveRequest = {
        id: 56,
        leave_type_id: 7,
        approval_cycle: 1,
        current_approval_level: 0,
        status: LeaveStatusEnum.DRAFT,
      } as LeaveRequest;

      await service.initializeWorkflowForRequest(
        COMPANY_ID,
        leaveRequest,
        buildEmployee(),
      );

      expect(leaveRequest.status).toBe(LeaveStatusEnum.PENDING_HR);
      expect(leaveRequest.current_approval_level).toBe(2);
    });

    it('escalates to reports_to when the requester is the department manager', async () => {
      departmentRepository.findOne.mockResolvedValue({
        id: 2,
        company_id: COMPANY_ID,
        manager_employee_id: 501,
      });
      employeeRepository.findOne.mockResolvedValue({
        id: 800,
        company_user_id: 33,
      });

      const leaveRequest = {
        id: 57,
        leave_type_id: 7,
        approval_cycle: 1,
        current_approval_level: 0,
        status: LeaveStatusEnum.DRAFT,
      } as LeaveRequest;

      await service.initializeWorkflowForRequest(
        COMPANY_ID,
        leaveRequest,
        buildEmployee({ reports_to: 800 }),
      );

      expect(leaveRequestApprovalRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          approval_level: 1,
          approver_company_user_id: 33,
        }),
      );
      expect(leaveRequest.status).toBe(
        LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
      );
    });

    it('skips to HR when requester is department manager with no reports_to', async () => {
      departmentRepository.findOne.mockResolvedValue({
        id: 2,
        company_id: COMPANY_ID,
        manager_employee_id: 501,
      });

      const leaveRequest = {
        id: 58,
        leave_type_id: 7,
        approval_cycle: 1,
        current_approval_level: 0,
        status: LeaveStatusEnum.DRAFT,
      } as LeaveRequest;

      await service.initializeWorkflowForRequest(
        COMPANY_ID,
        leaveRequest,
        buildEmployee({ reports_to: null }),
      );

      expect(leaveRequest.status).toBe(LeaveStatusEnum.PENDING_HR);
      expect(leaveRequest.current_approval_level).toBe(2);
    });

    it('throws when the resolved workflow does not have exactly 2 steps', async () => {
      workflowStepRepository.find.mockResolvedValue([buildSteps()[0]]);
      departmentRepository.findOne.mockResolvedValue({
        id: 2,
        company_id: COMPANY_ID,
        manager_employee_id: null,
      });

      const leaveRequest = {
        id: 59,
        leave_type_id: 7,
        approval_cycle: 1,
        current_approval_level: 0,
        status: LeaveStatusEnum.DRAFT,
      } as LeaveRequest;

      await expect(
        service.initializeWorkflowForRequest(
          COMPANY_ID,
          leaveRequest,
          buildEmployee(),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('applyApprovalAction', () => {
    const buildApproval = (overrides = {}) => ({
      id: 1,
      leave_request_id: 55,
      approval_level: 1,
      approval_cycle: 1,
      approver_company_user_id: 12,
      status: LeaveApprovalStatusEnum.PENDING,
      ...overrides,
    });

    beforeEach(() => {
      leaveRequestRepository.findOne.mockResolvedValue({
        id: 55,
        current_approval_level: 1,
        approval_cycle: 1,
        status: LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
        employee: { id: 501, company_user_id: 44 },
      });
    });

    it('moves PENDING_DEPARTMENT_MANAGER -> PENDING_HR on department-manager approve', async () => {
      leaveRequestApprovalRepository.find.mockResolvedValue([buildApproval()]);
      leaveRequestRepository.findOne
        .mockResolvedValueOnce({
          id: 55,
          current_approval_level: 1,
          approval_cycle: 1,
          status: LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
          employee: { id: 501, company_user_id: 44 },
        })
        .mockResolvedValueOnce({
          id: 55,
          employee: {
            first_name: 'A',
            last_name: 'B',
            company_user: { user: { email: 'a@b.com' } },
          },
          leave_type: { name: 'Annual' },
          status: LeaveStatusEnum.PENDING_HR,
          current_approval_level: 2,
          approval_cycle: 1,
        });

      const result = await service.applyApprovalAction(55, 12, {
        action: LeaveApprovalActionEnum.APPROVE,
      });

      expect(result.status).toBe(LeaveStatusEnum.PENDING_HR);
      expect(result.current_approval_level).toBe(2);
    });

    it('rejects when the requester tries to approve their own request', async () => {
      leaveRequestRepository.findOne.mockResolvedValue({
        id: 55,
        current_approval_level: 1,
        approval_cycle: 1,
        status: LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
        employee: { id: 501, company_user_id: 44 },
      });

      await expect(
        service.applyApprovalAction(55, 44, {
          action: LeaveApprovalActionEnum.APPROVE,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects acting on the HR step before department-manager approval', async () => {
      leaveRequestApprovalRepository.find.mockResolvedValue([]);

      await expect(
        service.applyApprovalAction(55, 77, {
          action: LeaveApprovalActionEnum.APPROVE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a second action on an already-decided step', async () => {
      leaveRequestApprovalRepository.find.mockResolvedValue([]);

      await expect(
        service.applyApprovalAction(55, 12, {
          action: LeaveApprovalActionEnum.APPROVE,
        }),
      ).rejects.toThrow('No pending approval at the current level');
    });

    it('sets RETURNED_FOR_CORRECTION and returned_at/return_reason on return action', async () => {
      leaveRequestApprovalRepository.find.mockResolvedValue([buildApproval()]);
      const leaveRequest = {
        id: 55,
        current_approval_level: 1,
        approval_cycle: 1,
        status: LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
        employee: { id: 501, company_user_id: 44 },
      };
      leaveRequestRepository.findOne
        .mockResolvedValueOnce(leaveRequest)
        .mockResolvedValueOnce({
          ...leaveRequest,
          employee: {
            first_name: 'A',
            last_name: 'B',
            company_user: { user: { email: 'a@b.com' } },
          },
          leave_type: { name: 'Annual' },
          return_reason: 'Missing attachment',
        });

      const result = await service.applyApprovalAction(55, 12, {
        action: LeaveApprovalActionEnum.RETURN_FOR_CORRECTION,
        comments: 'Missing attachment',
      });

      expect(result.status).toBe(LeaveStatusEnum.RETURNED_FOR_CORRECTION);
      expect(result.return_reason).toBe('Missing attachment');
      expect(result.returned_at).toBeInstanceOf(Date);
    });

    it('sets REJECTED and rejection_reason on reject action', async () => {
      leaveRequestApprovalRepository.find
        .mockResolvedValueOnce([buildApproval()])
        .mockResolvedValueOnce([]);
      const leaveRequest = {
        id: 55,
        current_approval_level: 1,
        approval_cycle: 1,
        status: LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
        employee: { id: 501, company_user_id: 44 },
      };
      leaveRequestRepository.findOne
        .mockResolvedValueOnce(leaveRequest)
        .mockResolvedValueOnce({
          ...leaveRequest,
          employee: {
            first_name: 'A',
            last_name: 'B',
            company_user: { user: { email: 'a@b.com' } },
          },
          leave_type: { name: 'Annual' },
          status: LeaveStatusEnum.REJECTED,
          rejection_reason: 'Not eligible',
        });

      const result = await service.applyApprovalAction(55, 12, {
        action: LeaveApprovalActionEnum.REJECT,
        comments: 'Not eligible',
      });

      expect(result.status).toBe(LeaveStatusEnum.REJECTED);
      expect(result.rejection_reason).toBe('Not eligible');
    });
  });
});
