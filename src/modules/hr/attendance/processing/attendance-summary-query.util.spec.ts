import { SortDirection } from '../../../../common/dto/pagination.dto';
import { AttendanceDailyStatusEnum } from './enums/attendance-daily-status.enum';
import { normalizeAttendanceSummaryQuery } from './attendance-summary-query.util';

describe('normalizeAttendanceSummaryQuery', () => {
  it('normalizes camelCase attendance filters', () => {
    const normalized = normalizeAttendanceSummaryQuery({
      page: 2,
      limit: 50,
      sortBy: 'attendance_date',
      sortOrder: SortDirection.ASC,
      employeeId: 12,
      employeeNo: 'EMP-001',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      branchId: 3,
      departmentId: 4,
      organizationId: 5,
      shiftId: 6,
      timetableId: 7,
      status: AttendanceDailyStatusEnum.PRESENT,
    });

    expect(normalized).toEqual({
      page: 2,
      limit: 50,
      sortBy: 'attendance_date',
      sortOrder: SortDirection.ASC,
      employeeId: 12,
      employeeNo: 'EMP-001',
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
      branchId: 3,
      departmentId: 4,
      organizationId: 5,
      shiftId: 6,
      timetableId: 7,
      status: AttendanceDailyStatusEnum.PRESENT,
    });
  });

  it('prefers snake_case values when both styles are present', () => {
    const normalized = normalizeAttendanceSummaryQuery({
      employee_id: 99,
      employeeId: 12,
      from_date: '2026-06-01',
      startDate: '2026-07-01',
      branch_id: 8,
      branchId: 3,
    });

    expect(normalized.employeeId).toBe(99);
    expect(normalized.fromDate).toBe('2026-06-01');
    expect(normalized.branchId).toBe(8);
  });
});
