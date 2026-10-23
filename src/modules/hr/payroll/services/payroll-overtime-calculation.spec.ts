import { AttendanceDailySummary } from '../../attendance/processing/entities/attendance-daily-summary.entity';
import { PayrollPeriod } from '../entities/payroll-configuration.entities';
import { PayrollOvertimeRequest } from '../entities/payroll-overtime-request.entity';
import { EmployeePayrollCalculationService } from './payroll-core.services';

type AttendanceTotals = {
  overtimeMinutes: number;
  approvedOvertimeMinutes: number;
  payableOvertimeMinutes: number;
  pendingOvertimeApprovalMinutes: number;
  regularOvertimeMinutes: number;
};

describe('payroll overtime calculation', () => {
  const period = {
    startDate: '2026-09-01',
    endDate: '2026-09-30',
  } as PayrollPeriod;

  function calculate(
    approvedMinutes: number | null,
    flags: Record<string, unknown> = {},
    payrollApprovalRequired = false,
  ): Promise<AttendanceTotals> {
    const summary = {
      attendanceDate: '2026-09-21',
      attendanceStatus: 'OVERTIME',
      workMinutes: 480,
      overtimeMinutes: 120,
      flags,
      finalizedAt: new Date(),
    } as AttendanceDailySummary;
    const queryBuilder = (result: unknown[]) => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => result),
    });
    const service = Object.create(
      EmployeePayrollCalculationService.prototype,
    ) as EmployeePayrollCalculationService;
    Object.assign(service, {
      attendanceRepository: {
        createQueryBuilder: jest.fn(() => queryBuilder([summary])),
      },
      overtimeRequestRepository: {
        find: jest.fn(async () =>
          approvedMinutes === null
            ? []
            : [
                {
                  workDate: summary.attendanceDate,
                  requestedMinutes: approvedMinutes,
                  status: 'APPROVED',
                } as PayrollOvertimeRequest,
              ],
        ),
      },
      holidayRepository: {
        createQueryBuilder: jest.fn(() => queryBuilder([])),
      },
      overtimePolicyRepository: {
        createQueryBuilder: jest.fn(() => ({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn(async () =>
            payrollApprovalRequired
              ? [
                  {
                    effectiveFrom: '2026-01-01',
                    effectiveTo: null,
                    approvalRequired: true,
                  },
                ]
              : [],
          ),
        })),
      },
    });
    return (
      service as unknown as {
        summarizeAttendance(
          companyId: number,
          employeeId: number,
          period: PayrollPeriod,
        ): Promise<AttendanceTotals>;
      }
    ).summarizeAttendance(1, 1, period);
  }

  it('caps payable overtime at the HR-approved request and leaves the rest pending', async () => {
    const totals = await calculate(60);
    expect(totals.overtimeMinutes).toBe(120);
    expect(totals.approvedOvertimeMinutes).toBe(60);
    expect(totals.payableOvertimeMinutes).toBe(60);
    expect(totals.regularOvertimeMinutes).toBe(60);
    expect(totals.pendingOvertimeApprovalMinutes).toBe(60);
  });

  it('does not pay recorded overtime without an approved request', async () => {
    const totals = await calculate(null, {
      overtimeRequiresApproval: true,
      overtimeApproved: true,
      otApprovalStatus: 'APPROVED',
    });
    expect(totals.payableOvertimeMinutes).toBe(0);
    expect(totals.approvedOvertimeMinutes).toBe(0);
    expect(totals.pendingOvertimeApprovalMinutes).toBe(120);
  });

  it('pays calculated overtime when the attendance policy does not require approval', async () => {
    const totals = await calculate(null, { overtimeRequiresApproval: false });
    expect(totals.overtimeMinutes).toBe(120);
    expect(totals.payableOvertimeMinutes).toBe(120);
    expect(totals.pendingOvertimeApprovalMinutes).toBe(0);
  });

  it('requires the payroll approval policy even when attendance approval is disabled', async () => {
    const totals = await calculate(
      null,
      { overtimeRequiresApproval: false },
      true,
    );
    expect(totals.payableOvertimeMinutes).toBe(0);
    expect(totals.pendingOvertimeApprovalMinutes).toBe(120);
  });

  it('categorizes approved overtime into holiday and rest-day payroll buckets', async () => {
    const holidayTotals = await calculate(60, {
      overtimeRequiresApproval: true,
      isHoliday: true,
    });
    expect(holidayTotals.holidayOvertimeMinutes).toBe(60);
    expect(holidayTotals.regularOvertimeMinutes).toBe(0);

    const restDayTotals = await calculate(45, {
      overtimeRequiresApproval: true,
      isWeekend: true,
    });
    expect(restDayTotals.weekendOvertimeMinutes).toBe(45);
    expect(restDayTotals.regularOvertimeMinutes).toBe(0);
  });
});
