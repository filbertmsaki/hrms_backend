import { DataSource, EntityManager, Repository } from 'typeorm';
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
import { LeaveNumberSequence } from './entities/leave-number-sequence.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeGrade } from '../grades/entities/employee-grade.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Position } from '../positions/entities/position.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { Role } from '../../roles/entities/role.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { PositionAvailabilityService } from '../shared/position-availability.service';
import { LeaveAuditService } from './services/leave-audit.service';
import { LeaveBalanceLedgerService } from './services/leave-balance-ledger.service';
import { LeaveBalanceService } from './services/leave-balance.service';
import { LeaveWorkflowService } from './services/leave-workflow.service';
import { LeaveDurationCalculatorService } from './services/leave-duration-calculator.service';
import { LeavePdfService } from './services/leave-pdf.service';
import { AttendanceRecalculationJob } from '../attendance/processing/entities/attendance-recalculation-job.entity';
import { AttendanceHoliday } from '../attendance/holidays/entities/holiday.entity';
import { HolidayGroup } from '../attendance/holidays/entities/holiday-group.entity';
import { LeaveRecordStatusEnum } from './enums/leave-record-status.enum';
import { LeaveGenderRestrictionEnum } from './enums/leave-gender-restriction.enum';
import { LeaveStatusEnum } from './enums/leave-status.enum';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { FilesService } from '../../files/files.service';

type MockRepo = Record<string, jest.Mock>;

const createRepositoryMock = (): MockRepo => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findOneOrFail: jest.fn(),
  save: jest.fn((value: unknown) => value),
  create: jest.fn((value: unknown) => value),
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
  let leaveTypeRepository: MockRepo;
  let leavePolicyRepository: MockRepo;
  let leaveNumberSequenceRepository: MockRepo;
  let leaveBalanceRepository: MockRepo;
  let leaveRequestRepository: MockRepo;
  let leaveApprovalWorkflowRepository: MockRepo;
  let leaveApprovalWorkflowStepRepository: MockRepo;
  let leaveMedicalDetailRepository: MockRepo;
  let leaveDocumentRepository: MockRepo;
  let attendanceHolidayRepository: MockRepo;
  let holidayGroupRepository: MockRepo;
  let employeeRepository: MockRepo;
  let branchRepository: MockRepo;
  let departmentRepository: MockRepo;
  let employeeGradeRepository: MockRepo;
  let positionRepository: MockRepo;
  let companyUserRepository: MockRepo;
  let roleRepository: MockRepo;
  let attendanceRecalculationJobRepository: MockRepo;
  let hrAccessService: {
    assertCanAccessEmployee: jest.Mock;
    assertCompanyScopedActor: jest.Mock;
    hasCompanyWideBranchAccess: jest.Mock;
  };
  let positionAvailabilityService: {
    isPositionAvailableForBranch: jest.Mock;
    isPositionAvailableForDepartment: jest.Mock;
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
  let leaveBalanceLedgerService: {
    reserveLeave: jest.Mock;
    consumeReservedLeave: jest.Mock;
    releaseReservedLeave: jest.Mock;
    reverseApprovedLeave: jest.Mock;
    applyManualAdjustment: jest.Mock;
    findTransactions: jest.Mock;
  };
  let leaveWorkflowService: {
    initializeWorkflowForRequest: jest.Mock;
    applyApprovalAction: jest.Mock;
    closeAllPendingApprovals: jest.Mock;
  };
  let leaveDurationCalculatorService: { calculate: jest.Mock };
  let filesService: {
    saveBase64File: jest.Mock;
    savePrivateBase64File: jest.Mock;
  };
  let actor: AuthenticatedUser;

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(),
    };
    leaveTypeRepository = createRepositoryMock();
    leavePolicyRepository = createRepositoryMock();
    leaveNumberSequenceRepository = createRepositoryMock();
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
    employeeGradeRepository = createRepositoryMock();
    positionRepository = createRepositoryMock();
    companyUserRepository = createRepositoryMock();
    roleRepository = createRepositoryMock();
    attendanceRecalculationJobRepository = createRepositoryMock();
    hrAccessService = {
      assertCanAccessEmployee: jest.fn(),
      assertCompanyScopedActor: jest.fn(),
      hasCompanyWideBranchAccess: jest.fn().mockReturnValue(true),
    };
    positionAvailabilityService = {
      isPositionAvailableForBranch: jest.fn().mockResolvedValue(true),
      isPositionAvailableForDepartment: jest.fn().mockResolvedValue(true),
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
      recalculateBalance: jest.fn(
        (
          _companyId: unknown,
          _employee: unknown,
          _leaveTypeId: unknown,
          _fiscalYear: unknown,
          _manager: unknown,
          balance: unknown,
        ) => balance,
      ),
      applyManualAdjustment: jest.fn(),
      findBalanceAdjustments: jest.fn(),
      generateBalancesForCompany: jest.fn(),
      reserveDays: jest.fn(),
      consumeReservedDays: jest.fn(),
      releaseReservedDays: jest.fn(),
      calculateAvailableDays: jest.fn(() => 10),
    };
    leaveBalanceLedgerService = {
      reserveLeave: jest.fn((balance: unknown) => ({
        balance,
        created: true,
        transaction: { id: 1 },
      })),
      consumeReservedLeave: jest.fn((balance: unknown) => ({
        balance,
        created: true,
        transaction: { id: 2 },
      })),
      releaseReservedLeave: jest.fn((balance: unknown) => ({
        balance,
        created: true,
        transaction: { id: 3 },
      })),
      reverseApprovedLeave: jest.fn((balance: unknown) => ({
        balance,
        created: true,
        transaction: { id: 4 },
      })),
      applyManualAdjustment: jest.fn(),
      findTransactions: jest.fn(),
    };
    leaveWorkflowService = {
      initializeWorkflowForRequest: jest.fn(),
      applyApprovalAction: jest.fn(),
      closeAllPendingApprovals: jest.fn(),
    };
    leaveDurationCalculatorService = {
      calculate: jest.fn().mockResolvedValue({
        totalDays: 1,
        requestedMinutes: null,
        snapshot: {
          duration_type: 'FULL_DAY',
          start_date: '2026-06-10',
          end_date: '2026-06-10',
          start_time: null,
          end_time: null,
          included_dates: ['2026-06-10'],
          excluded_dates: [],
          working_day_minutes: 480,
          policy_id: null,
          calculated_at: '2026-08-03T00:00:00.000Z',
        },
        hash: 'leave-calc-hash',
      }),
    };
    filesService = {
      saveBase64File: jest.fn(),
      savePrivateBase64File: jest.fn(),
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
      leaveNumberSequenceRepository as unknown as Repository<LeaveNumberSequence>,
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
      employeeGradeRepository as unknown as Repository<EmployeeGrade>,
      positionRepository as unknown as Repository<Position>,
      companyUserRepository as unknown as Repository<CompanyUser>,
      roleRepository as unknown as Repository<Role>,
      attendanceRecalculationJobRepository as unknown as Repository<AttendanceRecalculationJob>,
      hrAccessService as unknown as HrAccessService,
      positionAvailabilityService as unknown as PositionAvailabilityService,
      leaveAuditService as unknown as LeaveAuditService,
      leaveBalanceService as unknown as LeaveBalanceService,
      leaveBalanceLedgerService as unknown as LeaveBalanceLedgerService,
      leaveDurationCalculatorService as unknown as LeaveDurationCalculatorService,
      leaveWorkflowService as unknown as LeaveWorkflowService,
      {} as LeavePdfService,
      { emit: jest.fn() } as unknown as EventEmitter2,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      filesService as unknown as FilesService,
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
      save: jest.fn((value: unknown) => value),
      findOneOrFail: jest.fn().mockResolvedValue(finalRequest),
    };
    const managerRecalculationRepository = {
      create: jest.fn((value: unknown) => value),
      save: jest.fn((value: unknown) => value),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === LeaveRequest) {
          return managerLeaveRequestRepository;
        }
        if (entity === LeaveType) {
          return {
            findOne: jest
              .fn()
              .mockResolvedValue({ requires_attachment: false }),
          };
        }
        if (entity === AttendanceRecalculationJob) {
          return managerRecalculationRepository;
        }
        throw new Error('Unexpected repository request');
      }),
    };

    leaveRequestRepository.findOne.mockResolvedValue(draftRequest);
    leaveRequestRepository.createQueryBuilder.mockReturnValue(overlapBuilder);
    attendanceHolidayRepository.createQueryBuilder.mockReturnValue(
      attendanceHolidayBuilder,
    );
    leaveTypeRepository.findOne.mockResolvedValue({
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
    dataSource.transaction.mockImplementation(
      (callback: (manager: unknown) => unknown) => callback(manager),
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

  it('blocks workflow submission when the leave type requires evidence and no document is attached', async () => {
    const leaveRequest = {
      id: 77,
      leave_type_id: 7,
      total_days: '1.00',
      start_date: '2026-06-10',
      approval_cycle: 1,
    } as LeaveRequest;
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === LeaveRequest) return { save: jest.fn() };
        if (entity === LeaveType) {
          return {
            findOne: jest.fn().mockResolvedValue({
              id: 7,
              company_id: 10,
              requires_attachment: true,
            }),
          };
        }
        if (entity === LeaveDocument) {
          return { findOne: jest.fn().mockResolvedValue(null) };
        }
        throw new Error('Unexpected repository request');
      }),
    } as unknown as EntityManager;

    await expect(
      (
        service as unknown as {
          submitLeaveRequestRecord: (...args: unknown[]) => Promise<void>;
        }
      ).submitLeaveRequestRecord(
        10,
        leaveRequest,
        { id: 501 } as Employee,
        {
          policy: null,
          allowNegativeBalance: false,
          maxConsecutiveDays: null,
          minServiceMonths: 0,
          requiresApproval: true,
          maxPerRequestDays: null,
        },
        actor,
        manager,
      ),
    ).rejects.toThrow(
      'A supporting attachment is required before this leave request can be submitted.',
    );
  });

  it('rejects leave requests for employees who are no longer active', async () => {
    employeeRepository.findOne.mockResolvedValue({
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

  it('normalizes ISO datetime inputs when creating leave requests', async () => {
    const overlapBuilder = createQueryBuilderMock();
    overlapBuilder.getOne.mockResolvedValue(null);
    const savedDraft = {
      id: 90,
      company_id: 10,
      employee_id: 501,
      leave_type_id: 4,
      leave_no: 'LV-2026-000090',
      start_date: '2026-07-09',
      end_date: '2026-07-09',
      total_days: '1.00',
      reason: 'jkdjjkd',
      current_approval_level: 0,
      status: LeaveStatusEnum.DRAFT,
      rejection_reason: null,
      applied_at: null,
      approved_at: null,
      cancelled_at: null,
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
        primary_branch_id: 2,
        primary_department_id: 2,
        primary_position_id: 3,
        primary_department: { id: 2, name: 'Operations' },
        primary_position: { id: 3, name: 'Analyst' },
        company_user: { id: 44 },
      },
      leave_type: {
        id: 4,
        name: 'Unpaid Leave',
        code: 'UNPAID',
      },
      approvals: [],
      documents: [],
      medical_detail: null,
    };
    const managerSequenceBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      getOneOrFail: jest.fn(),
    };
    const managerSequenceRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(managerSequenceBuilder),
      create: jest.fn((value: unknown) => value),
      save: jest.fn((value: Record<string, unknown>) => ({
        id: 1,
        ...value,
      })),
    };
    const managerLeaveRequestRepository = {
      create: jest.fn((value: unknown) => value),
      save: jest.fn((value: Record<string, unknown>) => ({
        id: 90,
        ...value,
      })),
      findOneOrFail: jest.fn().mockResolvedValue(savedDraft),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === LeaveRequest) {
          return managerLeaveRequestRepository;
        }
        if (entity === LeaveNumberSequence) {
          return managerSequenceRepository;
        }
        throw new Error('Unexpected repository request');
      }),
    };

    employeeRepository.findOne.mockResolvedValue({
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
    leaveTypeRepository.findOne.mockResolvedValue({
      id: 4,
      company_id: 10,
      name: 'Unpaid Leave',
      code: 'UNPAID',
      status: LeaveRecordStatusEnum.ACTIVE,
      gender_restriction: LeaveGenderRestrictionEnum.ANY,
      max_days_per_year: '365.00',
      is_carry_forward_allowed: false,
      max_carry_forward_days: '0.00',
      is_paid: false,
      requires_attachment: false,
      description: null,
    });
    leaveRequestRepository.createQueryBuilder.mockReturnValue(overlapBuilder);
    leaveBalanceService.resolvePolicyAssignment.mockResolvedValue({
      policy: {
        allow_negative_balance: false,
        max_consecutive_days: null,
        min_service_months: 0,
      },
      policyType: {
        max_per_request_days: null,
        requires_approval: true,
      },
    });
    dataSource.transaction.mockImplementation(
      (callback: (manager: unknown) => unknown) => callback(manager),
    );

    await service.createLeaveRequest(
      10,
      {
        employee_id: 501,
        leave_type_id: 4,
        start_date: '2026-07-09T00:00:00',
        end_date: '2026-07-09T00:00:00',
        reason: 'jkdjjkd',
        submit: false,
      },
      actor,
    );

    expect(managerLeaveRequestRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        leave_no: 'LV-2026-000001',
        start_date: '2026-07-09',
        end_date: '2026-07-09',
        total_days: '1.00',
      }),
    );
  });

  it('counts attendance holidays when calculating leave days for the employee branch', async () => {
    const overlapBuilder = createQueryBuilderMock();
    overlapBuilder.getOne.mockResolvedValue(null);
    leaveDurationCalculatorService.calculate.mockResolvedValueOnce({
      totalDays: 0,
      requestedMinutes: null,
      snapshot: {
        duration_type: 'FULL_DAY',
        start_date: '2026-06-10',
        end_date: '2026-06-10',
        start_time: null,
        end_time: null,
        included_dates: [],
        excluded_dates: [{ date: '2026-06-10', reason: 'holiday' }],
        working_day_minutes: 480,
        policy_id: null,
        calculated_at: '2026-08-03T00:00:00.000Z',
      },
      hash: 'leave-calc-holiday',
    });

    employeeRepository.findOne.mockResolvedValue({
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
    leaveTypeRepository.findOne.mockResolvedValue({
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
    leaveRequestRepository.createQueryBuilder.mockReturnValue(overlapBuilder);

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

  it('stores leave documents through the shared files service', async () => {
    leaveRequestRepository.findOne.mockResolvedValue({
      id: 77,
      company_id: 10,
      employee: { id: 501 },
    });
    filesService.savePrivateBase64File.mockResolvedValue({
      originalFileName: 'medical-note.pdf',
      mimeType: 'application/pdf',
      publicPath: '/uploads/documents/leave/company-10/medical-note.pdf',
    });
    leaveDocumentRepository.save.mockImplementation((value: object) => ({
      id: 31,
      ...value,
    }));

    await service.addLeaveDocument(
      10,
      77,
      {
        file: {
          fileName: 'medical-note.pdf',
          fileSize: 12,
          mimeType: 'application/pdf',
          fileString: Buffer.from('medical-note').toString('base64'),
        },
      },
      actor,
    );

    expect(filesService.savePrivateBase64File).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'medical-note.pdf' }),
      expect.objectContaining({
        directorySegments: ['documents', 'leave', 'company-10'],
      }),
    );
    expect(leaveDocumentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        file_url: '/uploads/documents/leave/company-10/medical-note.pdf',
        file_name: 'medical-note.pdf',
        file_type: 'application/pdf',
      }),
    );
  });

  it('returns leave balances grouped by employee with employee-based pagination', async () => {
    employeeRepository.findOne.mockResolvedValue({
      id: 501,
      company_user_id: 33,
      company_user: { company_id: 10 },
    });

    const countQb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ count: '1' }),
    };
    const idsQb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue([{ employeeId: '501', sortValue: '2026-01-01' }]),
    };
    leaveBalanceRepository.createQueryBuilder
      .mockImplementationOnce(() => countQb)
      .mockImplementationOnce(() => idsQb);

    employeeRepository.find.mockResolvedValue([
      {
        id: 501,
        employee_no: 'AICL/501',
        first_name: 'John',
        middle_name: null,
        last_name: 'Doe',
        primary_department: { id: 1, name: 'IT' },
        primary_position: { id: 2, name: 'Developer' },
        primary_branch: null,
      },
    ]);
    leaveBalanceRepository.find.mockResolvedValue([
      {
        id: 1429,
        employee_id: 501,
        leave_type_id: 1,
        leave_type: { id: 1, name: 'Annual Leave', code: 'ANNUAL' },
        fiscal_year: '2026',
        allocated_days: '28.00',
        opening_balance_days: '0.00',
        entitlement_days: '28.00',
        accrued_days: '28.00',
        used_days: '0.00',
        pending_days: '0.00',
        approved_future_days: '0.00',
        carried_forward_days: '0.00',
        expired_days: '0.00',
        adjusted_days: '0.00',
        attendance_deduction_days: '16.00',
        generated_at: new Date('2026-01-01T00:00:00Z'),
        leave_year_start_date: '2026-01-01',
        leave_year_end_date: '2026-12-31',
        last_transaction_id: null,
        version: 1,
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
    ]);

    const localActor: AuthenticatedUser = {
      ...actor,
      companyMembershipId: 33,
    };

    const result = await service.findAllLeaveBalances(
      10,
      { employee_id: 501, page: 1, limit: 20 },
      localActor,
    );

    expect(idsQb.orderBy).toHaveBeenCalledWith('"sortValue"', 'DESC');

    expect(result.data).toHaveLength(1);
    expect(result.data[0].employee).toEqual(
      expect.objectContaining({
        id: 501,
        employee_number: 'AICL/501',
        full_name: 'John Doe',
        department: { id: 1, name: 'IT' },
        position: { id: 2, name: 'Developer' },
      }),
    );
    expect(result.data[0].leave_balances).toHaveLength(1);
    expect(result.data[0].leave_balances[0]).toEqual(
      expect.objectContaining({
        id: 1429,
        leave_type_id: 1,
        leave_type: { id: 1, name: 'Annual Leave', code: 'ANNUAL' },
        allocated_days: '28.00',
        attendance_deduction_days: '16.00',
        available_days: '10.00',
        remaining_days: '10.00',
      }),
    );
    expect(result.meta).toEqual(
      expect.objectContaining({
        totalItems: 1,
        itemCount: 1,
        itemsPerPage: 20,
        currentPage: 1,
      }),
    );
  });
});
