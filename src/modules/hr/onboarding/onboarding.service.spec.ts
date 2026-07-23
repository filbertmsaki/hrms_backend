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
import { Document } from '../documents/entities/document.entity';
import { Employee } from '../employees/entities/employee.entity';
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
import { FilesService } from '../../files/files.service';

type MockRepo = Record<string, jest.Mock>;

const createRepositoryMock = <T>(): MockRepo => ({
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  create: jest.fn((value: T) => value),
  save: jest.fn((value: T) => Promise.resolve(value)),
});

describe('OnboardingService', () => {
  let service: OnboardingService;
  let onboardingRequestRepository: MockRepo;
  let employeeRepository: MockRepo;
  let documentRepository: MockRepo;
  let dataSource: { transaction: jest.Mock };
  let leaveBalanceService: {
    getFiscalYearFromDate: jest.Mock;
    ensureBalanceForEmployee: jest.Mock;
  };
  let hrAccessService: { assertCanAccessEmployee: jest.Mock };
  let onboardingAuditService: { log: jest.Mock };
  let filesService: { saveBase64File: jest.Mock };
  let shiftSchedulesService: { create: jest.Mock };
  let employeeTimetablesService: { create: jest.Mock };
  let employeeDeviceAssignmentsService: { assignDevices: jest.Mock };
  let actor: AuthenticatedUser;

  beforeEach(() => {
    const onboardingWorkflowRepository =
      createRepositoryMock<OnboardingWorkflow>();
    const onboardingWorkflowStepRepository =
      createRepositoryMock<OnboardingWorkflowStep>();
    onboardingRequestRepository = createRepositoryMock<OnboardingRequest>();
    const onboardingTaskRepository = createRepositoryMock<OnboardingTask>();
    const onboardingApprovalRepository =
      createRepositoryMock<OnboardingApproval>();
    const onboardingAuditLogRepository =
      createRepositoryMock<OnboardingAuditLog>();
    documentRepository = createRepositoryMock<Document>();
    employeeRepository = createRepositoryMock<Employee>();
    const departmentRepository = createRepositoryMock<Department>();
    const branchRepository = createRepositoryMock<Branch>();
    const companyUserRepository = createRepositoryMock<CompanyUser>();
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
      assertCanAccessEmployee: jest.fn(),
    };
    onboardingAuditService = {
      log: jest.fn(),
    };
    filesService = {
      saveBase64File: jest.fn(),
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
      {} as OnboardingWorkflowService,
      leaveBalanceService as unknown as LeaveBalanceService,
      shiftSchedulesService as unknown as ShiftSchedulesService,
      employeeTimetablesService as unknown as EmployeeTimetablesService,
      employeeDeviceAssignmentsService as unknown as EmployeeDeviceAssignmentsService,
      { emit: jest.fn() } as unknown as EventEmitter2,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      filesService as unknown as FilesService,
    );
  });

  it('activates the employee and initializes active leave balances on completion', async () => {
    onboardingRequestRepository.findOne.mockResolvedValue({
      id: 55,
      employee_id: 501,
      status: OnboardingRequestStatusEnum.IN_PROGRESS,
      tasks: [{ status: OnboardingTaskStatusEnum.COMPLETED }],
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

    const manager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity === OnboardingRequest) return requestRepo;
        if (entity === Employee) return employeeRepo;
        if (entity === LeaveType) return leaveTypeRepo;
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
    expect(leaveBalanceService.ensureBalanceForEmployee).toHaveBeenCalledTimes(
      2,
    );
    expect(
      leaveBalanceService.ensureBalanceForEmployee,
    ).toHaveBeenNthCalledWith(
      1,
      10,
      expect.objectContaining({ id: 501 }),
      7,
      '2026',
      manager,
    );
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
    filesService.saveBase64File.mockResolvedValue({
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

    expect(filesService.saveBase64File).toHaveBeenCalledWith(
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
