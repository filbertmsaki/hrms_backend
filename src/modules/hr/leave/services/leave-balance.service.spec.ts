import { Repository } from 'typeorm';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeaveType } from '../entities/leave-type.entity';
import { LeavePolicy } from '../entities/leave-policy.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { AttendanceDailySummary } from '../../attendance/processing/entities/attendance-daily-summary.entity';
import { LeaveBalanceAdjustment } from '../entities/leave-balance-adjustment.entity';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';
import { LeaveBalanceAdjustmentModeEnum } from '../enums/leave-balance-adjustment-mode.enum';
import { LeaveAccrualMethodEnum } from '../enums/leave-accrual-method.enum';
import { LeaveAuditService } from './leave-audit.service';

type MockRepo = Record<string, jest.Mock>;

const createRepositoryMock = (): MockRepo => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn((value: Record<string, unknown>) => ({ id: 1, ...value })),
  create: jest.fn((value: Record<string, unknown>) => value),
  createQueryBuilder: jest.fn(),
});

const createAttendanceSummaryBuilder = (
  rows: Array<Record<string, string>>,
) => ({
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  getRawMany: jest.fn().mockResolvedValue(rows),
});

describe('LeaveBalanceService', () => {
  let service: LeaveBalanceService;
  let balanceRepository: MockRepo;
  let leaveTypeRepository: MockRepo;
  let leavePolicyRepository: MockRepo;
  let leaveRequestRepository: MockRepo;
  let employeeRepository: MockRepo;
  let attendanceDailySummaryRepository: MockRepo;
  let adjustmentRepository: MockRepo;
  let leaveAuditService: { log: jest.Mock };

  beforeEach(() => {
    balanceRepository = createRepositoryMock();
    leaveTypeRepository = createRepositoryMock();
    leavePolicyRepository = createRepositoryMock();
    leaveRequestRepository = createRepositoryMock();
    employeeRepository = createRepositoryMock();
    attendanceDailySummaryRepository = createRepositoryMock();
    adjustmentRepository = createRepositoryMock();
    leaveAuditService = { log: jest.fn() };

    service = new LeaveBalanceService(
      balanceRepository as unknown as Repository<LeaveBalance>,
      leaveTypeRepository as unknown as Repository<LeaveType>,
      leavePolicyRepository as unknown as Repository<LeavePolicy>,
      leaveRequestRepository as unknown as Repository<LeaveRequest>,
      employeeRepository as unknown as Repository<Employee>,
      attendanceDailySummaryRepository as unknown as Repository<AttendanceDailySummary>,
      adjustmentRepository as unknown as Repository<LeaveBalanceAdjustment>,
      leaveAuditService as unknown as LeaveAuditService,
    );
  });

  it('carries forward the full unused annual leave balance into the next year', async () => {
    leaveTypeRepository.findOne.mockResolvedValue({
      id: 7,
      company_id: 10,
      code: 'ANNUAL',
      max_days_per_year: '28.00',
      is_carry_forward_allowed: true,
      max_carry_forward_days: '0.00',
    });
    leavePolicyRepository.find.mockResolvedValue([
      {
        company_id: 10,
        status: LeaveRecordStatusEnum.ACTIVE,
        applicable_department_id: null,
        applicable_position_id: null,
        leave_types: [
          {
            leave_type_id: 7,
            annual_quota_days: '28.00',
          },
        ],
      },
    ]);
    balanceRepository.findOne.mockImplementation(
      ({ where }: { where?: { fiscal_year?: string } }) => {
        if (where?.fiscal_year === '2026') {
          return {
            id: 2,
            employee_id: 501,
            leave_type_id: 7,
            fiscal_year: '2026',
            allocated_days: '28.00',
            opening_balance_days: '0.00',
            entitlement_days: '28.00',
            used_days: '10.00',
            pending_days: '0.00',
            carried_forward_days: '0.00',
            expired_days: '0.00',
            adjusted_days: '0.00',
            attendance_deduction_days: '0.00',
            generated_at: new Date('2026-01-01T00:00:00Z'),
          };
        }

        return null;
      },
    );
    leaveRequestRepository.find.mockResolvedValue([]);
    attendanceDailySummaryRepository.createQueryBuilder.mockReturnValue(
      createAttendanceSummaryBuilder([]),
    );

    const result = await service.ensureBalanceForEmployee(
      10,
      {
        id: 501,
        primary_department_id: 2,
        primary_position_id: 3,
        primary_branch_id: 1,
      },
      7,
      '2027',
    );

    expect(result.opening_balance_days).toBe('18.00');
    expect(result.carried_forward_days).toBe('18.00');
    expect(result.entitlement_days).toBe('28.00');
    expect(service.calculateAvailableDays(result)).toBe(46);
  });

  it('applies attendance-based annual leave deductions from attendance summaries', async () => {
    leaveTypeRepository.findOne.mockResolvedValue({
      id: 7,
      company_id: 10,
      code: 'ANNUAL',
      max_days_per_year: '28.00',
      is_carry_forward_allowed: true,
      max_carry_forward_days: '0.00',
    });
    leavePolicyRepository.find.mockResolvedValue([
      {
        company_id: 10,
        status: LeaveRecordStatusEnum.ACTIVE,
        applicable_department_id: null,
        applicable_position_id: null,
        attendance_balance_deduction_enabled: true,
        absent_day_deduction_days: '1.00',
        unpaid_leave_day_deduction_days: '1.00',
        half_day_deduction_days: '0.50',
        leave_types: [
          {
            leave_type_id: 7,
            annual_quota_days: '28.00',
          },
        ],
      },
    ]);
    balanceRepository.findOne.mockResolvedValue(null);
    leaveRequestRepository.find.mockResolvedValue([]);
    attendanceDailySummaryRepository.createQueryBuilder.mockReturnValue(
      createAttendanceSummaryBuilder([
        { attendanceStatus: 'ABSENT', count: '2' },
        { attendanceStatus: 'HALF_DAY', count: '1' },
      ]),
    );

    const result = await service.ensureBalanceForEmployee(
      10,
      {
        id: 501,
        primary_department_id: 2,
        primary_position_id: 3,
        primary_branch_id: 1,
      },
      7,
      '2027',
    );

    expect(result.attendance_deduction_days).toBe('2.50');
    expect(service.calculateAvailableDays(result)).toBe(25.5);
  });

  it('tracks manual leave balance adjustments with old and new balances', async () => {
    leaveTypeRepository.findOne.mockResolvedValue({
      id: 7,
      company_id: 10,
      code: 'ANNUAL',
      max_days_per_year: '28.00',
      is_carry_forward_allowed: true,
      max_carry_forward_days: '0.00',
    });
    leavePolicyRepository.find.mockResolvedValue([
      {
        company_id: 10,
        status: LeaveRecordStatusEnum.ACTIVE,
        applicable_department_id: null,
        applicable_position_id: null,
        attendance_balance_deduction_enabled: false,
        leave_types: [
          {
            leave_type_id: 7,
            annual_quota_days: '28.00',
          },
        ],
      },
    ]);
    balanceRepository.findOne.mockImplementation(
      ({ where }: { where?: { fiscal_year?: string } }) => {
        if (where?.fiscal_year === '2027') {
          return {
            id: 3,
            employee_id: 501,
            leave_type_id: 7,
            fiscal_year: '2027',
            allocated_days: '28.00',
            opening_balance_days: '0.00',
            entitlement_days: '28.00',
            used_days: '0.00',
            pending_days: '0.00',
            carried_forward_days: '0.00',
            expired_days: '0.00',
            adjusted_days: '0.00',
            attendance_deduction_days: '0.00',
            generated_at: new Date('2027-01-01T00:00:00Z'),
          };
        }

        return null;
      },
    );
    leaveRequestRepository.find.mockResolvedValue([]);
    attendanceDailySummaryRepository.createQueryBuilder.mockReturnValue(
      createAttendanceSummaryBuilder([]),
    );
    adjustmentRepository.save.mockImplementation(
      (value: Record<string, unknown>) => value,
    );

    const result = await service.applyManualAdjustment(
      10,
      {
        id: 501,
        primary_department_id: 2,
        primary_position_id: 3,
        primary_branch_id: 1,
      },
      7,
      '2027',
      {
        mode: LeaveBalanceAdjustmentModeEnum.ADD,
        amount: 2,
        reason: 'Manual correction after audit',
      },
      { id: 44 },
    );

    expect(result.adjusted_days).toBe('2.00');
    expect(adjustmentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        old_balance_days: '28.00',
        new_balance_days: '30.00',
        adjustment_amount_days: '2.00',
        reason: 'Manual correction after audit',
        adjusted_by_company_user_id: 44,
      }),
    );
  });

  it('prorates monthly-accrual leave types by elapsed months', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-04-15T00:00:00Z'));

    leaveTypeRepository.findOne.mockResolvedValue({
      id: 7,
      company_id: 10,
      code: 'ANNUAL',
      max_days_per_year: '24.00',
      is_carry_forward_allowed: false,
      max_carry_forward_days: '0.00',
    });
    leavePolicyRepository.find.mockResolvedValue([
      {
        company_id: 10,
        status: LeaveRecordStatusEnum.ACTIVE,
        applicable_department_id: null,
        applicable_position_id: null,
        accrual_method: LeaveAccrualMethodEnum.MONTHLY,
        accrual_rate: null,
        leave_types: [
          {
            leave_type_id: 7,
            annual_quota_days: '24.00',
          },
        ],
      },
    ]);
    balanceRepository.findOne.mockResolvedValue(null);
    leaveRequestRepository.find.mockResolvedValue([]);
    attendanceDailySummaryRepository.createQueryBuilder.mockReturnValue(
      createAttendanceSummaryBuilder([]),
    );

    const result = await service.ensureBalanceForEmployee(
      10,
      {
        id: 501,
        primary_department_id: 2,
        primary_position_id: 3,
        primary_branch_id: 1,
      },
      7,
      '2027',
    );

    expect(result.entitlement_days).toBe('24.00');
    // 24 days / 12 months * 4 elapsed months (Jan-Apr) = 8 days accrued.
    expect(result.accrued_days).toBe('8.00');
    expect(service.calculateAvailableDays(result)).toBe(8);

    jest.useRealTimers();
  });

  it('generates balances for employees without a login account, one locked transaction per employee', async () => {
    const transactionManager = {
      queryRunner: { isTransactionActive: true },
      getRepository: jest.fn((entity: unknown) =>
        entity === LeaveBalance
          ? balanceRepository
          : entity === LeaveType
            ? leaveTypeRepository
            : entity === LeavePolicy
              ? leavePolicyRepository
              : entity === LeaveRequest
                ? leaveRequestRepository
                : attendanceDailySummaryRepository,
      ),
    };
    const transaction = jest.fn(
      (work: (manager: typeof transactionManager) => Promise<unknown>) =>
        work(transactionManager),
    );
    (balanceRepository as unknown as { manager: unknown }).manager = {
      transaction,
    };
    // company_user is null: the employee has no login account.
    employeeRepository.find.mockResolvedValue([
      {
        id: 501,
        company_id: 10,
        company_user: null,
        primary_department_id: 2,
        primary_position_id: 3,
        primary_branch_id: 1,
      },
    ]);
    leaveTypeRepository.find.mockResolvedValue([
      { id: 7, company_id: 10, code: 'SICK', max_days_per_year: '10.00' },
    ]);
    leavePolicyRepository.find.mockResolvedValue([]);
    balanceRepository.find.mockResolvedValue([]);
    balanceRepository.findOne.mockResolvedValue(null);
    leaveRequestRepository.find.mockResolvedValue([]);

    const result = await service.generateBalancesForCompany(10, '2026');

    expect(result).toMatchObject({
      processed_employees: 1,
      generated_balances: 1,
    });
    expect(employeeRepository.find).toHaveBeenCalledWith({
      where: { company_id: 10, employment_status: 'active' },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    // The employee's year balances are locked in id order before recalculation.
    expect(balanceRepository.find).toHaveBeenCalledWith({
      where: { employee_id: 501, fiscal_year: '2026' },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(balanceRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });
});
