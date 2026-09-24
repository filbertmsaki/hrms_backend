import { AttendanceDailySummary } from '../../attendance/processing/entities/attendance-daily-summary.entity';
import { PayrollPeriod } from '../entities/payroll-configuration.entities';
import { PayrollOvertimeRequest } from '../entities/payroll-overtime-request.entity';
import { EmployeePayrollCalculationService } from './payroll-core.services';

type AttendanceTotals = {
  overtimeMinutes: number;
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
  ): Promise<AttendanceTotals> {
    const summary = {
      attendanceDate: '2026-09-21',
      attendanceStatus: 'OVERTIME',
      workMinutes: 480,
      overtimeMinutes: 120,
      flags: {},
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
    expect(totals.payableOvertimeMinutes).toBe(60);
    expect(totals.regularOvertimeMinutes).toBe(60);
    expect(totals.pendingOvertimeApprovalMinutes).toBe(60);
  });

  it('does not pay recorded overtime without an approved request', async () => {
    const totals = await calculate(null);
    expect(totals.payableOvertimeMinutes).toBe(0);
    expect(totals.pendingOvertimeApprovalMinutes).toBe(120);
  });
});
