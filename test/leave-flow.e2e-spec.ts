const e2eUser = {
  id: 9,
  email: 'tester@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 10,
  companyMembershipId: 33,
  permissions: [
    'leave_requests:read',
    'leave_requests:create',
    'leave_requests:update',
    'leave_requests:approve',
    'leave_requests:cancel',
  ],
  roles: [],
};

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class MockJwtAuthGuard {
      canActivate(context: {
        switchToHttp: () => { getRequest: () => Record<string, unknown> };
      }) {
        const request = context.switchToHttp().getRequest();
        request.user = e2eUser;
        return true;
      }
    },
}));

import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LeaveController } from '../src/modules/hr/leave/leave.controller';
import { LeaveService } from '../src/modules/hr/leave/leave.service';
import { LeaveType } from '../src/modules/hr/leave/entities/leave-type.entity';
import { LeaveRequest } from '../src/modules/hr/leave/entities/leave-request.entity';
import { LeavePolicy } from '../src/modules/hr/leave/entities/leave-policy.entity';
import { LeaveBalance } from '../src/modules/hr/leave/entities/leave-balance.entity';
import { LeaveApprovalWorkflow } from '../src/modules/hr/leave/entities/leave-approval-workflow.entity';
import { LeaveApprovalWorkflowStep } from '../src/modules/hr/leave/entities/leave-approval-workflow-step.entity';
import { LeaveMedicalDetail } from '../src/modules/hr/leave/entities/leave-medical-detail.entity';
import { LeaveDocument } from '../src/modules/hr/leave/entities/leave-document.entity';
import { Holiday } from '../src/modules/hr/leave/entities/holiday.entity';
import { Employee } from '../src/modules/hr/employees/entities/employee.entity';
import { Branch } from '../src/modules/hr/branches/entities/branch.entity';
import { Department } from '../src/modules/hr/departments/entities/department.entity';
import { Position } from '../src/modules/hr/positions/entities/position.entity';
import { CompanyUser } from '../src/modules/companies/entities/company-user.entity';
import { Role } from '../src/modules/roles/entities/role.entity';
import { LeaveAuditService } from '../src/modules/hr/leave/services/leave-audit.service';
import { LeaveBalanceService } from '../src/modules/hr/leave/services/leave-balance.service';
import { LeaveWorkflowService } from '../src/modules/hr/leave/services/leave-workflow.service';
import { LeavePdfService } from '../src/modules/hr/leave/services/leave-pdf.service';
import { HrAccessService } from '../src/modules/hr/shared/hr-access.service';
import { AttendanceRecalculationJob } from '../src/modules/hr/attendance/processing/entities/attendance-recalculation-job.entity';
import { LeaveStatusEnum } from '../src/modules/hr/leave/enums/leave-status.enum';
import { LeaveRecordStatusEnum } from '../src/modules/hr/leave/enums/leave-record-status.enum';
import { LeaveGenderRestrictionEnum } from '../src/modules/hr/leave/enums/leave-gender-restriction.enum';

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
  getManyAndCount: jest.fn(),
});

describe('Leave Flow (e2e)', () => {
  let app: INestApplication;
  let dataSource: { transaction: jest.Mock };
  let leaveTypeRepository: MockRepo<LeaveType>;
  let leavePolicyRepository: MockRepo<LeavePolicy>;
  let leaveBalanceRepository: MockRepo<LeaveBalance>;
  let leaveRequestRepository: MockRepo<LeaveRequest>;
  let leaveApprovalWorkflowRepository: MockRepo<LeaveApprovalWorkflow>;
  let leaveApprovalWorkflowStepRepository: MockRepo<LeaveApprovalWorkflowStep>;
  let leaveMedicalDetailRepository: MockRepo<LeaveMedicalDetail>;
  let leaveDocumentRepository: MockRepo<LeaveDocument>;
  let holidayRepository: MockRepo<Holiday>;
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
    ensureBalanceForEmployee: jest.Mock;
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

  beforeEach(async () => {
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
    holidayRepository = createRepositoryMock();
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
      ensureBalanceForEmployee: jest.fn(),
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

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [LeaveController],
      providers: [
        LeaveService,
        { provide: DataSource, useValue: dataSource },
        {
          provide: getRepositoryToken(LeaveType),
          useValue: leaveTypeRepository,
        },
        {
          provide: getRepositoryToken(LeavePolicy),
          useValue: leavePolicyRepository,
        },
        {
          provide: getRepositoryToken(LeaveBalance),
          useValue: leaveBalanceRepository,
        },
        {
          provide: getRepositoryToken(LeaveRequest),
          useValue: leaveRequestRepository,
        },
        {
          provide: getRepositoryToken(LeaveApprovalWorkflow),
          useValue: leaveApprovalWorkflowRepository,
        },
        {
          provide: getRepositoryToken(LeaveApprovalWorkflowStep),
          useValue: leaveApprovalWorkflowStepRepository,
        },
        {
          provide: getRepositoryToken(LeaveMedicalDetail),
          useValue: leaveMedicalDetailRepository,
        },
        {
          provide: getRepositoryToken(LeaveDocument),
          useValue: leaveDocumentRepository,
        },
        { provide: getRepositoryToken(Holiday), useValue: holidayRepository },
        { provide: getRepositoryToken(Employee), useValue: employeeRepository },
        { provide: getRepositoryToken(Branch), useValue: branchRepository },
        {
          provide: getRepositoryToken(Department),
          useValue: departmentRepository,
        },
        { provide: getRepositoryToken(Position), useValue: positionRepository },
        {
          provide: getRepositoryToken(CompanyUser),
          useValue: companyUserRepository,
        },
        { provide: getRepositoryToken(Role), useValue: roleRepository },
        {
          provide: getRepositoryToken(AttendanceRecalculationJob),
          useValue: attendanceRecalculationJobRepository,
        },
        { provide: HrAccessService, useValue: hrAccessService },
        { provide: LeaveAuditService, useValue: leaveAuditService },
        { provide: LeaveBalanceService, useValue: leaveBalanceService },
        { provide: LeaveWorkflowService, useValue: leaveWorkflowService },
        { provide: LeavePdfService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('submits a draft leave request through HTTP', async () => {
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
    const overlapBuilder = createQueryBuilderMock();
    overlapBuilder.getOne.mockResolvedValue(null);
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
    holidayRepository.find!.mockResolvedValue([]);
    leavePolicyRepository.find!.mockResolvedValue([
      {
        company_id: 10,
        status: LeaveRecordStatusEnum.ACTIVE,
        applicable_department_id: null,
        applicable_position_id: null,
        allow_negative_balance: false,
        max_consecutive_days: null,
        min_service_months: 0,
        leave_types: [
          {
            leave_type_id: 7,
            max_per_request_days: null,
            requires_approval: false,
          },
        ],
      },
    ]);
    leaveBalanceService.ensureBalanceForEmployee.mockResolvedValue({
      id: 1,
      used_days: '0.00',
      pending_days: '0.00',
      allocated_days: '10.00',
      carried_forward_days: '0.00',
      expired_days: '0.00',
    });
    dataSource.transaction.mockImplementation(async (callback) =>
      callback(manager),
    );

    const response = await request(app.getHttpServer())
      .post('/leave/requests/77/submit')
      .expect(201);

    expect(response.body.status).toBe(LeaveStatusEnum.APPROVED);
    expect(response.body.leave_no).toBe('LV-2026-000001');
    expect(managerRecalculationRepository.save).toHaveBeenCalledTimes(1);
  });

  it('queues attendance recalculation after approval through HTTP', async () => {
    leaveRequestRepository.findOne!.mockResolvedValue({
      id: 88,
      company_id: 10,
      employee_id: 501,
      leave_type_id: 7,
      total_days: '2.00',
      start_date: '2026-06-11',
      end_date: '2026-06-12',
    });
    employeeRepository.findOne!.mockResolvedValue({
      id: 501,
      company_user: { company_id: 10 },
      primary_department_id: 2,
      primary_position_id: 3,
      hire_date: '2025-01-01',
    });
    leaveWorkflowService.applyApprovalAction.mockResolvedValue({
      id: 88,
      employee_id: 501,
      leave_type_id: 7,
      status: LeaveStatusEnum.APPROVED,
    });
    leaveBalanceService.ensureBalanceForEmployee.mockResolvedValue({
      id: 1,
      used_days: '0.00',
      pending_days: '2.00',
    });
    dataSource.transaction.mockImplementation(async (callback) =>
      callback({
        getRepository: jest.fn(() => ({
          findOneOrFail: jest.fn().mockResolvedValue({
            id: 88,
            company_id: 10,
            employee_id: 501,
            leave_type_id: 7,
            leave_no: 'LV-2026-000002',
            start_date: '2026-06-11',
            end_date: '2026-06-12',
            total_days: '2.00',
            reason: 'Travel',
            current_approval_level: 0,
            status: LeaveStatusEnum.APPROVED,
            rejection_reason: null,
            applied_at: new Date('2026-06-09T01:00:00Z'),
            approved_at: new Date('2026-06-09T02:00:00Z'),
            cancelled_at: null,
            created_at: new Date('2026-06-09T00:00:00Z'),
            updated_at: new Date('2026-06-09T02:00:00Z'),
            employee: {
              id: 501,
              employee_no: 'EMP-501',
              first_name: 'Alice',
              last_name: 'Jones',
              primary_department: { id: 2, name: 'Operations' },
              primary_position: { id: 3, name: 'Analyst' },
            },
            leave_type: { id: 7, name: 'Emergency Leave', code: 'EL' },
            approvals: [],
            documents: [],
            medical_detail: null,
          }),
        })),
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/leave/requests/88/approval-action')
      .send({ approve: true, comments: 'Approved' })
      .expect(201);

    expect(response.body.status).toBe(LeaveStatusEnum.APPROVED);
    expect(attendanceRecalculationJobRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 10,
        employeeId: 501,
        dateFrom: '2026-06-11',
        dateTo: '2026-06-12',
        reason: 'Leave request approved',
      }),
    );
  });

  it('queues attendance recalculation after cancellation through HTTP', async () => {
    leaveRequestRepository.findOne!.mockResolvedValue({
      id: 99,
      company_id: 10,
      employee_id: 501,
      leave_type_id: 7,
      total_days: '1.00',
      start_date: '2026-06-15',
      end_date: '2026-06-15',
      status: LeaveStatusEnum.APPROVED,
      employee: {
        id: 501,
        company_user_id: 44,
        company_user: { id: 44 },
      },
      rejection_reason: null,
    });
    employeeRepository.findOne!.mockResolvedValue({
      id: 501,
      company_user: { company_id: 10 },
      primary_department_id: 2,
      primary_position_id: 3,
      hire_date: '2025-01-01',
    });
    leaveBalanceService.ensureBalanceForEmployee.mockResolvedValue({
      id: 1,
      used_days: '1.00',
      pending_days: '0.00',
    });
    dataSource.transaction.mockImplementation(async (callback) =>
      callback({
        getRepository: jest.fn((entity) => ({
          save: jest.fn(async (value) => value),
        })),
      }),
    );

    await request(app.getHttpServer())
      .post('/leave/requests/99/cancel')
      .send({ reason: 'Trip postponed' })
      .expect(201);

    expect(attendanceRecalculationJobRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 10,
        employeeId: 501,
        dateFrom: '2026-06-15',
        dateTo: '2026-06-15',
        reason: 'Leave request cancelled',
      }),
    );
  });
});
