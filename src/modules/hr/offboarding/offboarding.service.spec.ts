import { DataSource, EntityManager, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { OffboardingService } from './offboarding.service';
import { OffboardingWorkflow } from './entities/offboarding-workflow.entity';
import { OffboardingWorkflowStep } from './entities/offboarding-workflow-step.entity';
import { OffboardingRequest } from './entities/offboarding-request.entity';
import { OffboardingTask } from './entities/offboarding-task.entity';
import { OffboardingAction } from './entities/offboarding-action.entity';
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
import { OffboardingAuditService } from './services/offboarding-audit.service';
import { OffboardingWorkflowService } from './services/offboarding-workflow.service';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { OffboardingRequestStatusEnum } from './enums/offboarding-request-status.enum';
import { OffboardingSettlementStatusEnum } from './enums/offboarding-settlement-status.enum';
import { OffboardingTaskStatusEnum } from './enums/offboarding-task-status.enum';
import { OffboardingTypeEnum } from './enums/offboarding-type.enum';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { FilesService } from '../../files/files.service';

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
  let offboardingAuditService: { log: jest.Mock };
  let filesService: { saveBase64File: jest.Mock };
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
    offboardingAuditService = {
      log: jest.fn(),
    };
    filesService = {
      saveBase64File: jest.fn(),
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
      offboardingAssetReturnRepository as unknown as Repository<OffboardingAssetReturn>,
      offboardingSettlementItemRepository as unknown as Repository<OffboardingSettlementItem>,
      offboardingApprovalRepository as unknown as Repository<OffboardingApproval>,
      offboardingClearanceRepository as unknown as Repository<OffboardingClearance>,
      offboardingExitInterviewRepository as unknown as Repository<OffboardingExitInterview>,
      offboardingAuditLogRepository as unknown as Repository<OffboardingAuditLog>,
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
      offboardingAuditService as unknown as OffboardingAuditService,
      {} as OffboardingWorkflowService,
      { emit: jest.fn() } as unknown as EventEmitter2,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      filesService as unknown as FilesService,
    );
  });

  it('finalizes employee exit and closes future attendance assignments and summaries', async () => {
    offboardingRequestRepository.findOne.mockResolvedValue({
      id: 77,
      employee_id: 501,
      status: OffboardingRequestStatusEnum.IN_PROGRESS,
      offboarding_type: OffboardingTypeEnum.TERMINATION,
      last_working_date: '2026-06-12',
      reason: 'Policy breach',
      tasks: [{ status: OffboardingTaskStatusEnum.COMPLETED }],
      approvals: [],
      clearances: [],
      employee: { id: 501, company_user: { id: 11 } },
    });

    const requestRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 77,
        company_id: 10,
        employee_id: 501,
        status: OffboardingRequestStatusEnum.COMPLETED,
        offboarding_type: OffboardingTypeEnum.TERMINATION,
        title: 'Employee exit',
        description: null,
        reason: 'Policy breach',
        notice_date: null,
        last_working_date: '2026-06-12',
        submitted_at: null,
        completed_at: new Date('2026-06-12T10:00:00.000Z'),
        cancelled_at: null,
        progress_percentage: '100.00',
        metadata: null,
        created_at: new Date('2026-06-01T10:00:00.000Z'),
        updated_at: new Date('2026-06-12T10:00:00.000Z'),
        workflow: null,
        tasks: [{ status: OffboardingTaskStatusEnum.COMPLETED }],
        actions: [],
        asset_returns: [],
        settlement_items: [],
        approvals: [],
        clearances: [],
        exit_interview: null,
        employee: {
          id: 501,
          employee_no: 'EMP-501',
          first_name: 'Jane',
          middle_name: null,
          last_name: 'Doe',
          employment_status: EmploymentStatusEnum.TERMINATED,
          company_user: {
            id: 11,
            user: { email: 'jane.doe@example.com' },
          },
        },
      }),
      save: jest.fn((value: unknown) => value),
      findOneOrFail: jest
        .fn()
        .mockResolvedValueOnce({
          id: 77,
          company_id: 10,
          employee_id: 501,
          status: OffboardingRequestStatusEnum.IN_PROGRESS,
          offboarding_type: OffboardingTypeEnum.TERMINATION,
          last_working_date: '2026-06-12',
          reason: 'Policy breach',
        })
        .mockResolvedValueOnce({
          id: 77,
          employee: {
            id: 501,
            employment_status: EmploymentStatusEnum.TERMINATED,
            exit_date: '2026-06-12',
          },
        }),
    };
    const employeeRepo = {
      findOneOrFail: jest.fn().mockResolvedValue({
        id: 501,
        employment_status: EmploymentStatusEnum.ACTIVE,
        exit_date: null,
        exit_reason: null,
      }),
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

    const manager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity === OffboardingRequest) return requestRepo;
        if (entity === Employee) return employeeRepo;
        if (entity === ShiftAssignment) return shiftAssignmentRepo;
        if (entity === ShiftSchedule) return shiftScheduleRepo;
        if (entity === EmployeeTimetable) return employeeTimetableRepo;
        if (entity === AttendanceDailySummary) return summaryRepo;
        throw new Error(`Unexpected repository request: ${entity?.name}`);
      }),
    } as unknown as EntityManager;

    dataSource.transaction.mockImplementation(
      (callback: (manager: EntityManager) => unknown) => callback(manager),
    );

    await service.completeOffboardingRequest(10, 77, actor);

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

  it('stores offboarding documents through the shared files service', async () => {
    jest
      .spyOn(service as any, 'findOffboardingRequestOrFail')
      .mockResolvedValue({ employee: { id: 501 } });
    filesService.saveBase64File.mockResolvedValue({
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

    expect(filesService.saveBase64File).toHaveBeenCalledWith(
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
});
