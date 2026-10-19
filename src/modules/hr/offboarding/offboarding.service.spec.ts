import { DataSource, EntityManager, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { OffboardingService } from './offboarding.service';
import { OffboardingWorkflow } from './entities/offboarding-workflow.entity';
import { OffboardingWorkflowStep } from './entities/offboarding-workflow-step.entity';
import { OffboardingRequest } from './entities/offboarding-request.entity';
import { OffboardingTask } from './entities/offboarding-task.entity';
import { OffboardingAction } from './entities/offboarding-action.entity';
import { OffboardingAccessOperation } from './entities/offboarding-access-operation.entity';
import { OffboardingNumberSequence } from './entities/offboarding-number-sequence.entity';
import { OffboardingAssetReturn } from './entities/offboarding-asset-return.entity';
import { OffboardingApproval } from './entities/offboarding-approval.entity';
import { OffboardingClearance } from './entities/offboarding-clearance.entity';
import { OffboardingAuditLog } from './entities/offboarding-audit-log.entity';
import { OffboardingExitInterview } from './entities/offboarding-exit-interview.entity';
import { OffboardingSettlementItem } from './entities/offboarding-settlement-item.entity';
import { Document } from '../documents/entities/document.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Department } from '../departments/entities/department.entity';
import { Position } from '../positions/entities/position.entity';
import { Branch } from '../branches/entities/branch.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { CompanyUserRole } from '../../companies/entities/company-user-role.entity';
import { Role } from '../../roles/entities/role.entity';
import { ShiftAssignment } from '../attendance/shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftAssignmentStatusEnum } from '../attendance/shift/shift-assignments/enums/shift-assignment-status.enum';
import { ShiftSchedule } from '../attendance/shift/shift-schedules/entities/shift-schedule.entity';
import { EmployeeTimetable } from '../attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { EmployeeTimetableStatusEnum } from '../attendance/timetable/employee-timetables/enums/employee-timetable-status.enum';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { PositionAvailabilityService } from '../shared/position-availability.service';
import { OffboardingAuditService } from './services/offboarding-audit.service';
import { OffboardingNoticeService } from './services/offboarding-notice.service';
import { OffboardingWorkflowService } from './services/offboarding-workflow.service';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { OffboardingRequestStatusEnum } from './enums/offboarding-request-status.enum';
import { OffboardingSettlementStatusEnum } from './enums/offboarding-settlement-status.enum';
import { OffboardingAssetStatusEnum } from './enums/offboarding-asset-status.enum';
import { OffboardingTaskStatusEnum } from './enums/offboarding-task-status.enum';
import { OffboardingExitInterviewStatusEnum } from './enums/offboarding-exit-interview-status.enum';
import { BadRequestException } from '@nestjs/common';
import { OffboardingTypeEnum } from './enums/offboarding-type.enum';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { FilesService } from '../../files/files.service';
import { EmployeeAssignmentService } from '../employees/employee-assignment.service';
import { SecurityEventsService } from '../../security/security-events.service';
import { LeaveBalance } from '../leave/entities/leave-balance.entity';
import { LeaveBalanceLedgerService } from '../leave/services/leave-balance-ledger.service';

type MockRepo<T = unknown> = Record<string, jest.Mock> & { __entity?: T };

const createRepositoryMock = <T>(): MockRepo<T> => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  create: jest.fn((value: unknown) => value),
  save: jest.fn((value: unknown) => value),
});

describe('OffboardingService', () => {
  let service: OffboardingService;
  let offboardingRequestRepository: MockRepo<OffboardingRequest>;
  let documentRepository: MockRepo<Document>;
  let dataSource: { transaction: jest.Mock };
  let hrAccessService: { assertCanAccessEmployee: jest.Mock };
  let positionAvailabilityService: {
    isPositionAvailableForBranch: jest.Mock;
    isPositionAvailableForDepartment: jest.Mock;
  };
  let offboardingAuditService: { log: jest.Mock };
  let filesService: {
    saveBase64File: jest.Mock;
    savePrivateBase64File: jest.Mock;
  };
  let actor: AuthenticatedUser;

  beforeEach(() => {
    const offboardingWorkflowRepository =
      createRepositoryMock<OffboardingWorkflow>();
    const offboardingWorkflowStepRepository =
      createRepositoryMock<OffboardingWorkflowStep>();
    offboardingRequestRepository = createRepositoryMock<OffboardingRequest>();
    const offboardingTaskRepository = createRepositoryMock<OffboardingTask>();
    const offboardingActionRepository =
      createRepositoryMock<OffboardingAction>();
    const offboardingAccessOperationRepository =
      createRepositoryMock<OffboardingAccessOperation>();
    const offboardingAssetReturnRepository =
      createRepositoryMock<OffboardingAssetReturn>();
    const offboardingSettlementItemRepository =
      createRepositoryMock<OffboardingSettlementItem>();
    const offboardingApprovalRepository =
      createRepositoryMock<OffboardingApproval>();
    const offboardingClearanceRepository =
      createRepositoryMock<OffboardingClearance>();
    const offboardingExitInterviewRepository =
      createRepositoryMock<OffboardingExitInterview>();
    const offboardingAuditLogRepository =
      createRepositoryMock<OffboardingAuditLog>();
    const offboardingNumberSequenceRepository =
      createRepositoryMock<OffboardingNumberSequence>();
    documentRepository = createRepositoryMock<Document>();
    const employeeRepository = createRepositoryMock<Employee>();
    const shiftAssignmentRepository = createRepositoryMock<ShiftAssignment>();
    const shiftScheduleRepository = createRepositoryMock<ShiftSchedule>();
    const employeeTimetableRepository =
      createRepositoryMock<EmployeeTimetable>();
    const attendanceDailySummaryRepository =
      createRepositoryMock<AttendanceDailySummary>();
    const departmentRepository = createRepositoryMock<Department>();
    const positionRepository = createRepositoryMock<Position>();
    const branchRepository = createRepositoryMock<Branch>();
    const companyUserRepository = createRepositoryMock<CompanyUser>();
    const companyUserRoleRepository = createRepositoryMock<CompanyUserRole>();
    const roleRepository = createRepositoryMock<Role>();

    dataSource = {
      transaction: jest.fn(),
    };
    hrAccessService = {
      assertCanAccessEmployee: jest.fn(),
    };
    positionAvailabilityService = {
      isPositionAvailableForBranch: jest.fn().mockResolvedValue(true),
      isPositionAvailableForDepartment: jest.fn().mockResolvedValue(true),
    };
    offboardingAuditService = {
      log: jest.fn(),
    };
    filesService = {
      saveBase64File: jest.fn(),
      savePrivateBase64File: jest.fn(),
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

    service = new OffboardingService(
      dataSource as unknown as DataSource,
      offboardingWorkflowRepository as unknown as Repository<OffboardingWorkflow>,
      offboardingWorkflowStepRepository as unknown as Repository<OffboardingWorkflowStep>,
      offboardingRequestRepository as unknown as Repository<OffboardingRequest>,
      offboardingTaskRepository as unknown as Repository<OffboardingTask>,
      offboardingActionRepository as unknown as Repository<OffboardingAction>,
      offboardingAccessOperationRepository as unknown as Repository<OffboardingAccessOperation>,
      offboardingAssetReturnRepository as unknown as Repository<OffboardingAssetReturn>,
      offboardingSettlementItemRepository as unknown as Repository<OffboardingSettlementItem>,
      offboardingApprovalRepository as unknown as Repository<OffboardingApproval>,
      offboardingClearanceRepository as unknown as Repository<OffboardingClearance>,
      offboardingExitInterviewRepository as unknown as Repository<OffboardingExitInterview>,
      offboardingAuditLogRepository as unknown as Repository<OffboardingAuditLog>,
      offboardingNumberSequenceRepository as unknown as Repository<OffboardingNumberSequence>,
      documentRepository as unknown as Repository<Document>,
      employeeRepository as unknown as Repository<Employee>,
      shiftAssignmentRepository as unknown as Repository<ShiftAssignment>,
      shiftScheduleRepository as unknown as Repository<ShiftSchedule>,
      employeeTimetableRepository as unknown as Repository<EmployeeTimetable>,
      attendanceDailySummaryRepository as unknown as Repository<AttendanceDailySummary>,
      departmentRepository as unknown as Repository<Department>,
      positionRepository as unknown as Repository<Position>,
      branchRepository as unknown as Repository<Branch>,
      companyUserRepository as unknown as Repository<CompanyUser>,
      companyUserRoleRepository as unknown as Repository<CompanyUserRole>,
      roleRepository as unknown as Repository<Role>,
      hrAccessService as unknown as HrAccessService,
      positionAvailabilityService as unknown as PositionAvailabilityService,
      offboardingAuditService as unknown as OffboardingAuditService,
      {} as OffboardingNoticeService,
      {} as OffboardingWorkflowService,
      { emit: jest.fn() } as unknown as EventEmitter2,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      filesService as unknown as FilesService,
      {
        endAssignmentsForExit: jest.fn(),
      } as unknown as EmployeeAssignmentService,
      { log: jest.fn() } as unknown as SecurityEventsService,
      createRepositoryMock<LeaveBalance>() as unknown as Repository<LeaveBalance>,
      {
        calculateAvailableDays: jest.fn().mockReturnValue(0),
      } as unknown as LeaveBalanceLedgerService,
    );
  });

  it('finalizes employee exit and closes future attendance assignments and summaries', async () => {
    const requestForFinalization = {
      id: 77,
      company_id: 10,
      employee_id: 501,
      status: OffboardingRequestStatusEnum.READY_FOR_FINALIZATION,
      offboarding_type: OffboardingTypeEnum.TERMINATION,
      last_working_date: '2026-06-12',
      reason: 'Policy breach',
      access_terminated_at: new Date('2026-06-12T18:00:00.000Z'),
      tasks: [{ status: OffboardingTaskStatusEnum.COMPLETED }],
      actions: [],
      asset_returns: [],
      settlement_items: [],
      approvals: [],
      clearances: [],
      employee: { id: 501, company_user: { id: 11, company_user_id: 11 } },
    };
    offboardingRequestRepository.findOne.mockResolvedValue(
      requestForFinalization,
    );

    const employeeForFinalization = {
      id: 501,
      employment_status: EmploymentStatusEnum.ACTIVE,
      exit_date: null,
      exit_reason: null,
    };

    const requestQueryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOneOrFail: jest.fn().mockResolvedValue(requestForFinalization),
    };
    const requestRepo = {
      createQueryBuilder: jest.fn(() => requestQueryBuilder),
      save: jest.fn((value: unknown) => value),
    };
    const employeeQueryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOneOrFail: jest.fn().mockResolvedValue(employeeForFinalization),
    };
    const employeeRepo = {
      createQueryBuilder: jest.fn(() => employeeQueryBuilder),
      save: jest.fn((value: unknown) => value),
    };
    const shiftAssignments = [
      {
        id: 1,
        employeeId: 501,
        effectiveFrom: '2026-06-01',
        effectiveTo: null,
        status: ShiftAssignmentStatusEnum.ACTIVE,
      },
      {
        id: 2,
        employeeId: 501,
        effectiveFrom: '2026-07-01',
        effectiveTo: null,
        status: ShiftAssignmentStatusEnum.ACTIVE,
      },
    ];
    const shiftAssignmentRepo = {
      find: jest.fn().mockResolvedValue(shiftAssignments),
      save: jest.fn((value: unknown) => value),
    };
    const shiftSchedules = [
      {
        id: 5,
        employeeId: 501,
        effectiveFrom: '2026-06-05',
        effectiveTo: null,
      },
      {
        id: 6,
        employeeId: 501,
        effectiveFrom: '2026-07-10',
        effectiveTo: null,
      },
    ];
    const shiftScheduleRepo = {
      find: jest.fn().mockResolvedValue(shiftSchedules),
      save: jest.fn((value: unknown) => value),
      remove: jest.fn((value: unknown) => value),
    };
    const employeeTimetables = [
      {
        id: 3,
        employeeId: 501,
        effectiveFrom: '2026-06-01',
        effectiveTo: '2026-12-31',
        status: EmployeeTimetableStatusEnum.ACTIVE,
      },
      {
        id: 4,
        employeeId: 501,
        effectiveFrom: '2026-08-01',
        effectiveTo: null,
        status: EmployeeTimetableStatusEnum.ACTIVE,
      },
    ];
    const employeeTimetableRepo = {
      find: jest.fn().mockResolvedValue(employeeTimetables),
      save: jest.fn((value: unknown) => value),
    };
    const deleteBuilder = {
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    };
    const summaryRepo = {
      createQueryBuilder: jest.fn(() => deleteBuilder),
    };
    const leaveBalanceRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    const settlementItemRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: unknown) => value),
      save: jest.fn((value: unknown) => value),
    };
    const accessOperationRepo = {
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn((value: unknown) => value),
      create: jest.fn((value: unknown) => value),
    };

    const manager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity === OffboardingRequest) return requestRepo;
        if (entity === Employee) return employeeRepo;
        if (entity === ShiftAssignment) return shiftAssignmentRepo;
        if (entity === ShiftSchedule) return shiftScheduleRepo;
        if (entity === EmployeeTimetable) return employeeTimetableRepo;
        if (entity === AttendanceDailySummary) return summaryRepo;
        if (entity === LeaveBalance) return leaveBalanceRepo;
        if (entity === OffboardingSettlementItem) return settlementItemRepo;
        if (entity === OffboardingAccessOperation) return accessOperationRepo;
        throw new Error(`Unexpected repository request: ${entity?.name}`);
      }),
    } as unknown as EntityManager;

    dataSource.transaction.mockImplementation(
      (callback: (manager: EntityManager) => unknown) => callback(manager),
    );

    await service.finalizeOffboarding(10, 77, actor);

    expect(employeeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        employment_status: EmploymentStatusEnum.TERMINATED,
        exit_date: '2026-06-12',
        exit_reason: 'Policy breach',
      }),
    );
    expect(shiftAssignmentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, effectiveTo: '2026-06-12' }),
    );
    expect(shiftAssignmentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 2,
        status: ShiftAssignmentStatusEnum.INACTIVE,
      }),
    );
    expect(shiftScheduleRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5, effectiveTo: '2026-06-12' }),
    );
    expect(shiftScheduleRepo.remove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 6 }),
    );
    expect(employeeTimetableRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, effectiveTo: '2026-06-12' }),
    );
    expect(employeeTimetableRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 4,
        status: EmployeeTimetableStatusEnum.INACTIVE,
      }),
    );
    expect(deleteBuilder.execute).toHaveBeenCalled();
  });

  it('blocks finalization while settlement items are unresolved', async () => {
    offboardingRequestRepository.findOne.mockResolvedValue({
      id: 88,
      employee_id: 501,
      status: OffboardingRequestStatusEnum.IN_PROGRESS,
      offboarding_type: OffboardingTypeEnum.RESIGNATION,
      last_working_date: '2026-06-12',
      reason: 'Resigned',
      tasks: [{ status: OffboardingTaskStatusEnum.COMPLETED }],
      actions: [],
      asset_returns: [],
      settlement_items: [{ status: OffboardingSettlementStatusEnum.PENDING }],
      approvals: [],
      clearances: [],
      employee: { id: 501, company_user: { id: 11 } },
    });

    await expect(
      service.completeOffboardingRequest(10, 88, actor),
    ).rejects.toThrow(
      'All settlement items must be resolved before finalization',
    );

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it.each([
    OffboardingRequestStatusEnum.DRAFT,
    OffboardingRequestStatusEnum.REJECTED,
  ])('rejects %s offboarding before scheduling termination', async (status) => {
    offboardingRequestRepository.findOne.mockResolvedValue({
      id: 88,
      status,
      employee: { id: 501 },
      tasks: [],
      approvals: [],
      clearances: [],
    });
    await expect(
      service.completeOffboardingRequest(10, 88, actor),
    ).rejects.toThrow('Only approved, started');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechecks fresh readiness after locking the request', async () => {
    const ready = {
      id: 88,
      status: OffboardingRequestStatusEnum.IN_PROGRESS,
      employee: { id: 501 },
      tasks: [],
      approvals: [],
      clearances: [],
    };
    offboardingRequestRepository.findOne.mockResolvedValue(ready);
    const repository = {
      findOneOrFail: jest.fn().mockResolvedValue(ready),
      findOne: jest.fn().mockResolvedValue({
        ...ready,
        status: OffboardingRequestStatusEnum.CANCELLED,
      }),
      save: jest.fn(),
    };
    const manager = {
      getRepository: () => repository,
    } as unknown as EntityManager;
    dataSource.transaction.mockImplementation(
      (work: (manager: EntityManager) => unknown) => work(manager),
    );
    await expect(
      service.completeOffboardingRequest(10, 88, actor),
    ).rejects.toThrow('Only approved, started');
    expect(repository.findOneOrFail).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'only blocks incomplete required tasks (required: %s)',
    (required) => {
      const request = {
        status: OffboardingRequestStatusEnum.IN_PROGRESS,
        tasks: [
          { status: OffboardingTaskStatusEnum.PENDING, is_required: required },
        ],
        approvals: [],
        clearances: [],
      } as unknown as OffboardingRequest;
      expect(service['buildReadinessSnapshot'](request).ready).toBe(!required);
      if (required)
        expect(() => service['assertReadyForTermination'](request)).toThrow(
          'required offboarding tasks',
        );
      else
        expect(() =>
          service['assertReadyForTermination'](request),
        ).not.toThrow();
    },
  );

  it('blocks access termination until the required exit interview is completed', () => {
    (service as any).configService = { get: jest.fn().mockReturnValue(true) };
    const request = {
      status: OffboardingRequestStatusEnum.IN_PROGRESS,
      tasks: [],
      approvals: [],
      clearances: [],
      actions: [],
      asset_returns: [],
      settlement_items: [],
      exit_interview: null,
    } as unknown as OffboardingRequest;

    expect(service['buildReadinessSnapshot'](request)).toEqual(
      expect.objectContaining({
        ready: false,
        exit_interview_required: true,
        exit_interview_complete: false,
      }),
    );
    expect(() => service['assertReadyForTermination'](request)).toThrow(
      'completed exit interview is required',
    );

    request.exit_interview = {
      status: OffboardingExitInterviewStatusEnum.COMPLETED,
    } as OffboardingExitInterview;
    expect(service['buildReadinessSnapshot'](request).ready).toBe(true);
    expect(() => service['assertReadyForTermination'](request)).not.toThrow();
  });

  it('prevents edits to a submitted or active offboarding request', async () => {
    jest
      .spyOn(service as any, 'findOffboardingRequestOrFail')
      .mockResolvedValue({
        status: OffboardingRequestStatusEnum.IN_PROGRESS,
        employee: { id: 501 },
      });

    await expect(
      service.updateOffboardingRequest(10, 88, { title: 'Changed' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('requires offboarding update permission to waive notice during creation', async () => {
    await expect(
      service.createOffboardingRequest(
        10,
        {
          employee_id: 501,
          title: 'Employee resignation',
          offboarding_type: OffboardingTypeEnum.RESIGNATION,
          reason: 'Personal reasons',
          last_working_date: '2026-11-30',
          notice_period_waived: true,
          notice_period_waiver_reason: 'Exception approved',
        } as any,
        actor,
      ),
    ).rejects.toThrow('Only users with offboarding request update permission');
    expect(hrAccessService.assertCanAccessEmployee).not.toHaveBeenCalled();
  });

  it('marks only the current pending approval level actionable in the queue', async () => {
    const approval = (level: number, status = 'pending') => ({
      id: level,
      status,
      workflow_step: { approval_level: level },
    });
    const approvals = [approval(1), approval(2), approval(3, 'approved')];
    const request = {
      id: 88,
      status: OffboardingRequestStatusEnum.WAITING_APPROVAL,
      approvals,
    };
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest
        .fn()
        .mockResolvedValue([
          approvals.map((item) => ({ ...item, offboarding_request: request })),
          3,
        ]),
    };
    Object.assign(service, {
      offboardingApprovalRepository: { createQueryBuilder: () => query },
      hrAccessService: { assertCompanyScopedActor: jest.fn() },
    });
    const result = await service.findMyOffboardingApprovals(
      { ...actor, companyId: 10, companyMembershipId: 90 },
      {},
    );
    expect(result.data.map((row) => row.is_actionable)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('stores offboarding documents through the shared files service', async () => {
    jest
      .spyOn(service as any, 'findOffboardingRequestOrFail')
      .mockResolvedValue({ employee: { id: 501 } });
    filesService.savePrivateBase64File.mockResolvedValue({
      storedFileName: 'offboarding-77-stored.pdf',
      originalFileName: 'clearance-form.pdf',
      mimeType: 'application/pdf',
      fileExtension: '.pdf',
      fileSize: 16,
      publicPath: '/uploads/documents/offboarding/company-10/offboarding.pdf',
    });
    documentRepository.save.mockImplementation((value: object) => ({
      id: 22,
      ...value,
    }));

    await service.addDocument(
      10,
      77,
      {
        title: 'Clearance Form',
        file: {
          fileName: 'clearance-form.pdf',
          fileSize: 16,
          mimeType: 'application/pdf',
          fileString: Buffer.from('clearance-form').toString('base64'),
        },
      },
      actor,
    );

    expect(filesService.savePrivateBase64File).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'clearance-form.pdf' }),
      expect.objectContaining({
        directorySegments: ['documents', 'offboarding', 'company-10'],
      }),
    );
    expect(documentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        file_name: 'offboarding-77-stored.pdf',
        original_file_name: 'clearance-form.pdf',
        mime_type: 'application/pdf',
        file_extension: '.pdf',
        file_size: '16',
        file_path: '/uploads/documents/offboarding/company-10/offboarding.pdf',
      }),
    );
  });

  describe('assertAssetReturnRules', () => {
    const callRule = (
      status: OffboardingAssetStatusEnum,
      overrides: Partial<{
        received_by_company_user_id: number | null;
        condition_at_return: string | null;
        liability_amount: string | null;
        liability_acknowledged: boolean;
        remarks: string | null;
      }> = {},
    ) =>
      (
        service as unknown as {
          assertAssetReturnRules: (
            status: OffboardingAssetStatusEnum,
            input: {
              received_by_company_user_id: number | null;
              condition_at_return: string | null;
              liability_amount: string | null;
              liability_acknowledged: boolean;
              remarks: string | null;
            },
          ) => void;
        }
      ).assertAssetReturnRules(status, {
        received_by_company_user_id: null,
        condition_at_return: null,
        liability_amount: null,
        liability_acknowledged: false,
        remarks: null,
        ...overrides,
      });

    it('requires a receiver and return condition for RETURNED', () => {
      expect(() => callRule(OffboardingAssetStatusEnum.RETURNED)).toThrow(
        'receiver and a return condition',
      );

      expect(() =>
        callRule(OffboardingAssetStatusEnum.RETURNED, {
          received_by_company_user_id: 5,
          condition_at_return: 'good',
        }),
      ).not.toThrow();
    });

    it('requires a liability amount or explicit acknowledgement for MISSING', () => {
      expect(() => callRule(OffboardingAssetStatusEnum.MISSING)).toThrow(
        'liability amount or an explicit no-liability acknowledgement',
      );

      expect(() =>
        callRule(OffboardingAssetStatusEnum.MISSING, {
          liability_acknowledged: true,
        }),
      ).not.toThrow();

      expect(() =>
        callRule(OffboardingAssetStatusEnum.MISSING, {
          liability_amount: '150.00',
        }),
      ).not.toThrow();
    });

    it('requires a reason in remarks for WAIVED', () => {
      expect(() => callRule(OffboardingAssetStatusEnum.WAIVED)).toThrow(
        'waiver reason',
      );

      expect(() =>
        callRule(OffboardingAssetStatusEnum.WAIVED, {
          remarks: 'Company approved write-off',
        }),
      ).not.toThrow();
    });

    it('does not restrict PENDING items', () => {
      expect(() => callRule(OffboardingAssetStatusEnum.PENDING)).not.toThrow();
    });
  });

  describe('ensureAssetLiabilitySettlementItem', () => {
    const callEnsure = (
      assetReturn: Partial<OffboardingAssetReturn>,
      manager: EntityManager,
    ) =>
      (
        service as unknown as {
          ensureAssetLiabilitySettlementItem: (
            companyId: number,
            offboardingRequestId: number,
            assetReturn: OffboardingAssetReturn,
            actor: AuthenticatedUser,
            manager: EntityManager,
          ) => Promise<void>;
        }
      ).ensureAssetLiabilitySettlementItem(
        10,
        77,
        assetReturn as OffboardingAssetReturn,
        actor,
        manager,
      );

    it('does nothing for a non-MISSING asset return', async () => {
      const settlementRepo = createRepositoryMock<OffboardingSettlementItem>();
      const manager = {
        getRepository: jest.fn(() => settlementRepo),
      } as unknown as EntityManager;

      await callEnsure(
        { id: 1, status: OffboardingAssetStatusEnum.RETURNED },
        manager,
      );

      expect(settlementRepo.findOne).not.toHaveBeenCalled();
      expect(settlementRepo.save).not.toHaveBeenCalled();
    });

    it('creates a linked settlement item for a MISSING asset', async () => {
      const settlementRepo = createRepositoryMock<OffboardingSettlementItem>();
      settlementRepo.findOne.mockResolvedValue(null);
      const manager = {
        getRepository: jest.fn(() => settlementRepo),
      } as unknown as EntityManager;

      await callEnsure(
        {
          id: 5,
          asset_label: 'Company Laptop',
          status: OffboardingAssetStatusEnum.MISSING,
          liability_amount: '500.00',
          liability_currency: 'USD',
          liability_acknowledged: false,
        },
        manager,
      );

      expect(settlementRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            offboarding_request_id: 77,
            source_reference: 'asset-return:5',
          }),
        }),
      );
      expect(settlementRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          source_reference: 'asset-return:5',
          amount: '500.00',
          currency: 'USD',
        }),
      );
    });

    it('does not create a duplicate settlement item on repeated saves', async () => {
      const settlementRepo = createRepositoryMock<OffboardingSettlementItem>();
      const existing = {
        id: 9,
        amount: null,
        currency: null,
        calculation_snapshot: null,
      };
      settlementRepo.findOne.mockResolvedValue(existing);
      const manager = {
        getRepository: jest.fn(() => settlementRepo),
      } as unknown as EntityManager;

      await callEnsure(
        {
          id: 5,
          asset_label: 'Company Laptop',
          status: OffboardingAssetStatusEnum.MISSING,
          liability_amount: '500.00',
          liability_currency: 'USD',
          liability_acknowledged: false,
        },
        manager,
      );

      expect(settlementRepo.save).toHaveBeenCalledTimes(1);
      expect(settlementRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 9, amount: '500.00' }),
      );
    });
  });
});
