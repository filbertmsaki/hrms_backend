import { SortDirection } from '../../../../common/dto/pagination.dto';
import { AttendanceDailyStatusEnum } from './enums/attendance-daily-status.enum';
import { QueryAttendanceDailySummariesDto } from './dtos/query-attendance-daily-summaries.dto';

export type NormalizedAttendanceSummaryQuery = {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: SortDirection;
  employeeId?: number;
  employeeNo?: string;
  fromDate?: string;
  toDate?: string;
  branchId?: number;
  departmentId?: number;
  organizationId?: number;
  shiftId?: number;
  timetableId?: number;
  status?: AttendanceDailyStatusEnum;
  lateOnly?: boolean;
  earlyDepartureOnly?: boolean;
  overtimeOnly?: boolean;
};

function coalesceNumber(
  ...values: Array<number | null | undefined>
): number | undefined {
  return values.find((value) => typeof value === 'number');
}

function coalesceString(
  ...values: Array<string | null | undefined>
): string | undefined {
  const match = values.find(
    (value): value is string =>
      typeof value === 'string' && value.trim().length > 0,
  );

  return match?.trim();
}

export function normalizeAttendanceSummaryQuery(
  query: QueryAttendanceDailySummariesDto,
): NormalizedAttendanceSummaryQuery {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 20,
    sortBy: query.sortBy ?? 'attendance_date',
    sortOrder: query.sortOrder ?? SortDirection.DESC,
    employeeId: coalesceNumber(query.employee_id, query.employeeId),
    employeeNo: coalesceString(query.employee_no, query.employeeNo),
    fromDate: coalesceString(
      query.from_date,
      query.fromDate,
      query.startDate,
      query.start_date,
    ),
    toDate: coalesceString(
      query.to_date,
      query.toDate,
      query.endDate,
      query.end_date,
    ),
    branchId: coalesceNumber(query.branch_id, query.branchId),
    departmentId: coalesceNumber(query.department_id, query.departmentId),
    organizationId: coalesceNumber(query.organization_id, query.organizationId),
    shiftId: coalesceNumber(query.shift_id, query.shiftId),
    timetableId: coalesceNumber(query.timetable_id, query.timetableId),
    status: query.status,
    lateOnly: query.late_only,
    earlyDepartureOnly: query.early_departure_only,
    overtimeOnly: query.overtime_only,
  };
}
