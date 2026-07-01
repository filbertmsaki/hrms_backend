import { DataSource, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { LeaveService } from './leave.service';
import { LeaveType } from './entities/leave-type.entity';
import { LeaveRequest } from './entities/leave-request.entity';
import { LeavePolicy } from './entities/leave-policy.entity';
import { LeaveBalance } from './entities/leave-balance.entity';
import { LeaveApprovalWorkflow } from './entities/leave-approval-workflow.entity';
import { LeaveApprovalWorkflowStep } from './entities/leave-approval-workflow-step.entity';
import { LeaveMedicalDetail } from './entities/leave-medical-detail.entity';
import { LeaveDocument } from './entities/leave-document.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Position } from '../positions/entities/position.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { Role } from '../../roles/entities/role.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { LeaveAuditService } from './services/leave-audit.service';
import { LeaveBalanceService } from './services/leave-balance.service';
import { LeaveWorkflowService } from './services/leave-workflow.service';
import { LeavePdfService } from './services/leave-pdf.service';
import { AttendanceRecalculationJob } from '../attendance/processing/entities/attendance-recalculation-job.entity';
import { AttendanceHoliday } from '../attendance/holidays/entities/holiday.entity';
import { HolidayGroup } from '../attendance/holidays/entities/holiday-group.entity';
import { LeaveRecordStatusEnum } from './enums/leave-record-status.enum';
import { LeaveGenderRestrictionEnum } from './enums/leave-gender-restriction.enum';
import { LeaveStatusEnum } from './enums/leave-status.enum';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockRepo<T = any> = Record<string, jest.Mock>;

const createRepositoryMock = <T>(): MockRepo<T> => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findOneOrFail: jest.fn(),
  save: jest.fn(async (value) => value),
  create: jest.fn((value) => value),
  createQueryBuilder: jest.fn(),
});

const createQueryBuilderMock = () => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
  getMany: jest.fn(),
  getManyAndCount: jest.fn(),
});

describe('LeaveService', () => {
  let service: LeaveService;
  let dataSource: { transaction: jest.Mock };
  let leaveTypeRepository: MockRepo<LeaveType>;
  let leavePolicyRepository: MockRepo<LeavePolicy>;
  let leaveBalanceRepository: MockRepo<LeaveBalance>;
  let leaveRequestRepository: MockRepo<LeaveRequest>;
  let leaveApprovalWorkflowRepository: MockRepo<LeaveApprovalWorkflow>;
  let leaveApprovalWorkflowStepRepository: MockRepo<LeaveApprovalWorkflowStep>;
  let leaveMedicalDetailRepository: MockRepo<LeaveMedicalDetail>;
  let leaveDocumentRepository: MockRepo<LeaveDocument>;
  let attendanceHolidayRepository: MockRepo<AttendanceHoliday>;
  let holidayGroupRepository: MockRepo<HolidayGroup>;
  let employeeRepository: MockRepo<Employee>;
  let branchRepository: MockRepo<Branch>;
  let departmentRepository: MockRepo<Department>;
  let positionRepository: MockRepo<Position>;
  let companyUserRepository: MockRepo<CompanyUser>;
  let roleRepository: MockRepo<Role>;
  let attendanceRecalculationJobRepository: MockRepo<AttendanceRecalculationJob>;
  let hrAccessService: {
    assertCanAccessEmployee: jest.Mock;
    assertCompanyScopedActor: jest.Mock;
    hasCompanyWideBranchAccess: jest.Mock;
  };
  let leaveAuditService: { log: jest.Mock };
  let leaveBalanceService: {
    toDecimal: jest.Mock;
    toNumber: jest.Mock;
    getFiscalYearFromDate: jest.Mock;
    resolvePolicyAssignment: jest.Mock;
    ensureBalanceForEmployee: jest.Mock;
    ensureBalancesForEmployeeYear: jest.Mock;
    recalculateBalance: jest.Mock;
    applyManualAdjustment: jest.Mock;
    findBalanceAdjustments: jest.Mock;
    generateBalancesForCompany: jest.Mock;
    reserveDays: jest.Mock;
    consumeReservedDays: jest.Mock;
    releaseReservedDays: jest.Mock;
    calculateAvailableDays: jest.Mock;
  };
  let leaveWorkflowService: {
    initializeWorkflowForRequest: jest.Mock;
    applyApprovalAction: jest.Mock;
    closeAllPendingApprovals: jest.Mock;
  };
  let actor: AuthenticatedUser;

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(),
    };
    leaveTypeRepository = createRepositoryMock();
    leavePolicyRepository = createRepositoryMock();
    leaveBalanceRepository = createRepositoryMock();
    leaveRequestRepository = createRepositoryMock();
    leaveApprovalWorkflowRepository = createRepositoryMock();
    leaveApprovalWorkflowStepRepository = createRepositoryMock();
    leaveMedicalDetailRepository = createRepositoryMock();
    leaveDocumentRepository = createRepositoryMock();
    attendanceHolidayRepository = createRepositoryMock();
    holidayGroupRepository = createRepositoryMock();
    employeeRepository = createRepositoryMock();
    branchRepository = createRepositoryMock();
    departmentRepository = createRepositoryMock();
    positionRepository = createRepositoryMock();
    companyUserRepository = createRepositoryMock();
    roleRepository = createRepositoryMock();
    attendanceRecalculationJobRepository = createRepositoryMock();
    hrAccessService = {
      assertCanAccessEmployee: jest.fn(),
      assertCompanyScopedActor: jest.fn(),
      hasCompanyWideBranchAccess: jest.fn().mockReturnValue(true),
    };
    leaveAuditService = {
      log: jest.fn(),
    };
    leaveBalanceService = {
      toDecimal: jest.fn((value: number) => value.toFixed(2)),
      toNumber: jest.fn((value: string | number | null | undefined) =>
        value === null || value === undefined ? 0 : Number(value),
      ),
      getFiscalYearFromDate: jest.fn(() => '2026'),
      resolvePolicyAssignment: jest.fn(),
      ensureBalanceForEmployee: jest.fn(),
      ensureBalancesForEmployeeYear: jest.fn(),
      recalculateBalance: jest.fn(async (_companyId, _employee, _leaveTypeId, _fiscalYear, _manager, balance) => balance),
      applyManualAdjustment: jest.fn(),
      findBalanceAdjustments: jest.fn(),
      generateBalancesForCompany: jest.fn(),
      reserveDays: jest.fn(),
      consumeReservedDays: jest.fn(),
      releaseReservedDays: jest.fn(),
      calculateAvailableDays: jest.fn(() => 10),
    };
    leaveWorkflowService = {
      initializeWorkflowForRequest: jest.fn(),
      applyApprovalAction: jest.fn(),
      closeAllPendingApprovals: jest.fn(),
    };
    actor = {
      id: 9,
      email: 'approver@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 10,
      companyMembershipId: 33,
      roles: [],
      permissions: [],
    };

    service = new LeaveService(
      dataSource as unknown as DataSource,
      leaveTypeRepository as unknown as Repository<LeaveType>,
      leavePolicyRepository as unknown as Repository<LeavePolicy>,
      leaveBalanceRepository as unknown as Repository<LeaveBalance>,
      leaveRequestRepository as unknown as Repository<LeaveRequest>,
      leaveApprovalWorkflowRepository as unknown as Repository<LeaveApprovalWorkflow>,
      leaveApprovalWorkflowStepRepository as unknown as Repository<LeaveApprovalWorkflowStep>,
      leaveMedicalDetailRepository as unknown as Repository<LeaveMedicalDetail>,
      leaveDocumentRepository as unknown as Repository<LeaveDocument>,
      attendanceHolidayRepository as unknown as Repository<AttendanceHoliday>,
      holidayGroupRepository as unknown as Repository<HolidayGroup>,
      employeeRepository as unknown as Repository<Employee>,
      branchRepository as unknown as Repository<Branch>,
      departmentRepository as unknown as Repository<Department>,
      positionRepository as unknown as Repository<Position>,
      companyUserRepository as unknown as Repository<CompanyUser>,
      roleRepository as unknown as Repository<Role>,
      attendanceRecalculationJobRepository as unknown as Repository<AttendanceRecalculationJob>,
      hrAccessService as unknown as HrAccessService,
      leaveAuditService as unknown as LeaveAuditService,
      leaveBalanceService as unknown as LeaveBalanceService,
      leaveWorkflowService as unknown as LeaveWorkflowService,
      {} as LeavePdfService,
      { emit: jest.fn() } as unknown as EventEmitter2,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
    );
  });

  it('submits a draft leave request and queues attendance recalculation when auto-approved', async () => {
    const draftRequest = {
      id: 77,
      company_id: 10,
      employee_id: 501,
      leave_type_id: 7,
      leave_no: 'LV-2026-000001',
      start_date: '2026-06-10',
      end_date: '2026-06-10',
      total_days: '1.00',
      reason: ' Family event ',
      current_approval_level: 0,
      status: LeaveStatusEnum.DRAFT,
      rejection_reason: null,
      applied_at: null,
      approved_at: null,
      cancelled_at: null,
      created_at: new Date('2026-06-09T00:00:00Z'),
      updated_at: new Date('2026-06-09T00:00:00Z'),
      employee: {
        id: 501,
        company_user_id: 44,
        employee_no: 'EMP-501',
        first_name: 'Alice',
        last_name: 'Jones',
        middle_name: null,
        gender: 'female',
        employment_status: EmploymentStatusEnum.ACTIVE,
        hire_date: '2025-01-01',
        primary_department_id: 2,
        primary_position_id: 3,
        primary_department: { id: 2, name: 'Operations' },
        primary_position: { id: 3, name: 'Analyst' },
        company_user: { id: 44 },
      },
    };
    const finalRequest = {
      ...draftRequest,
      reason: 'Family event',
      status: LeaveStatusEnum.APPROVED,
      applied_at: new Date('2026-06-09T01:00:00Z'),
      approved_at: new Date('2026-06-09T01:00:00Z'),
      leave_type: {
        id: 7,
        name: 'Emergency Leave',
        code: 'EL',
      },
      approvals: [],
      documents: [],
      medical_detail: null,
    };
    const balance = {
      id: 1,
      used_days: '0.00',
      pending_days: '0.00',
      allocated_days: '10.00',
      carried_forward_days: '0.00',
      expired_days: '0.00',
    };
    const overlapBuilder = createQueryBuilderMock();
    overlapBuilder.getOne.mockResolvedValue(null);
    const attendanceHolidayBuilder = createQueryBuilderMock();
    attendanceHolidayBuilder.getMany = jest.fn().mockResolvedValue([]);
    const managerLeaveRequestRepository = {
      findOne: jest.fn().mockResolvedValue({ ...draftRequest }),
      save: jest.fn(async (value) => value),
      findOneOrFail: jest.fn().mockResolvedValue(finalRequest),
    };
    const managerRecalculationRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === LeaveRequest) {
          return managerLeaveRequestRepository;
        }
        if (entity === AttendanceRecalculationJob) {
          return managerRecalculationRepository;
        }
        throw new Error('Unexpected repository request');
      }),
    };

    leaveRequestRepository.findOne!.mockResolvedValue(draftRequest);
    leaveRequestRepository.createQueryBuilder!.mockReturnValue(overlapBuilder);
    attendanceHolidayRepository.createQueryBuilder!.mockReturnValue(
      attendanceHolidayBuilder,
    );
    leaveTypeRepository.findOne!.mockResolvedValue({
      id: 7,
      company_id: 10,
      name: 'Emergency Leave',
      code: 'EL',
      status: LeaveRecordStatusEnum.ACTIVE,
      gender_restriction: LeaveGenderRestrictionEnum.ANY,
      max_days_per_year: '10.00',
      is_carry_forward_allowed: false,
      max_carry_forward_days: '0.00',
      is_paid: true,
      requires_attachment: false,
      description: null,
    });
    leaveBalanceService.resolvePolicyAssignment.mockResolvedValue({
      policy: {
        allow_negative_balance: false,
        max_consecutive_days: null,
        min_service_months: 0,
      },
      policyType: {
        max_per_request_days: null,
        requires_approval: false,
      },
    });
    leaveBalanceService.ensureBalanceForEmployee.mockResolvedValue(balance);
    dataSource.transaction.mockImplementation(async (callback) =>
      callback(manager),
    );

    const result = await service.submitLeaveRequest(10, 77, actor);

    expect(result.status).toBe(LeaveStatusEnum.APPROVED);
    expect(managerRecalculationRepository.save).toHaveBeenCalledTimes(1);
    expect(managerRecalculationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 10,
        employeeId: 501,
        dateFrom: '2026-06-10',
        dateTo: '2026-06-10',
        reason: 'Leave request auto-approved',
      }),
    );
    expect(
      leaveWorkflowService.initializeWorkflowForRequest,
    ).not.toHaveBeenCalled();
    expect(leaveAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'leave_request.submitted',
        leave_request_id: 77,
      }),
    );
  });

  it('rejects leave requests for employees who are no longer active', async () => {
    employeeRepository.findOne!.mockResolvedValue({
      id: 501,
      employment_status: EmploymentStatusEnum.EXITED,
      exit_date: '2026-06-10',
      gender: 'female',
      hire_date: '2025-01-01',
      primary_department_id: 2,
      primary_position_id: 3,
      company_user: {
        id: 44,
        company_id: 10,
      },
    });

    await expect(
      service.createLeaveRequest(
        10,
        {
          employee_id: 501,
          leave_type_id: 7,
          start_date: '2026-06-12',
          end_date: '2026-06-12',
          reason: 'Personal errand',
          submit: true,
        },
        actor,
      ),
    ).rejects.toThrow(
      'Only active employees can create or submit leave requests.',
    );

    expect(leaveTypeRepository.findOne).not.toHaveBeenCalled();
  });

  it('counts attendance holidays when calculating leave days for the employee branch', async () => {
    const overlapBuilder = createQueryBuilderMock();
    overlapBuilder.getOne.mockResolvedValue(null);
    const attendanceHolidayBuilder = createQueryBuilderMock();
    attendanceHolidayBuilder.getMany = jest.fn().mockResolvedValue([
      {
        id: 1,
        companyId: 10,
        branchId: 2,
        date: '2026-06-10',
      },
    ]);

    employeeRepository.findOne!.mockResolvedValue({
      id: 501,
      employment_status: EmploymentStatusEnum.ACTIVE,
      exit_date: null,
      gender: 'female',
      hire_date: '2025-01-01',
      primary_branch_id: 2,
      primary_department_id: 2,
      primary_position_id: 3,
      company_user: {
        id: 44,
        company_id: 10,
      },
    });
    leaveTypeRepository.findOne!.mockResolvedValue({
      id: 7,
      company_id: 10,
      name: 'Emergency Leave',
      code: 'EL',
      status: LeaveRecordStatusEnum.ACTIVE,
      gender_restriction: LeaveGenderRestrictionEnum.ANY,
      max_days_per_year: '10.00',
      is_carry_forward_allowed: false,
      max_carry_forward_days: '0.00',
      is_paid: true,
      requires_attachment: false,
      description: null,
    });
    leaveRequestRepository.createQueryBuilder!.mockReturnValue(overlapBuilder);
    attendanceHolidayRepository.createQueryBuilder!.mockReturnValue(
      attendanceHolidayBuilder,
    );

    await expect(
      service.createLeaveRequest(
        10,
        {
          employee_id: 501,
          leave_type_id: 7,
          start_date: '2026-06-10',
          end_date: '2026-06-10',
          reason: 'Public holiday overlap',
          submit: true,
        },
        actor,
      ),
    ).rejects.toThrow(
      'Selected period results in zero leave days after holidays/weekends',
    );
  });
});
