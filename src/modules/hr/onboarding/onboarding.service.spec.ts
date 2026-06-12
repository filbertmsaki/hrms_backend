import { DataSource, EntityManager, Repository } from 'typeorm';
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
import { Position } from '../positions/entities/position.entity';
import { Branch } from '../branches/entities/branch.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
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

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const createRepositoryMock = <T>(): MockRepo<T> => ({
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  save: jest.fn(async (value) => value),
});

describe('OnboardingService', () => {
  let service: OnboardingService;
  let onboardingRequestRepository: MockRepo<OnboardingRequest>;
  let employeeRepository: MockRepo<Employee>;
  let dataSource: { transaction: jest.Mock };
  let leaveBalanceService: {
    getFiscalYearFromDate: jest.Mock;
    ensureBalanceForEmployee: jest.Mock;
  };
  let actor: AuthenticatedUser;

  beforeEach(() => {
    const onboardingWorkflowRepository = createRepositoryMock<OnboardingWorkflow>();
    const onboardingWorkflowStepRepository = createRepositoryMock<OnboardingWorkflowStep>();
    onboardingRequestRepository = createRepositoryMock<OnboardingRequest>();
    const onboardingTaskRepository = createRepositoryMock<OnboardingTask>();
    const onboardingApprovalRepository = createRepositoryMock<OnboardingApproval>();
    const onboardingAuditLogRepository = createRepositoryMock<OnboardingAuditLog>();
    const documentRepository = createRepositoryMock<Document>();
    employeeRepository = createRepositoryMock<Employee>();
    const departmentRepository = createRepositoryMock<Department>();
    const positionRepository = createRepositoryMock<Position>();
    const branchRepository = createRepositoryMock<Branch>();
    const companyUserRepository = createRepositoryMock<CompanyUser>();
    const roleRepository = createRepositoryMock<Role>();

    dataSource = {
      transaction: jest.fn(),
    };
    leaveBalanceService = {
      getFiscalYearFromDate: jest.fn(() => '2026'),
      ensureBalanceForEmployee: jest.fn(),
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
      onboardingWorkflowRepository as Repository<OnboardingWorkflow>,
      onboardingWorkflowStepRepository as Repository<OnboardingWorkflowStep>,
      onboardingRequestRepository as Repository<OnboardingRequest>,
      onboardingTaskRepository as Repository<OnboardingTask>,
      onboardingApprovalRepository as Repository<OnboardingApproval>,
      onboardingAuditLogRepository as Repository<OnboardingAuditLog>,
      documentRepository as Repository<Document>,
      employeeRepository as Repository<Employee>,
      departmentRepository as Repository<Department>,
      positionRepository as Repository<Position>,
      branchRepository as Repository<Branch>,
      companyUserRepository as Repository<CompanyUser>,
      roleRepository as Repository<Role>,
      {
        assertCanAccessEmployee: jest.fn(),
      } as unknown as HrAccessService,
      {
        log: jest.fn(),
      } as unknown as OnboardingAuditService,
      {} as OnboardingWorkflowService,
      leaveBalanceService as unknown as LeaveBalanceService,
    );
  });

  it('activates the employee and initializes active leave balances on completion', async () => {
    onboardingRequestRepository.findOne!.mockResolvedValue({
      id: 55,
      employee_id: 501,
      status: OnboardingRequestStatusEnum.IN_PROGRESS,
      tasks: [{ status: OnboardingTaskStatusEnum.COMPLETED }],
      approvals: [],
      employee: { id: 501, company_user: { id: 11 } },
    });

    const requestRepo = {
      save: jest.fn(async (value) => value),
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
      save: jest.fn(async (value) => value),
    };
    const leaveTypeRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 7, status: LeaveRecordStatusEnum.ACTIVE },
        { id: 8, status: LeaveRecordStatusEnum.ACTIVE },
      ]),
    };

    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === OnboardingRequest) return requestRepo;
        if (entity === Employee) return employeeRepo;
        if (entity === LeaveType) return leaveTypeRepo;
        throw new Error(`Unexpected repository request: ${entity?.name}`);
      }),
    } as unknown as EntityManager;

    dataSource.transaction.mockImplementation(async (callback) => callback(manager));

    await service.completeOnboarding(10, 55, actor);

    expect(employeeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        employment_status: EmploymentStatusEnum.ACTIVE,
        hire_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
    expect(leaveBalanceService.getFiscalYearFromDate).toHaveBeenCalled();
    expect(leaveBalanceService.ensureBalanceForEmployee).toHaveBeenCalledTimes(2);
    expect(leaveBalanceService.ensureBalanceForEmployee).toHaveBeenNthCalledWith(
      1,
      10,
      expect.objectContaining({ id: 501 }),
      7,
      '2026',
      manager,
    );
  });
});
