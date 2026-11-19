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
      max_carry_forward_days: null,
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
      max_carry_forward_days: null,
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
      max_carry_forward_days: null,
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
      max_carry_forward_days: null,
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

  it('allocates a cross-year request only to included dates inside each balance year', async () => {
    leaveTypeRepository.findOne.mockResolvedValue({
      id: 7,
      company_id: 10,
      code: 'ANNUAL',
      max_days_per_year: '28.00',
      is_carry_forward_allowed: false,
      max_carry_forward_days: null,
    });
    leavePolicyRepository.find.mockResolvedValue([]);
    balanceRepository.findOne.mockResolvedValue(null);
    leaveRequestRepository.find.mockResolvedValue([
      {
        status: 'approved',
        total_days: '4.00',
        start_date: '2026-12-30',
        end_date: '2027-01-04',
        requested_minutes: null,
        calculation_snapshot: {
          duration_type: 'FULL_DAY',
          included_dates: [
            '2026-12-30',
            '2026-12-31',
            '2027-01-01',
            '2027-01-04',
          ],
        },
      },
    ]);
    attendanceDailySummaryRepository.createQueryBuilder.mockReturnValue(
      createAttendanceSummaryBuilder([]),
    );

    const oldYear = await service.ensureBalanceForEmployee(
      10,
      {
        id: 501,
        primary_department_id: 2,
        primary_position_id: 3,
        primary_branch_id: 1,
      },
      7,
      '2026',
    );
    const newYear = await service.ensureBalanceForEmployee(
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

    expect(oldYear.used_days).toBe('2.00');
    expect(newYear.used_days).toBe('2.00');
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

describe('LeaveBalanceService – leave form balance figures', () => {
  const build = (requests: Array<Record<string, unknown>>) => {
    const requestRepo = {
      // Emulates the status filter the real query applies.
      find: jest.fn(({ where }: { where: { status: string } }) =>
        Promise.resolve(requests.filter((r) => r.status === where.status)),
      ),
    };
    const svc = new LeaveBalanceService(
      {} as never,
      {} as never,
      {} as never,
      requestRepo as never,
      {} as never,
      {} as never,
      {} as never,
      { log: jest.fn() } as never,
    );
    return svc;
  };
  const balance = {
    employee_id: 1,
    leave_type_id: 2,
    fiscal_year: '2026',
    leave_year_start_date: '2026-01-01',
    leave_year_end_date: '2026-12-31',
  };
  const req = (
    id: number,
    status: string,
    dates: string[],
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    status,
    start_date: dates[0],
    end_date: dates[dates.length - 1],
    total_days: String(dates.length),
    calculation_snapshot: { included_dates: dates, duration_type: 'FULL_DAY' },
    requested_minutes: null,
    ...extra,
  });

  it('counts only approved days before the current start, never the current request', async () => {
    const svc = build([
      req(1, 'approved', ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-09', '2026-03-10', '2026-03-11']),
      req(9, 'approved', ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']), // current
      req(3, 'approved', ['2026-08-03', '2026-08-04']), // future
      req(4, 'pending_hr', ['2026-02-02']),
      req(5, 'rejected', ['2026-02-03']),
      req(6, 'cancelled', ['2026-02-04']),
      req(7, 'draft', ['2026-02-05']),
    ]);
    await expect(svc.summarizeTakenBefore(balance as never, '2026-06-01', 9)).resolves.toBe(8);
  });

  it('counts only the days of an overlapping earlier leave that fall before the start', async () => {
    const svc = build([
      req(1, 'approved', ['2026-05-28', '2026-05-29', '2026-06-01', '2026-06-02']),
    ]);
    await expect(svc.summarizeTakenBefore(balance as never, '2026-06-01', 9)).resolves.toBe(2);
  });

  it('counts a half-day as 0.5 and returns 0 for a new employee', async () => {
    const half = req(1, 'approved', ['2026-04-01'], {
      total_days: '0.5',
      calculation_snapshot: { included_dates: ['2026-04-01'], duration_type: 'HALF_DAY' },
    });
    await expect(build([half]).summarizeTakenBefore(balance as never, '2026-06-01', 9)).resolves.toBe(0.5);
    await expect(build([]).summarizeTakenBefore(balance as never, '2026-06-01', 9)).resolves.toBe(0);
  });

  it('separates deductions from credits and nets encashment reversals', async () => {
    const adjustments = [
      { adjustment_amount_days: '-2.00' },
      { adjustment_amount_days: '3.00' },
    ];
    const transactions = [
      { transaction_type: 'ENCASHMENT', amount_days: '-4', metadata: {} },
      { transaction_type: 'CANCELLED_REVERSAL', amount_days: '1', metadata: { encashment_request_id: 7 } },
      { transaction_type: 'CANCELLED_REVERSAL', amount_days: '5', metadata: { leave_request_id: 3 } },
    ];
    const manager = {
      getRepository: (entity: { name: string }) => ({
        find: jest.fn().mockResolvedValue(
          entity.name === 'LeaveBalanceAdjustment' ? adjustments : transactions,
        ),
      }),
    };
    const svc = build([]);
    // adjusted_days nets +3 − 2 − 4 (encashed) + 1 (reversal) = −2.
    const result = await svc.summarizeAdjustmentBreakdown(
      {
        id: 11,
        adjusted_days: '-2',
        retained_days: '1',
        expired_days: '0.5',
        attendance_deduction_days: '1',
      } as never,
      manager as never,
    );
    // 0.5 expired + 1 attendance + 2 manual + 3 encashed (4 − 1 reversed).
    expect(result.deductionDays).toBe(6.5);
    // 1 retained + 3 positive adjustment.
    expect(result.creditDays).toBe(4);
  });
});
