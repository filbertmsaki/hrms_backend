import { DataSource, EntityManager, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { OffboardingService } from './offboarding.service';
import { OffboardingWorkflow } from './entities/offboarding-workflow.entity';
import { OffboardingWorkflowStep } from './entities/offboarding-workflow-step.entity';
import { OffboardingRequest } from './entities/offboarding-request.entity';
import { OffboardingTask } from './entities/offboarding-task.entity';
import { OffboardingApproval } from './entities/offboarding-approval.entity';
import { OffboardingClearance } from './entities/offboarding-clearance.entity';
import { OffboardingAuditLog } from './entities/offboarding-audit-log.entity';
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
import { OffboardingTaskStatusEnum } from './enums/offboarding-task-status.enum';
import { OffboardingTypeEnum } from './enums/offboarding-type.enum';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockRepo<T = any> = Record<string, jest.Mock>;

const createRepositoryMock = <T>(): MockRepo<T> => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  save: jest.fn(async (value) => value),
});

describe('OffboardingService', () => {
  let service: OffboardingService;
  let offboardingRequestRepository: MockRepo<OffboardingRequest>;
  let dataSource: { transaction: jest.Mock };
  let actor: AuthenticatedUser;

  beforeEach(() => {
    const offboardingWorkflowRepository =
      createRepositoryMock<OffboardingWorkflow>();
    const offboardingWorkflowStepRepository =
      createRepositoryMock<OffboardingWorkflowStep>();
    offboardingRequestRepository = createRepositoryMock<OffboardingRequest>();
    const offboardingTaskRepository = createRepositoryMock<OffboardingTask>();
    const offboardingApprovalRepository =
      createRepositoryMock<OffboardingApproval>();
    const offboardingClearanceRepository =
      createRepositoryMock<OffboardingClearance>();
    const offboardingAuditLogRepository =
      createRepositoryMock<OffboardingAuditLog>();
    const documentRepository = createRepositoryMock<Document>();
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
      offboardingApprovalRepository as unknown as Repository<OffboardingApproval>,
      offboardingClearanceRepository as unknown as Repository<OffboardingClearance>,
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
      {
        assertCanAccessEmployee: jest.fn(),
      } as unknown as HrAccessService,
      {
        log: jest.fn(),
      } as unknown as OffboardingAuditService,
      {} as OffboardingWorkflowService,
      { emit: jest.fn() } as unknown as EventEmitter2,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
    );
  });

  it('finalizes employee exit and closes future attendance assignments and summaries', async () => {
    offboardingRequestRepository.findOne!.mockResolvedValue({
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
      save: jest.fn(async (value) => value),
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
      save: jest.fn(async (value) => value),
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
      save: jest.fn(async (value) => value),
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
      save: jest.fn(async (value) => value),
      remove: jest.fn(async (value) => value),
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
      save: jest.fn(async (value) => value),
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
      getRepository: jest.fn((entity) => {
        if (entity === OffboardingRequest) return requestRepo;
        if (entity === Employee) return employeeRepo;
        if (entity === ShiftAssignment) return shiftAssignmentRepo;
        if (entity === ShiftSchedule) return shiftScheduleRepo;
        if (entity === EmployeeTimetable) return employeeTimetableRepo;
        if (entity === AttendanceDailySummary) return summaryRepo;
        throw new Error(`Unexpected repository request: ${entity?.name}`);
      }),
    } as unknown as EntityManager;

    dataSource.transaction.mockImplementation(async (callback) =>
      callback(manager),
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
});
