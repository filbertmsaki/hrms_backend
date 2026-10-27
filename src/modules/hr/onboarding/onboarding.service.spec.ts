import { DataSource, EntityManager, Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
jest.mock('digest-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));
import { OnboardingService } from './onboarding.service';
import { OnboardingWorkflow } from './entities/onboarding-workflow.entity';
import { OnboardingWorkflowStep } from './entities/onboarding-workflow-step.entity';
import { OnboardingRequest } from './entities/onboarding-request.entity';
import { OnboardingTask } from './entities/onboarding-task.entity';
import { OnboardingApproval } from './entities/onboarding-approval.entity';
import { OnboardingAuditLog } from './entities/onboarding-audit-log.entity';
import { OnboardingNumberSequence } from './entities/onboarding-number-sequence.entity';
import { Document } from '../documents/entities/document.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeBankAccount } from '../employees/entities/employee-bank-account.entity';
import { EmployeePayrollProfile } from '../payroll/entities/employee-payroll-profile.entity';
import {
  EmployeeCompensationVersion,
  EmployeeCompensationVersionStatusEnum,
} from '../employee-movements/entities/employee-compensation-version.entity';
import {
  EmploymentContract,
  EmploymentContractStatus,
} from '../contracts/entities/employment-contract.entity';
import { Department } from '../departments/entities/department.entity';
import { Branch } from '../branches/entities/branch.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { CompanyUserRole } from '../../companies/entities/company-user-role.entity';
import { Role } from '../../roles/entities/role.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { OnboardingAuditService } from './services/onboarding-audit.service';
import { OnboardingWorkflowService } from './services/onboarding-workflow.service';
import { LeaveBalanceService } from '../leave/services/leave-balance.service';
import { LeaveType } from '../leave/entities/leave-type.entity';
import { LeaveRecordStatusEnum } from '../leave/enums/leave-record-status.enum';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { OnboardingRequestStatusEnum } from './enums/onboarding-request-status.enum';
import { OnboardingTaskStatusEnum } from './enums/onboarding-task-status.enum';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CompanyUserBranchAccess } from '../branches/entities/company-user-branch-access.entity';
import { ShiftSchedule } from '../attendance/shift/shift-schedules/entities/shift-schedule.entity';
import { EmployeeTimetable } from '../attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { EmployeeDeviceAssignment } from '../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { ShiftSchedulesService } from '../attendance/shift/shift-schedules/shift-schedules.service';
import { EmployeeTimetablesService } from '../attendance/timetable/employee-timetables/employee-timetables.service';
import { EmployeeDeviceAssignmentsService } from '../../access-control/employee-device-assignments/service/employee-device-assignments.service';
import { OnboardingAttendanceModeEnum } from './enums/onboarding-attendance-mode.enum';
import { OnboardingStepTypeEnum } from './enums/onboarding-step-type.enum';
import { FilesService } from '../../files/files.service';
import { ProbationService } from '../probation/probation.service';
import { OnboardingProvisioningOperation } from './entities/onboarding-provisioning-operation.entity';
import { OnboardingProvisioningOperationStatusEnum as ProvisioningStatus } from './enums/onboarding-provisioning-operation-status.enum';

type MockRepo = Record<string, jest.Mock>;

const createRepositoryMock = <T>(): MockRepo => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  remove: jest.fn(),
  create: jest.fn((value: T) => value),
  save: jest.fn((value: T) => Promise.resolve(value)),
});

describe('OnboardingService', () => {
  let service: OnboardingService;
  let onboardingWorkflowRepository: MockRepo;
  let onboardingRequestRepository: MockRepo;
  let onboardingTaskRepository: MockRepo;
  let onboardingApprovalRepository: MockRepo;
  let employeeRepository: MockRepo;
  let documentRepository: MockRepo;
  let companyUserRepository: MockRepo;
  let dataSource: { transaction: jest.Mock };
  let leaveBalanceService: {
    getFiscalYearFromDate: jest.Mock;
    ensureBalanceForEmployee: jest.Mock;
  };
  let hrAccessService: {
    assertCompanyScopedActor: jest.Mock;
    assertCanAccessEmployee: jest.Mock;
    getAccessibleEmployeeIds: jest.Mock;
  };
  let onboardingAuditService: { log: jest.Mock };
  let onboardingWorkflowService: {
    resolveWorkflow: jest.Mock;
    prepareApprovers: jest.Mock;
    initializeApprovalsForRequest: jest.Mock;
  };
  let filesService: { savePrivateBase64File: jest.Mock };
  let shiftSchedulesService: { create: jest.Mock };
  let employeeTimetablesService: { create: jest.Mock };
  let employeeDeviceAssignmentsService: { assignDevices: jest.Mock };
  let probationService: { ensureCaseForEmployee: jest.Mock };
  let actor: AuthenticatedUser;

  beforeEach(() => {
    onboardingWorkflowRepository = createRepositoryMock<OnboardingWorkflow>();
    const onboardingWorkflowStepRepository =
      createRepositoryMock<OnboardingWorkflowStep>();
    onboardingRequestRepository = createRepositoryMock<OnboardingRequest>();
    onboardingTaskRepository = createRepositoryMock<OnboardingTask>();
    onboardingApprovalRepository = createRepositoryMock<OnboardingApproval>();
    const onboardingAuditLogRepository =
      createRepositoryMock<OnboardingAuditLog>();
    documentRepository = createRepositoryMock<Document>();
    employeeRepository = createRepositoryMock<Employee>();
    const departmentRepository = createRepositoryMock<Department>();
    const branchRepository = createRepositoryMock<Branch>();
    companyUserRepository = createRepositoryMock<CompanyUser>();
    const companyUserRoleRepository = createRepositoryMock<CompanyUserRole>();
    const branchAccessRepository =
      createRepositoryMock<CompanyUserBranchAccess>();
    const roleRepository = createRepositoryMock<Role>();
    const shiftScheduleRepository = createRepositoryMock<ShiftSchedule>();
    const employeeTimetableRepository =
      createRepositoryMock<EmployeeTimetable>();
    const employeeDeviceAssignmentRepository =
      createRepositoryMock<EmployeeDeviceAssignment>();

    dataSource = {
      transaction: jest.fn(),
    };
    leaveBalanceService = {
      getFiscalYearFromDate: jest.fn(() => '2026'),
      ensureBalanceForEmployee: jest.fn(),
    };
    hrAccessService = {
      assertCompanyScopedActor: jest.fn(),
      assertCanAccessEmployee: jest.fn(),
      getAccessibleEmployeeIds: jest.fn().mockResolvedValue(null),
    };
    onboardingAuditService = {
      log: jest.fn(),
    };
    onboardingWorkflowService = {
      resolveWorkflow: jest.fn(
        async (_companyId: number, workflowId?: number) => ({
          id: workflowId ?? 91,
        }),
      ),
      prepareApprovers: jest.fn(),
      initializeApprovalsForRequest: jest.fn(),
    };
    filesService = {
      savePrivateBase64File: jest.fn(),
    };
    shiftSchedulesService = {
      create: jest.fn(),
    };
    employeeTimetablesService = {
      create: jest.fn(),
    };
    employeeDeviceAssignmentsService = {
      assignDevices: jest.fn(),
    };
    probationService = {
      ensureCaseForEmployee: jest.fn(),
    };

    actor = {
      id: 1,
      email: 'hr@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 10,
      companyMembershipId: 90,
      roles: [],
      permissions: [],
    };

    service = new OnboardingService(
      dataSource as unknown as DataSource,
      onboardingWorkflowRepository as unknown as Repository<OnboardingWorkflow>,
      onboardingWorkflowStepRepository as unknown as Repository<OnboardingWorkflowStep>,
      onboardingRequestRepository as unknown as Repository<OnboardingRequest>,
      onboardingTaskRepository as unknown as Repository<OnboardingTask>,
      onboardingApprovalRepository as unknown as Repository<OnboardingApproval>,
      onboardingAuditLogRepository as unknown as Repository<OnboardingAuditLog>,
      documentRepository as unknown as Repository<Document>,
      employeeRepository as unknown as Repository<Employee>,
      departmentRepository as unknown as Repository<Department>,
      branchRepository as unknown as Repository<Branch>,
      companyUserRepository as unknown as Repository<CompanyUser>,
      companyUserRoleRepository as unknown as Repository<CompanyUserRole>,
      branchAccessRepository as unknown as Repository<CompanyUserBranchAccess>,
      roleRepository as unknown as Repository<Role>,
      shiftScheduleRepository as unknown as Repository<ShiftSchedule>,
      employeeTimetableRepository as unknown as Repository<EmployeeTimetable>,
      employeeDeviceAssignmentRepository as unknown as Repository<EmployeeDeviceAssignment>,
      hrAccessService as unknown as HrAccessService,
      onboardingAuditService as unknown as OnboardingAuditService,
      onboardingWorkflowService as unknown as OnboardingWorkflowService,
      leaveBalanceService as unknown as LeaveBalanceService,
      shiftSchedulesService as unknown as ShiftSchedulesService,
      employeeTimetablesService as unknown as EmployeeTimetablesService,
      employeeDeviceAssignmentsService as unknown as EmployeeDeviceAssignmentsService,
      { emit: jest.fn() } as unknown as EventEmitter2,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      filesService as unknown as FilesService,
      probationService as unknown as ProbationService,
    );
  });

  describe('HR readiness overview', () => {
    const queryMock = (rows: unknown[]) => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    });
    it('applies company and employee access restrictions before evaluating readiness', async () => {
      const query = queryMock([
        {
          id: 17,
          employee_id: 5,
          status: 'in_progress',
          tasks: [],
          approvals: [],
          employee: { first_name: 'Amina' },
        },
      ]);
      onboardingRequestRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(query);
      hrAccessService.getAccessibleEmployeeIds.mockResolvedValue([5]);
      const readiness = jest
        .spyOn(service as any, 'getPayrollAndContractReadiness')
        .mockResolvedValue(['TIN']);
      const result = await service.getOverview(10, 12, actor);
      expect(query.where).toHaveBeenCalledWith(
        'request.company_id = :companyId',
        { companyId: 10 },
      );
      expect(query.andWhere).toHaveBeenCalledWith(
        'request.employee_id IN (:...accessibleIds)',
        { accessibleIds: [5] },
      );
      expect(query.andWhere).toHaveBeenCalledWith('request.id > :after', {
        after: 12,
      });
      expect(query.take).toHaveBeenCalledWith(50);
      expect(readiness).toHaveBeenCalledWith(10, 5, undefined);
      expect(result.data[0].stage).toBe('Employment & payroll');
      expect(result.next_cursor).toBeNull();
    });
    it('does not load payroll or requests for an actor with no employee access', async () => {
      const query = queryMock([]);
      onboardingRequestRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(query);
      hrAccessService.getAccessibleEmployeeIds.mockResolvedValue([]);
      const readiness = jest.spyOn(
        service as any,
        'getPayrollAndContractReadiness',
      );
      expect(await service.getOverview(10, 0, actor)).toEqual({
        data: [],
        next_cursor: null,
      });
      expect(query.getMany).not.toHaveBeenCalled();
      expect(readiness).not.toHaveBeenCalled();
    });
    it('notifies HR only for ready employees, isolates failures, and never activates', async () => {
      const query = queryMock([
        { id: 1, company_id: 10, onboarding_no: 'ONB-1' },
        { id: 2, company_id: 20 },
        { id: 3, company_id: 20 },
      ]);
      onboardingRequestRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(query);
      dataSource.transaction.mockImplementation((callback) => callback({}));
      jest
        .spyOn(service as any, 'loadActivationReadiness')
        .mockResolvedValueOnce({ ready_to_activate: true })
        .mockRejectedValueOnce(new Error('Unavailable'))
        .mockResolvedValueOnce({ ready_to_activate: false });
      const emitAsync = jest.fn().mockResolvedValue([]);
      (service as any).eventEmitter.emitAsync = emitAsync;
      const activate = jest.spyOn(service, 'completeOnboarding');
      await service.notifyActivationReadyRequests();
      expect(emitAsync).toHaveBeenCalledTimes(1);
      expect(emitAsync).toHaveBeenCalledWith(
        'onboarding.activation_ready',
        expect.objectContaining({ companyId: 10, onboardingRequestId: 1 }),
      );
      expect(activate).not.toHaveBeenCalled();
    });
  });

  it('rejects direct completion of a later step inside the transaction', async () => {
    const first = {
      id: 1,
      status: 'pending',
      is_required: true,
      workflow_step: { step_order: 1 },
    };
    const next = {
      id: 2,
      status: 'pending',
      task_type: 'general',
      workflow_step: { step_order: 2 },
    };
    const request = {
      id: 55,
      status: 'in_progress',
      employee: {},
      tasks: [first, next],
      approvals: [],
    };
    onboardingRequestRepository.findOne.mockResolvedValue(request);
    onboardingRequestRepository.findOneOrFail.mockResolvedValue(request);
    onboardingTaskRepository.findOne.mockResolvedValue(next);
    onboardingTaskRepository.findOneOrFail.mockResolvedValue(next);
    Object.assign(service, { assertCanCompleteTask: jest.fn() });
    dataSource.transaction.mockImplementation(async (callback) =>
      callback({
        getRepository: (entity: unknown) =>
          entity === OnboardingTask
            ? onboardingTaskRepository
            : entity === OnboardingRequest
              ? onboardingRequestRepository
              : documentRepository,
      }),
    );
    await expect(service.completeTask(10, 55, 2, {}, actor)).rejects.toThrow(
      'preceding workflow steps',
    );
    expect(onboardingTaskRepository.save).not.toHaveBeenCalled();
    expect(onboardingRequestRepository.findOneOrFail).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });

  it('notifies only the task that becomes ready after the previous step completes', async () => {
    const first = {
      id: 1,
      status: 'pending',
      is_required: true,
      workflow_step: { step_order: 1 },
    };
    const next = {
      id: 2,
      status: 'pending',
      is_required: true,
      workflow_step: { step_order: 2 },
    };
    const later = {
      id: 3,
      status: 'pending',
      is_required: true,
      workflow_step: { step_order: 3 },
    };
    const before = {
      id: 55,
      status: 'in_progress',
      tasks: [first, next, later],
      approvals: [],
    } as unknown as OnboardingRequest;
    const after = {
      ...before,
      tasks: [{ ...first, status: 'completed' }, next, later],
    };
    onboardingRequestRepository.findOne.mockResolvedValue(after);
    const emitTask = jest.fn();
    Object.assign(service, { emitOnboardingTaskAssigned: emitTask });
    const sequencer = service as unknown as {
      emitNewlyReadyWorkflowActions(
        companyId: number,
        before: OnboardingRequest,
        actor: AuthenticatedUser,
      ): Promise<void>;
    };
    await sequencer.emitNewlyReadyWorkflowActions(10, before, actor);
    expect(emitTask).toHaveBeenCalledTimes(1);
    expect(emitTask).toHaveBeenCalledWith(10, 55, next, actor);
    await sequencer.emitNewlyReadyWorkflowActions(
      10,
      after as unknown as OnboardingRequest,
      actor,
    );
    expect(emitTask).toHaveBeenCalledTimes(1);
  });

  describe('activation after workflow changes', () => {
    const ready = {
      employee_id: 501,
      employee_status: EmploymentStatusEnum.ONBOARDING,
      request_status: OnboardingRequestStatusEnum.IN_PROGRESS,
      ready_to_activate: true,
      closed: false,
      blocker_count: 0,
      completed_required: 1,
      total_required: 1,
      next_action: null,
      requirements: [],
    };

    function useTransactionRepositories() {
      dataSource.transaction.mockImplementation(
        (callback: (manager: EntityManager) => unknown) =>
          callback({
            getRepository: (entity: unknown) =>
              entity === OnboardingRequest
                ? onboardingRequestRepository
                : entity === OnboardingTask
                  ? onboardingTaskRepository
                  : entity === OnboardingApproval
                    ? onboardingApprovalRepository
                    : documentRepository,
          } as unknown as EntityManager),
      );
      documentRepository.find.mockResolvedValue([]);
      onboardingApprovalRepository.find.mockResolvedValue([]);
      Object.assign(service, {
        eventEmitter: { emitAsync: jest.fn(), emit: jest.fn() },
      });
    }

    it('waits for document replacement to finish before checking activation', async () => {
      actor.employeeId = 501;
      actor.permissions = ['onboarding_requests:complete'];
      const request = {
        id: 55,
        employee_id: 501,
        status: OnboardingRequestStatusEnum.IN_PROGRESS,
        employee: { company_user_id: 90 },
      };
      onboardingRequestRepository.findOne.mockResolvedValue(request);
      const previous = { id: 1, is_verified: true, metadata: {} };
      documentRepository.find.mockResolvedValue([previous]);
      const upload = jest
        .spyOn(service, 'addDocument')
        .mockResolvedValue({ id: 2 } as Awaited<
          ReturnType<OnboardingService['addDocument']>
        >);
      const synchronize = jest.fn();
      const advance = jest
        .fn()
        .mockResolvedValue({ status: 'completed', message: 'Activated' });
      Object.assign(service, {
        synchronizeDocumentTasks: synchronize,
        emitNewlyReadyWorkflowActions: advance,
      });
      dataSource.transaction.mockImplementation(
        (callback: (manager: EntityManager) => unknown) =>
          callback({
            getRepository: () => documentRepository,
          } as unknown as EntityManager),
      );
      const dto = {
        title: 'Contract',
        document_type: 'contract',
        file: {
          fileName: 'contract.pdf',
          mimeType: 'application/pdf',
          fileSize: 4,
          fileString: 'dGVzdA==',
        },
      };
      const result = await service.addOwnDocument(10, 55, dto, actor);
      expect(upload).toHaveBeenCalledWith(10, 55, dto, actor, false);
      expect(previous.is_verified).toBe(false);
      expect(advance).toHaveBeenCalledTimes(1);
      expect(documentRepository.save.mock.invocationCallOrder[0]).toBeLessThan(
        advance.mock.invocationCallOrder[0],
      );
      expect(synchronize.mock.invocationCallOrder[0]).toBeLessThan(
        advance.mock.invocationCallOrder[0],
      );
      expect(result.activation.status).toBe('completed');
    });

    it('checks activation after the final checklist item is committed', async () => {
      actor.permissions = [
        'onboarding_tasks:complete',
        'onboarding_requests:complete',
      ];
      const task = {
        id: 2,
        title: 'Laptop',
        task_type: 'general',
        status: OnboardingTaskStatusEnum.PENDING,
        assigned_company_user_id: actor.companyMembershipId,
      };
      const request = {
        id: 55,
        employee_id: 501,
        status: OnboardingRequestStatusEnum.IN_PROGRESS,
        tasks: [task],
        approvals: [],
        employee: { id: 501, first_name: 'Amina', last_name: 'John' },
      };
      onboardingRequestRepository.findOne.mockResolvedValue(request);
      onboardingRequestRepository.findOneOrFail.mockResolvedValue(request);
      onboardingTaskRepository.findOne.mockResolvedValue(task);
      onboardingTaskRepository.findOneOrFail.mockResolvedValue(task);
      onboardingTaskRepository.find.mockResolvedValue([task]);
      useTransactionRepositories();
      const readiness = jest
        .spyOn(service, 'getActivationReadiness')
        .mockResolvedValue(ready);
      const complete = jest
        .spyOn(service, 'completeOnboarding')
        .mockResolvedValue({ message: 'Completed', data: null });
      const result = await service.completeTask(10, 55, 2, {}, actor);
      expect(result.status).toBe(OnboardingTaskStatusEnum.COMPLETED);
      expect(result.activation.status).toBe('completed');
      expect(complete).toHaveBeenCalledWith(10, 55, actor);
      expect(
        onboardingTaskRepository.save.mock.invocationCallOrder[0],
      ).toBeLessThan(readiness.mock.invocationCallOrder[0]);
    });

    it('returns the fresh completed request after the last approval activates the employee', async () => {
      actor.permissions = [
        'onboarding_requests:approve',
        'onboarding_requests:complete',
      ];
      const request = {
        id: 55,
        employee_id: 501,
        status: OnboardingRequestStatusEnum.IN_PROGRESS,
        tasks: [],
        approvals: [],
        employee: { id: 501, first_name: 'Amina', last_name: 'John' },
      };
      onboardingRequestRepository.findOne.mockResolvedValue(request);
      onboardingRequestRepository.findOneOrFail.mockResolvedValue(request);
      onboardingTaskRepository.find.mockResolvedValue([]);
      companyUserRepository.findOne.mockResolvedValue({ id: 90 });
      Object.assign(onboardingWorkflowService, {
        applyApprovalAction: jest.fn().mockResolvedValue(request),
      });
      useTransactionRepositories();
      jest.spyOn(service, 'getActivationReadiness').mockResolvedValue(ready);
      jest.spyOn(service, 'completeOnboarding').mockImplementation(() => {
        onboardingRequestRepository.findOne.mockResolvedValue({
          ...request,
          status: OnboardingRequestStatusEnum.COMPLETED,
          employee: {
            ...request.employee,
            employment_status: EmploymentStatusEnum.ACTIVE,
          },
        });
        return Promise.resolve({ message: 'Completed', data: null });
      });
      const result = await service.applyApprovalAction(
        10,
        55,
        { approve: true },
        actor,
      );
      expect(result.status).toBe(OnboardingRequestStatusEnum.COMPLETED);
      expect(result.employee?.employment_status).toBe(
        EmploymentStatusEnum.ACTIVE,
      );
    });

    function advance() {
      const sequencer = service as unknown as {
        emitNewlyReadyWorkflowActions(
          companyId: number,
          before: OnboardingRequest,
          actor: AuthenticatedUser,
        ): Promise<{ status: string; message: string }>;
      };
      const request = {
        id: 55,
        status: OnboardingRequestStatusEnum.IN_PROGRESS,
        tasks: [],
        approvals: [],
      } as unknown as OnboardingRequest;
      onboardingRequestRepository.findOne.mockResolvedValue(request);
      return sequencer.emitNewlyReadyWorkflowActions(10, request, actor);
    }

    it('activates through the shared sequencer when the actor is authorized and ready', async () => {
      actor.permissions = ['onboarding_requests:complete'];
      const readiness = jest
        .spyOn(service, 'getActivationReadiness')
        .mockResolvedValue(ready);
      const complete = jest
        .spyOn(service, 'completeOnboarding')
        .mockResolvedValue({ message: 'Completed', data: null });
      expect((await advance()).status).toBe('completed');
      expect(readiness).toHaveBeenCalledWith(10, 55, actor);
      expect(complete).toHaveBeenCalledWith(10, 55, actor);
    });

    it('does not give task assignees or approvers activation permission', async () => {
      actor.permissions = [
        'onboarding_tasks:complete',
        'onboarding_requests:approve',
      ];
      const readiness = jest.spyOn(service, 'getActivationReadiness');
      const complete = jest.spyOn(service, 'completeOnboarding');
      expect((await advance()).status).toBe('hr_review_required');
      expect(readiness).not.toHaveBeenCalled();
      expect(complete).not.toHaveBeenCalled();
    });

    it('keeps the successful action saved when activation requirements remain', async () => {
      actor.permissions = ['onboarding_requests:complete'];
      jest.spyOn(service, 'getActivationReadiness').mockResolvedValue({
        ...ready,
        ready_to_activate: false,
        blocker_count: 2,
      });
      const complete = jest.spyOn(service, 'completeOnboarding');
      const result = await advance();
      expect(result.status).toBe('pending');
      expect(result.message).toContain('2 activation requirements');
      expect(complete).not.toHaveBeenCalled();
    });

    it('returns retry guidance rather than failing an already saved action', async () => {
      actor.permissions = ['onboarding_requests:complete'];
      jest.spyOn(service, 'getActivationReadiness').mockResolvedValue(ready);
      jest
        .spyOn(service, 'completeOnboarding')
        .mockRejectedValue(new BadRequestException('Contract changed'));
      const result = await advance();
      expect(result.status).toBe('failed');
      expect(result.message).toContain('Work saved');
    });
  });

  it('does not repeat activation side effects if another completion wins the lock', async () => {
    onboardingRequestRepository.findOne.mockResolvedValue({
      id: 55,
      employee: { id: 501 },
      status: OnboardingRequestStatusEnum.IN_PROGRESS,
      tasks: [],
      approvals: [],
    });
    onboardingRequestRepository.findOneOrFail.mockResolvedValue({
      id: 55,
      status: OnboardingRequestStatusEnum.COMPLETED,
    });
    dataSource.transaction.mockImplementation(
      (callback: (manager: EntityManager) => unknown) =>
        callback({
          getRepository: () => onboardingRequestRepository,
        } as unknown as EntityManager),
    );
    expect(await service.completeOnboarding(10, 55, actor)).toEqual({
      message: 'Onboarding already completed',
      data: null,
    });
    expect(onboardingRequestRepository.save).not.toHaveBeenCalled();
    expect(onboardingAuditService.log).not.toHaveBeenCalled();
    expect(probationService.ensureCaseForEmployee).not.toHaveBeenCalled();
  });

  it('does not send assignment notifications for future steps when creating tasks', async () => {
    const first = {
      id: 1,
      step_order: 1,
      step_type: 'task',
      is_required: true,
      name: 'First',
    };
    const second = { ...first, id: 2, step_order: 2, name: 'Second' };
    onboardingRequestRepository.findOneOrFail.mockResolvedValue({
      status: 'in_progress',
      approvals: [],
      tasks: [first, second].map((step) => ({
        id: step.id,
        workflow_step_id: step.id,
        workflow_step: step,
        status: 'pending',
        is_required: true,
      })),
    });
    const emit = jest.fn();
    Object.assign(service, {
      generateTaskNo: jest.fn().mockResolvedValue('TASK-1'),
      resolveTaskRecipients: jest.fn().mockResolvedValue([]),
      emitTaskAssignedToRecipients: emit,
      synchronizeDocumentTasks: jest.fn(),
    });
    const creator = service as unknown as {
      createTasksFromWorkflowSteps(
        request: OnboardingRequest,
        steps: OnboardingWorkflowStep[],
        actor: AuthenticatedUser,
      ): Promise<void>;
    };
    await creator.createTasksFromWorkflowSteps(
      { id: 55, company_id: 10 } as OnboardingRequest,
      [first, second] as OnboardingWorkflowStep[],
      actor,
    );
    expect(onboardingTaskRepository.save).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.objectContaining({ workflow_step_id: 1 }),
      }),
    );
  });

  it('limits onboarding request lists to employees in the manager data scope', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    onboardingRequestRepository.createQueryBuilder = jest
      .fn()
      .mockReturnValue(queryBuilder);
    hrAccessService.getAccessibleEmployeeIds.mockResolvedValue([41, 42]);
    documentRepository.find.mockResolvedValue([]);

    await service.findAllOnboardingRequests(10, {}, actor);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'request.employee_id IN (:...accessibleEmployeeIds)',
      { accessibleEmployeeIds: [41, 42] },
    );
  });

  it('accepts a workflow step assigned only to a department', () => {
    const validateWorkflowStepRules = (
      service as unknown as {
        validateWorkflowStepRules: (step: {
          name: string;
          step_type: OnboardingStepTypeEnum;
          assigned_department_id?: number;
        }) => void;
      }
    ).validateWorkflowStepRules.bind(service);

    expect(() =>
      validateWorkflowStepRules({
        name: 'Prepare equipment',
        step_type: OnboardingStepTypeEnum.TASK,
        assigned_department_id: 12,
      }),
    ).not.toThrow();
  });

  it('accepts a workflow checklist with separately trackable items', () => {
    const validateWorkflowStepRules = (
      service as unknown as {
        validateWorkflowStepRules: (step: {
          name: string;
          step_type: OnboardingStepTypeEnum;
          assigned_department_id: number;
          metadata: {
            checklist_items: Array<{ name: string; description: string }>;
          };
        }) => void;
      }
    ).validateWorkflowStepRules.bind(service);

    expect(() =>
      validateWorkflowStepRules({
        name: 'Prepare workstation',
        step_type: OnboardingStepTypeEnum.TASK,
        assigned_department_id: 12,
        metadata: {
          checklist_items: [
            {
              name: 'Provide laptop',
              description: 'Install the approved software image.',
            },
            {
              name: 'Create email account',
              description: '',
            },
          ],
        },
      }),
    ).not.toThrow();
  });

  it('rejects empty workflow checklist items', () => {
    const validateWorkflowStepRules = (
      service as unknown as {
        validateWorkflowStepRules: (step: {
          name: string;
          step_type: OnboardingStepTypeEnum;
          assigned_department_id: number;
          metadata: { checklist_items: string[] };
        }) => void;
      }
    ).validateWorkflowStepRules.bind(service);

    expect(() =>
      validateWorkflowStepRules({
        name: 'Prepare workstation',
        step_type: OnboardingStepTypeEnum.TASK,
        assigned_department_id: 12,
        metadata: { checklist_items: ['Provide laptop', ''] },
      }),
    ).toThrow('checklist must contain 1 to 50 named items');
  });

  it('rejects a workflow step without a role, user, or department', () => {
    const validateWorkflowStepRules = (
      service as unknown as {
        validateWorkflowStepRules: (step: {
          name: string;
          step_type: OnboardingStepTypeEnum;
        }) => void;
      }
    ).validateWorkflowStepRules.bind(service);

    expect(() =>
      validateWorkflowStepRules({
        name: 'Prepare equipment',
        step_type: OnboardingStepTypeEnum.TASK,
      }),
    ).toThrow('user, role, position, or department assignment');
  });

  it('rejects a specific sign-off assignee without approval permission', async () => {
    companyUserRepository.find.mockResolvedValue([
      {
        id: 22,
        company_id: 10,
        user_id: 7,
        status: 'active',
        user: { first_name: 'Jane', last_name: 'Doe' },
        role_assignments: [],
        permission_assignments: [],
      },
    ]);
    const validateWorkflowStepReferences = (
      service as unknown as {
        validateWorkflowStepReferences: (
          companyId: number,
          steps: Array<{
            name: string;
            step_type: OnboardingStepTypeEnum;
            assigned_user_id: number;
          }>,
        ) => Promise<void>;
      }
    ).validateWorkflowStepReferences.bind(service);

    await expect(
      validateWorkflowStepReferences(10, [
        {
          name: 'Approve employee',
          step_type: OnboardingStepTypeEnum.SIGN_OFF,
          assigned_user_id: 22,
        },
      ]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ONBOARDING_ASSIGNEE_PERMISSION_REQUIRED',
        assigned_user_id: 22,
        required_permission: 'onboarding_requests:approve',
      }),
    });
  });

  it('accepts a specific task assignee with permission granted through a role', async () => {
    companyUserRepository.find.mockResolvedValue([
      {
        id: 22,
        company_id: 10,
        user_id: 7,
        status: 'active',
        user: { first_name: 'Jane', last_name: 'Doe' },
        role_assignments: [
          {
            role: {
              permissions: [{ name: 'onboarding_tasks:complete' }],
            },
          },
        ],
        permission_assignments: [],
      },
    ]);
    const validateWorkflowStepReferences = (
      service as unknown as {
        validateWorkflowStepReferences: (
          companyId: number,
          steps: Array<{
            name: string;
            step_type: OnboardingStepTypeEnum;
            assigned_user_id: number;
          }>,
        ) => Promise<void>;
      }
    ).validateWorkflowStepReferences.bind(service);

    await expect(
      validateWorkflowStepReferences(10, [
        {
          name: 'Prepare laptop',
          step_type: OnboardingStepTypeEnum.TASK,
          assigned_user_id: 22,
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it('places uploaded documents in their related employee review sections', () => {
    const buildEmployeeDetailReview = (
      service as unknown as {
        buildEmployeeDetailReview: (
          request: OnboardingRequest,
          documents: Document[],
        ) => {
          sections: Array<{
            key: string;
            attachments: Array<{ id: number; source: string }>;
          }>;
        };
      }
    ).buildEmployeeDetailReview.bind(service);

    const review = buildEmployeeDetailReview(
      {
        id: 55,
        metadata: {},
        employee: {
          id: 501,
          documents: [
            {
              id: 81,
              employee_id: 501,
              type: 'other',
              title: 'Profile photo',
              metadata: { onboarding_section: 'personal' },
              retention_until: null,
            },
          ],
        },
      } as unknown as OnboardingRequest,
      [
        {
          id: 72,
          document_type: 'academic_certificate',
          title: 'Degree certificate',
        } as Document,
      ],
    );

    expect(
      review.sections.find((section) => section.key === 'personal')
        ?.attachments,
    ).toEqual([
      expect.objectContaining({ id: 81, source: 'employee_profile' }),
    ]);
    expect(
      review.sections.find((section) => section.key === 'education')
        ?.attachments,
    ).toEqual([expect.objectContaining({ id: 72, source: 'onboarding' })]);
  });

  it('rejects a replacement approver without approval permission', async () => {
    actor.permissions = ['onboarding_requests:update'];
    onboardingRequestRepository.findOne.mockResolvedValue({
      id: 55,
      company_id: 10,
      employee: { id: 501 },
    });
    onboardingApprovalRepository.findOneOrFail.mockResolvedValue({
      id: 91,
      onboarding_request_id: 55,
      approver_company_user_id: 90,
      status: 'pending',
    });
    companyUserRepository.findOne.mockResolvedValue({
      id: 22,
      company_id: 10,
      user_id: 7,
      status: 'active',
      user: { first_name: 'Jane', last_name: 'Doe' },
      role_assignments: [],
      permission_assignments: [],
    });
    const manager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity === OnboardingApproval) return onboardingApprovalRepository;
        if (entity === CompanyUser) return companyUserRepository;
        throw new Error(`Unexpected repository request: ${entity?.name}`);
      }),
    } as unknown as EntityManager;
    dataSource.transaction.mockImplementation(
      (callback: (transactionManager: EntityManager) => unknown) =>
        callback(manager),
    );

    await expect(
      service.delegateApproval(
        10,
        55,
        91,
        { delegate_company_user_id: 22, reason: 'Coverage change' },
        actor,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ONBOARDING_ASSIGNEE_PERMISSION_REQUIRED',
        assigned_user_id: 22,
        required_permission: 'onboarding_requests:approve',
      }),
    });
  });

  it('prevents a normal approver from changing the assigned approver', async () => {
    actor.permissions = ['onboarding_requests:approve'];

    await expect(
      service.delegateApproval(
        10,
        55,
        91,
        { delegate_company_user_id: 22, reason: 'Coverage change' },
        actor,
      ),
    ).rejects.toThrow(
      'You do not have permission to change onboarding approvers',
    );
    expect(onboardingRequestRepository.findOne).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('restarts pending assignments when a submitted request changes workflow', async () => {
    const employee = {
      id: 501,
      first_name: 'Jane',
      last_name: 'Doe',
      company_user: null,
    };
    onboardingRequestRepository.findOne.mockResolvedValue({
      id: 55,
      company_id: 10,
      workflow_id: 1,
      status: OnboardingRequestStatusEnum.SUBMITTED,
      employee,
    });
    const current = {
      id: 55,
      company_id: 10,
      workflow_id: 1,
      status: OnboardingRequestStatusEnum.SUBMITTED,
      current_approval_level: 1,
      metadata: null,
    };
    const loaded = {
      ...current,
      workflow_id: 2,
      employee,
      workflow: { id: 2, name: 'Replacement workflow' },
      tasks: [],
      approvals: [],
    };
    const requestRepo = {
      findOneOrFail: jest
        .fn()
        .mockResolvedValueOnce(current)
        .mockResolvedValue(loaded),
      save: jest.fn((value: unknown) => Promise.resolve(value)),
    };
    const workflow = {
      id: 2,
      company_id: 10,
      name: 'Replacement workflow',
      version: 1,
      is_locked: false,
      steps: [],
    };
    const workflowRepo = {
      findOne: jest.fn().mockResolvedValue(workflow),
      save: jest.fn((value: unknown) => Promise.resolve(value)),
    };
    onboardingApprovalRepository.find.mockResolvedValue([]);
    onboardingTaskRepository.find.mockResolvedValue([]);
    onboardingWorkflowService.resolveWorkflow.mockResolvedValue(workflow);
    onboardingWorkflowService.prepareApprovers.mockResolvedValue({
      assignments: [{ step: { id: 8 }, membershipIds: [22] }],
      failures: [],
    });
    onboardingWorkflowService.initializeApprovalsForRequest.mockResolvedValue({
      workflow,
      initialLevel: 1,
      steps: [],
    });
    documentRepository.find.mockResolvedValue([]);
    const manager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity === OnboardingRequest) return requestRepo;
        if (entity === OnboardingWorkflow) return workflowRepo;
        if (entity === OnboardingApproval) return onboardingApprovalRepository;
        if (entity === OnboardingTask) return onboardingTaskRepository;
        throw new Error(`Unexpected repository request: ${entity?.name}`);
      }),
    } as unknown as EntityManager;
    dataSource.transaction.mockImplementation(
      (callback: (transactionManager: EntityManager) => unknown) =>
        callback(manager),
    );

    await service.updateOnboardingRequest(10, 55, { workflow_id: 2 }, actor);

    expect(onboardingApprovalRepository.delete).toHaveBeenCalledWith({
      onboarding_request_id: 55,
    });
    expect(onboardingTaskRepository.delete).toHaveBeenCalledWith({
      onboarding_request_id: 55,
    });
    expect(
      onboardingWorkflowService.initializeApprovalsForRequest,
    ).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ id: 55, workflow_id: 2 }),
      2,
      manager,
      expect.objectContaining({ failures: [] }),
    );
  });

  it('checks employee access before exposing activation readiness', async () => {
    const employee = { id: 501 };
    onboardingRequestRepository.findOne.mockResolvedValue({
      id: 55,
      employee_id: 501,
      employee,
    });
    hrAccessService.assertCanAccessEmployee.mockRejectedValue(
      new Error('Access denied'),
    );
    await expect(service.getActivationReadiness(10, 55, actor)).rejects.toThrow(
      'Access denied',
    );
    expect(onboardingRequestRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 55, company_id: 10 } }),
    );
    expect(hrAccessService.assertCanAccessEmployee).toHaveBeenCalledWith(
      actor,
      employee,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it.each([
    OnboardingRequestStatusEnum.DRAFT,
    OnboardingRequestStatusEnum.REJECTED,
  ])(
    'blocks finalization of a %s request with no tasks or approvals',
    async (status) => {
      onboardingRequestRepository.findOne.mockResolvedValue({
        id: 55,
        status,
        tasks: [],
        approvals: [],
        employee: { id: 501 },
      });
      await expect(service.completeOnboarding(10, 55, actor)).rejects.toThrow(
        'Only started',
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    },
  );

  it('rechecks lifecycle state inside the completion transaction', async () => {
    onboardingRequestRepository.findOne.mockResolvedValue({
      id: 55,
      status: OnboardingRequestStatusEnum.IN_PROGRESS,
      tasks: [],
      approvals: [],
      employee: { id: 501 },
    });
    const manager = {
      getRepository: jest.fn(() => ({
        findOneOrFail: jest.fn().mockResolvedValue({
          id: 55,
          status: OnboardingRequestStatusEnum.CANCELLED,
        }),
      })),
    } as unknown as EntityManager;
    dataSource.transaction.mockImplementation(
      (callback: (manager: EntityManager) => unknown) => callback(manager),
    );
    await expect(service.completeOnboarding(10, 55, actor)).rejects.toThrow(
      'Only started',
    );
  });

  it.each([
    OnboardingTaskStatusEnum.PENDING,
    OnboardingTaskStatusEnum.CANCELLED,
  ])(
    'allows an optional %s task while activating the employee',
    async (optionalStatus) => {
      onboardingRequestRepository.findOne.mockResolvedValue({
        id: 55,
        employee_id: 501,
        status: OnboardingRequestStatusEnum.IN_PROGRESS,
        tasks: [
          { status: OnboardingTaskStatusEnum.COMPLETED },
          { is_required: false, status: optionalStatus },
        ],
        approvals: [],
        employee: { id: 501, company_user: { id: 11 } },
      });

      const requestRepo = {
        save: jest.fn((value: unknown) => Promise.resolve(value)),
        findOneOrFail: jest
          .fn()
          .mockResolvedValueOnce({
            id: 55,
            company_id: 10,
            employee_id: 501,
            status: OnboardingRequestStatusEnum.IN_PROGRESS,
          })
          .mockResolvedValueOnce({
            id: 55,
            employee: {
              id: 501,
              employment_status: EmploymentStatusEnum.ACTIVE,
              hire_date: '2026-06-12',
            },
          }),
      };
      const employeeRepo = {
        findOneOrFail: jest.fn().mockResolvedValue({
          id: 501,
          primary_department_id: 2,
          primary_position_id: 3,
          reports_to: 20,
          employment_status: EmploymentStatusEnum.ONBOARDING,
          hire_date: null,
        }),
        save: jest.fn((value: Partial<Employee>) => Promise.resolve(value)),
      };
      const leaveTypeRepo = {
        find: jest.fn().mockResolvedValue([
          { id: 7, status: LeaveRecordStatusEnum.ACTIVE },
          { id: 8, status: LeaveRecordStatusEnum.ACTIVE },
        ]),
      };
      const payrollProfileRepo = {
        findOne: jest.fn().mockResolvedValue({
          payrollEnabled: true,
          payrollHold: false,
          taxpayerIdentificationNumber: '123456789',
          socialSecuritySchemeCode: 'NSSF',
          socialSecurityNumber: 'NSSF-123',
          healthInsuranceSchemeCode: 'NHIF',
          healthInsuranceNumber: 'NHIF-123',
          primaryBankAccountId: 6,
        }),
      };
      const salaryRepo = {
        findOne: jest.fn().mockResolvedValue({
          status: EmployeeCompensationVersionStatusEnum.ACTIVE,
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          createdByCompanyUserId: 21,
          approvedByCompanyUserId: 22,
        }),
      };
      const contractRepo = {
        findOne: jest.fn().mockResolvedValue({
          status: EmploymentContractStatus.SIGNED,
          startDate: '2026-01-01',
          endDate: null,
        }),
      };
      const bankRepo = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({ verification_status: 'PENDING' })
          .mockResolvedValueOnce({ verification_status: 'VERIFIED' }),
      };

      const manager = {
        getRepository: jest.fn((entity: { name?: string }) => {
          if (entity === OnboardingRequest) return requestRepo;
          if (entity === OnboardingTask)
            return {
              find: jest
                .fn()
                .mockResolvedValue([
                  { is_required: false, status: optionalStatus },
                ]),
            };
          if (entity === OnboardingApproval)
            return { find: jest.fn().mockResolvedValue([]) };
          if (entity === Employee) return employeeRepo;
          if (entity === LeaveType) return leaveTypeRepo;
          if (entity === EmployeePayrollProfile) return payrollProfileRepo;
          if (entity === EmployeeCompensationVersion) return salaryRepo;
          if (entity === EmploymentContract) return contractRepo;
          if (entity === EmployeeBankAccount) return bankRepo;
          throw new Error(`Unexpected repository request: ${entity?.name}`);
        }),
      } as unknown as EntityManager;

      dataSource.transaction.mockImplementation(
        (callback: (manager: EntityManager) => unknown) => callback(manager),
      );

      await service.completeOnboarding(10, 55, actor);

      expect(employeeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          employment_status: EmploymentStatusEnum.ACTIVE,
          hire_date: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}$/,
          ) as unknown as string,
        }),
      );
      expect(leaveBalanceService.getFiscalYearFromDate).toHaveBeenCalled();
      expect(
        leaveBalanceService.ensureBalanceForEmployee,
      ).toHaveBeenCalledTimes(2);
      expect(
        leaveBalanceService.ensureBalanceForEmployee,
      ).toHaveBeenNthCalledWith(
        1,
        10,
        expect.objectContaining({ id: 501 }),
        7,
        '2026',
        manager,
        { preferredPolicyId: undefined },
      );
    },
  );

  it('blocks completion when payroll and contract records are missing', async () => {
    onboardingRequestRepository.findOne.mockResolvedValue({
      id: 55,
      employee_id: 501,
      status: OnboardingRequestStatusEnum.IN_PROGRESS,
      tasks: [{ status: OnboardingTaskStatusEnum.COMPLETED }],
      approvals: [],
      employee: { id: 501, company_user: { id: 11 } },
    });
    const employeeRepo = {
      findOneOrFail: jest.fn().mockResolvedValue({
        id: 501,
        primary_position_id: 3,
        reports_to: 20,
        hire_date: '2026-06-12',
      }),
      save: jest.fn(),
    };
    const requestRepo = {
      findOneOrFail: jest.fn().mockResolvedValue({
        id: 55,
        employee_id: 501,
        status: OnboardingRequestStatusEnum.IN_PROGRESS,
      }),
    };
    const missingRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === OnboardingRequest) return requestRepo;
        if (entity === OnboardingTask || entity === OnboardingApproval)
          return { find: jest.fn().mockResolvedValue([]) };
        if (entity === Employee) return employeeRepo;
        return missingRepo;
      }),
    } as unknown as EntityManager;
    dataSource.transaction.mockImplementation(
      (callback: (manager: EntityManager) => unknown) => callback(manager),
    );

    await expect(service.completeOnboarding(10, 55, actor)).rejects.toThrow(
      'payroll profile',
    );
    expect(employeeRepo.save).not.toHaveBeenCalled();
  });

  it('queues device work transactionally without contacting devices', async () => {
    const operations = { upsert: jest.fn() };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Employee)
          return { findOneOrFail: jest.fn().mockResolvedValue({ id: 501 }) };
        if (entity === OnboardingProvisioningOperation) return operations;
        throw new Error('Unexpected repository');
      }),
    } as unknown as EntityManager;
    await service['applyProvisioningSelections'](
      10,
      {
        id: 55,
        employee_id: 501,
        metadata: { provisioning: { device_assignment: { device_ids: [7] } } },
      } as unknown as OnboardingRequest,
      actor,
      manager,
    );
    expect(operations.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        onboarding_request_id: 55,
        status: ProvisioningStatus.PENDING,
      }),
      expect.any(Array),
    );
    expect(
      employeeDeviceAssignmentsService.assignDevices,
    ).not.toHaveBeenCalled();
  });

  it('records device failures for retry and completes a later successful attempt', async () => {
    const operation = {
      id: 1,
      company_id: 10,
      status: ProvisioningStatus.PENDING,
      attempt_count: 0,
      next_retry_at: null as Date | null,
      payload: { employee_id: 501, provisioning: {} },
    };
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([operation]),
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(operation),
      save: jest.fn(),
    };
    Object.assign(dataSource, {
      getRepository: () => ({ createQueryBuilder: () => query }),
    });
    const manager = {
      getRepository: (entity: unknown) =>
        entity === OnboardingProvisioningOperation
          ? repository
          : {
              findOneOrFail: jest.fn().mockResolvedValue({ id: 501 }),
            },
    } as unknown as EntityManager;
    dataSource.transaction.mockImplementation(
      (callback: (manager: EntityManager) => unknown) => callback(manager),
    );
    const assign = jest.spyOn(
      service as never,
      'assignProvisioningDevices' as never,
    ) as jest.SpyInstance;
    assign
      .mockRejectedValueOnce(new Error('Device offline'))
      .mockResolvedValueOnce(undefined);
    await service.retryDeviceProvisioning();
    expect(operation.status).toBe(ProvisioningStatus.FAILED);
    expect(operation.next_retry_at).toBeInstanceOf(Date);
    operation.next_retry_at = null;
    await service.retryDeviceProvisioning();
    expect(operation.status).toBe(ProvisioningStatus.COMPLETED);
    expect(operation.attempt_count).toBe(2);
  });

  it.each(['task', 'approval'])(
    'prevents template edits when a %s references its steps',
    async (reference) => {
      const manager = {
        getRepository: (entity: unknown) => ({
          count: jest
            .fn()
            .mockResolvedValue(
              (entity === OnboardingTask && reference === 'task') ||
                (entity === OnboardingApproval && reference === 'approval')
                ? 1
                : 0,
            ),
        }),
      } as unknown as EntityManager;
      await expect(
        service['assertWorkflowStepsUnused'](91, manager),
      ).rejects.toThrow('Clone it');
    },
  );

  it('allows editing an unused workflow', async () => {
    const manager = {
      getRepository: () => ({ count: jest.fn().mockResolvedValue(0) }),
    } as unknown as EntityManager;
    await expect(
      service['assertWorkflowStepsUnused'](91, manager),
    ).resolves.toBeUndefined();
  });

  it('validates the cleared assignment instead of falling back to the old person', () => {
    const result = service['buildStepValidationPayload'](
      {
        assigned_user_id: 26,
        assigned_department_id: 7,
      } as OnboardingWorkflowStep,
      { assigned_user_id: null } as unknown as Parameters<
        OnboardingService['updateOnboardingWorkflowStep']
      >[3],
    );
    expect(result.assigned_user_id).toBeUndefined();
    expect(result.assigned_department_id).toBe(7);
  });

  it('stores normalized provisioning metadata when onboarding starts', async () => {
    employeeRepository.findOne.mockResolvedValue({
      id: 501,
      company_user: { company_id: 10 },
      first_name: 'Jane',
      last_name: 'Doe',
      employment_status: EmploymentStatusEnum.ONBOARDING,
    });
    onboardingRequestRepository.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    }));

    const requestRepo = {
      create: jest.fn((value: Partial<OnboardingRequest>) => value),
      save: jest.fn((value: unknown) => Promise.resolve(value)),
      findOneOrFail: jest.fn().mockResolvedValue({
        id: 77,
        company_id: 10,
        employee_id: 501,
        title: 'Onboarding - Jane Doe',
        metadata: {
          provisioning: {
            role_ids: [7],
            branch_access_ids: [3],
            attendance_mode: OnboardingAttendanceModeEnum.SHIFT,
            shift_assignment: {
              shift_id: 11,
              effective_to: null,
              rotation_group_id: null,
              is_primary: false,
            },
          },
        },
        employee: null,
        workflow: null,
        tasks: [],
        approvals: [],
      }),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      })),
    };
    const taskRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    const approvalRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    const manager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity === Employee) {
          return {
            findOne: jest.fn().mockResolvedValue({
              id: 501,
              company_user: { company_id: 10 },
              first_name: 'Jane',
              last_name: 'Doe',
              employment_status: EmploymentStatusEnum.ONBOARDING,
            }),
          };
        }
        if (entity === OnboardingRequest) return requestRepo;
        if (entity === OnboardingTask) return taskRepo;
        if (entity === OnboardingApproval) return approvalRepo;
        if (entity === OnboardingWorkflow) {
          return {
            findOne: jest.fn().mockResolvedValue({
              id: 91,
              company_id: 10,
              version: 1,
              name: 'Default Onboarding',
              description: null,
              steps: [],
              is_locked: false,
            }),
            save: jest.fn((value: unknown) => Promise.resolve(value)),
          };
        }
        if (entity === OnboardingNumberSequence) {
          return {
            createQueryBuilder: jest.fn(() => ({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(null),
            })),
            create: jest.fn((value: unknown) => value),
            save: jest.fn((value: unknown) => Promise.resolve(value)),
          };
        }
        throw new Error(`Unexpected repository request: ${entity?.name}`);
      }),
    } as unknown as EntityManager;

    dataSource.transaction.mockImplementation(
      (callback: (manager: EntityManager) => unknown) => callback(manager),
    );

    const created = await service.startOnboardingForEmployee(
      10,
      {
        employee_id: 501,
        submit: false,
        provisioning: {
          role_ids: [7, 7],
          branch_access_ids: [3, 3],
          shift_assignment: {
            shift_id: 11,
          },
        },
      },
      actor,
    );

    expect(requestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Onboarding - Jane Doe',
        metadata: {
          provisioning: {
            role_ids: [7],
            branch_access_ids: [3],
            attendance_mode: OnboardingAttendanceModeEnum.SHIFT,
            shift_assignment: {
              shift_id: 11,
              effective_from: undefined,
              effective_to: null,
              rotation_group_id: null,
              is_primary: false,
            },
          },
        },
      }),
    );
    expect(created.metadata).toEqual({
      provisioning: {
        role_ids: [7],
        branch_access_ids: [3],
        attendance_mode: OnboardingAttendanceModeEnum.SHIFT,
        shift_assignment: {
          shift_id: 11,
          effective_to: null,
          rotation_group_id: null,
          is_primary: false,
        },
      },
    });
  });

  it('rejects onboarding provisioning that mixes shift and timetable setup', async () => {
    employeeRepository.findOne.mockResolvedValue({
      id: 501,
      company_user: { company_id: 10 },
      first_name: 'Jane',
      last_name: 'Doe',
      employment_status: EmploymentStatusEnum.ONBOARDING,
    });
    onboardingRequestRepository.createQueryBuilder = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    }));

    const requestRepo = {
      create: jest.fn((value: Partial<OnboardingRequest>) => value),
      save: jest.fn((value: unknown) => Promise.resolve(value)),
      findOneOrFail: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      })),
    };
    const manager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity === Employee) {
          return {
            findOne: jest.fn().mockResolvedValue({
              id: 501,
              company_user: { company_id: 10 },
              first_name: 'Jane',
              last_name: 'Doe',
              employment_status: EmploymentStatusEnum.ONBOARDING,
            }),
          };
        }
        if (entity === OnboardingRequest) {
          return requestRepo;
        }
        if (entity === OnboardingWorkflow) {
          return {
            findOne: jest.fn().mockResolvedValue({
              id: 91,
              company_id: 10,
              version: 1,
              name: 'Default Onboarding',
              description: null,
              steps: [],
              is_locked: false,
            }),
            save: jest.fn((value: unknown) => Promise.resolve(value)),
          };
        }
        if (entity === OnboardingNumberSequence) {
          return {
            createQueryBuilder: jest.fn(() => ({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(null),
            })),
            create: jest.fn((value: unknown) => value),
            save: jest.fn((value: unknown) => Promise.resolve(value)),
          };
        }
        throw new Error(`Unexpected repository request: ${entity?.name}`);
      }),
    } as unknown as EntityManager;

    dataSource.transaction.mockImplementation(
      (callback: (manager: EntityManager) => unknown) => callback(manager),
    );

    await expect(
      service.startOnboardingForEmployee(
        10,
        {
          employee_id: 501,
          submit: false,
          provisioning: {
            shift_assignment: {
              shift_id: 11,
            },
            timetable_assignment: {
              timetable_id: 7,
            },
          },
        },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('stores onboarding documents through the shared files service', async () => {
    jest
      .spyOn(service as any, 'findOnboardingRequestOrFail')
      .mockResolvedValue({ employee: { id: 501 } });
    filesService.savePrivateBase64File.mockResolvedValue({
      storedFileName: 'onboarding-55-stored.pdf',
      originalFileName: 'offer-letter.pdf',
      mimeType: 'application/pdf',
      fileExtension: '.pdf',
      fileSize: 18,
      publicPath: '/uploads/documents/onboarding/company-10/onboarding.pdf',
    });
    documentRepository.save.mockImplementation((value: object) => ({
      id: 14,
      ...value,
    }));
    documentRepository.find.mockResolvedValue([]);

    const taskRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    const approvalRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    const requestRepo = {
      findOneOrFail: jest.fn().mockResolvedValue({
        id: 55,
        company_id: 10,
        progress_percentage: '0.00',
      }),
      save: jest.fn((value: unknown) => Promise.resolve(value)),
    };
    const manager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity === Document) return documentRepository;
        if (entity === OnboardingTask) return taskRepo;
        if (entity === OnboardingApproval) return approvalRepo;
        if (entity === OnboardingRequest) return requestRepo;
        throw new Error(`Unexpected repository request: ${entity?.name}`);
      }),
    } as unknown as EntityManager;

    dataSource.transaction.mockImplementation(
      (callback: (manager: EntityManager) => unknown) => callback(manager),
    );

    await service.addDocument(
      10,
      55,
      {
        title: 'Offer Letter',
        file: {
          fileName: 'offer-letter.pdf',
          fileSize: 18,
          mimeType: 'application/pdf',
          fileString: Buffer.from('offer-letter-pdf').toString('base64'),
        },
      },
      actor,
    );

    expect(filesService.savePrivateBase64File).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'offer-letter.pdf' }),
      expect.objectContaining({
        directorySegments: ['documents', 'onboarding', 'company-10'],
      }),
    );
    expect(documentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        file_name: 'onboarding-55-stored.pdf',
        original_file_name: 'offer-letter.pdf',
        mime_type: 'application/pdf',
        file_extension: '.pdf',
        file_size: '18',
        file_path: '/uploads/documents/onboarding/company-10/onboarding.pdf',
      }),
    );
  });
});
