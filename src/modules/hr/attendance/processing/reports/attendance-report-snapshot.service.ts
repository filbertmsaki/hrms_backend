import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../../../employees/entities/employee.entity';
import { AttendanceDailyStatusEnum } from '../enums/attendance-daily-status.enum';
import {
  AttendanceArrivalStatus,
  AttendanceDepartureStatus,
  AttendancePunchStatus,
  AttendanceStatus,
  buildStatusDimensionLabels,
} from '../enums/attendance-status-dimensions.enum';
import { AttendanceProcessingException } from '../entities/attendance-processing-exception.entity';
import {
  AttendanceDaySnapshot,
  AttendanceDaySnapshotFilters,
  AttendanceDaySnapshotRow,
} from './attendance-report-snapshot.types';

const NON_EXPECTED_STATUSES = new Set<string>([
  AttendanceDailyStatusEnum.OFF_DAY,
  AttendanceDailyStatusEnum.HOLIDAY,
  AttendanceDailyStatusEnum.NO_SHIFT_SCHEDULE,
]);

const PRESENT_STATUSES = new Set<string>([
  AttendanceDailyStatusEnum.PRESENT,
  AttendanceDailyStatusEnum.LATE,
  AttendanceDailyStatusEnum.EARLY_DEPARTURE,
  AttendanceDailyStatusEnum.LATE_AND_EARLY_DEPARTURE,
  AttendanceDailyStatusEnum.OVERTIME,
  AttendanceDailyStatusEnum.HALF_DAY,
  AttendanceDailyStatusEnum.OFF_DAY_PRESENT,
  AttendanceDailyStatusEnum.MANUAL_CORRECTION,
]);

const LATE_STATUSES = new Set<string>([
  AttendanceDailyStatusEnum.LATE,
  AttendanceDailyStatusEnum.LATE_AND_EARLY_DEPARTURE,
]);

const EARLY_DEPARTURE_STATUSES = new Set<string>([
  AttendanceDailyStatusEnum.EARLY_DEPARTURE,
  AttendanceDailyStatusEnum.LATE_AND_EARLY_DEPARTURE,
]);

const LEAVE_STATUSES = new Set<string>([
  AttendanceDailyStatusEnum.LEAVE,
  AttendanceDailyStatusEnum.SICK_LEAVE,
  AttendanceDailyStatusEnum.ANNUAL_LEAVE,
  AttendanceDailyStatusEnum.UNPAID_LEAVE,
  AttendanceDailyStatusEnum.BUSINESS_TRIP,
  AttendanceDailyStatusEnum.OFFICIAL_DUTY,
]);

const LEAVE_LABELS: Partial<Record<AttendanceDailyStatusEnum, string>> = {
  [AttendanceDailyStatusEnum.LEAVE]: 'Leave',
  [AttendanceDailyStatusEnum.SICK_LEAVE]: 'Sick Leave',
  [AttendanceDailyStatusEnum.ANNUAL_LEAVE]: 'Annual Leave',
  [AttendanceDailyStatusEnum.UNPAID_LEAVE]: 'Unpaid Leave',
  [AttendanceDailyStatusEnum.BUSINESS_TRIP]: 'Business Trip',
  [AttendanceDailyStatusEnum.OFFICIAL_DUTY]: 'Official Duty',
};

// Statuses that legitimately never have a check-out (e.g. leave/off states),
// so a missing checkOutAt for these should not be flagged as "missing checkout".
const NO_CHECKOUT_REQUIRED_STATUSES = new Set<string>([
  ...LEAVE_STATUSES,
  AttendanceDailyStatusEnum.ABSENT,
  AttendanceDailyStatusEnum.OFF_DAY,
  AttendanceDailyStatusEnum.HOLIDAY,
  AttendanceDailyStatusEnum.NO_SHIFT_SCHEDULE,
  'PENDING',
]);

const PENDING_STATUS = 'PENDING';

// Status-dimension equivalents, used when primary_status etc. are populated.
// Rows processed before the dimensions existed fall back to the legacy sets.
const NON_EXPECTED_PRIMARY = new Set<string>([
  AttendanceStatus.OFF_DAY,
  AttendanceStatus.HOLIDAY,
  AttendanceStatus.NO_SHIFT_SCHEDULE,
  AttendanceStatus.NOT_APPLICABLE,
]);
const PRESENT_PRIMARY = new Set<string>([
  AttendanceStatus.PRESENT,
  AttendanceStatus.HALF_DAY,
]);
const LEAVE_PRIMARY = new Set<string>([
  AttendanceStatus.LEAVE,
  AttendanceStatus.OFFICIAL_DUTY,
]);
const MISSING_CHECK_IN_PUNCH = new Set<string>([
  AttendancePunchStatus.MISSING_CHECK_IN,
  AttendancePunchStatus.MISSING_BOTH,
]);

interface RawSnapshotRow {
  employeeId: number;
  employeeNumber: string;
  employeeFirstName: string;
  employeeMiddleName: string | null;
  employeeLastName: string;
  departmentName: string | null;
  branchName: string | null;
  positionName: string | null;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  timezone: string | null;
  attendanceStatus: string | null;
  lateMinutes: number | null;
  earlyDepartureMinutes: number | null;
  workMinutes: number | null;
  primaryStatus?: string | null;
  punchStatus?: string | null;
  arrivalStatus?: string | null;
  departureStatus?: string | null;
  isProvisional?: boolean | null;
  leaveTypeName?: string | null;
}

@Injectable()
export class AttendanceReportSnapshotService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(AttendanceProcessingException)
    private readonly exceptionRepository: Repository<AttendanceProcessingException>,
  ) {}

  async buildSnapshot(
    companyId: number,
    reportDate: string,
    filters?: AttendanceDaySnapshotFilters,
  ): Promise<AttendanceDaySnapshot> {
    const qb = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoin(
        'attendance_daily_summaries',
        'summary',
        'summary.employee_id = employee.id AND summary.company_id = :companyId AND summary.attendance_date = :reportDate',
        { companyId, reportDate },
      )
      .leftJoin(
        'departments',
        'department',
        'department.id = employee.primary_department_id',
      )
      .leftJoin('branches', 'branch', 'branch.id = employee.primary_branch_id')
      .leftJoin(
        'positions',
        'position',
        'position.id = employee.primary_position_id',
      )
      .where('employee.company_id = :companyId', { companyId })
      .andWhere('employee.employment_status = :employmentStatus', {
        employmentStatus: 'active',
      })
      .select('employee.id', 'employeeId')
      .addSelect('employee.employee_no', 'employeeNumber')
      .addSelect('employee.first_name', 'employeeFirstName')
      .addSelect('employee.middle_name', 'employeeMiddleName')
      .addSelect('employee.last_name', 'employeeLastName')
      .addSelect('department.name', 'departmentName')
      .addSelect('branch.name', 'branchName')
      .addSelect('position.name', 'positionName')
      .addSelect('summary.check_in_at', 'checkInAt')
      .addSelect('summary.check_out_at', 'checkOutAt')
      .addSelect('summary.timezone', 'timezone')
      .addSelect('summary.attendance_status', 'attendanceStatus')
      .addSelect('summary.late_minutes', 'lateMinutes')
      .addSelect('summary.early_departure_minutes', 'earlyDepartureMinutes')
      .addSelect('summary.work_minutes', 'workMinutes')
      .addSelect('summary.primary_status', 'primaryStatus')
      .addSelect('summary.punch_status', 'punchStatus')
      .addSelect('summary.arrival_status', 'arrivalStatus')
      .addSelect('summary.departure_status', 'departureStatus')
      .addSelect('summary.is_provisional', 'isProvisional')
      .addSelect('summary.leave_type_name', 'leaveTypeName');

    if (filters?.branchId) {
      qb.andWhere('employee.primary_branch_id = :branchId', {
        branchId: filters.branchId,
      });
    }

    if (filters?.departmentId) {
      qb.andWhere('employee.primary_department_id = :departmentId', {
        departmentId: filters.departmentId,
      });
    }

    const rawRows = await qb
      .orderBy('employee.employee_no', 'ASC')
      .getRawMany<RawSnapshotRow>();

    const employeeIds = rawRows.map((row) => Number(row.employeeId));
    const exceptionsByEmployeeId = await this.fetchExceptionsByEmployeeId(
      companyId,
      reportDate,
      employeeIds,
    );

    const totals = {
      expected: 0,
      present: 0,
      absent: 0,
      onLeave: 0,
      notYetCheckedIn: 0,
      late: 0,
      missingCheckIn: 0,
      missingCheckOut: 0,
      earlyDeparture: 0,
      checkedOut: 0,
    };

    const rows: AttendanceDaySnapshotRow[] = rawRows.map((row) => {
      const hasSummaryRow = row.attendanceStatus != null;
      const status = hasSummaryRow ? row.attendanceStatus! : PENDING_STATUS;
      const checkInAt = row.checkInAt ? new Date(row.checkInAt) : null;
      const checkOutAt = row.checkOutAt ? new Date(row.checkOutAt) : null;

      const primary = hasSummaryRow ? (row.primaryStatus ?? null) : null;
      const punch = hasSummaryRow ? (row.punchStatus ?? null) : null;
      const arrival = hasSummaryRow ? (row.arrivalStatus ?? null) : null;
      const departure = hasSummaryRow ? (row.departureStatus ?? null) : null;

      const isExpected = !hasSummaryRow
        ? true
        : primary
          ? !NON_EXPECTED_PRIMARY.has(primary)
          : !NON_EXPECTED_STATUSES.has(status);
      const isPresent =
        checkInAt != null &&
        (primary ? PRESENT_PRIMARY.has(primary) : PRESENT_STATUSES.has(status));
      const isLate = arrival
        ? arrival === (AttendanceArrivalStatus.LATE as string)
        : LATE_STATUSES.has(status);
      const isOnLeave = primary
        ? LEAVE_PRIMARY.has(primary)
        : LEAVE_STATUSES.has(status);
      const isAbsent = primary
        ? primary === (AttendanceStatus.ABSENT as string)
        : status === (AttendanceDailyStatusEnum.ABSENT as string);
      const isNotYetCheckedIn =
        isExpected && checkInAt == null && !isOnLeave && !isAbsent;
      const isMissingCheckIn = punch
        ? MISSING_CHECK_IN_PUNCH.has(punch) && !isAbsent && !isOnLeave
        : isExpected && !isPresent && !isOnLeave && !isAbsent;
      const isMissingCheckOut = punch
        ? punch === (AttendancePunchStatus.MISSING_CHECK_OUT as string)
        : checkInAt != null &&
          checkOutAt == null &&
          !NO_CHECKOUT_REQUIRED_STATUSES.has(status);
      const isEarlyDeparture = departure
        ? departure === (AttendanceDepartureStatus.EARLY_DEPARTURE as string)
        : EARLY_DEPARTURE_STATUSES.has(status);
      const isCheckedOut = checkInAt != null && checkOutAt != null;

      if (isExpected) totals.expected += 1;
      if (isPresent) totals.present += 1;
      if (isAbsent) totals.absent += 1;
      if (isOnLeave) totals.onLeave += 1;
      if (isNotYetCheckedIn) totals.notYetCheckedIn += 1;
      if (isLate) totals.late += 1;
      if (isMissingCheckIn) totals.missingCheckIn += 1;
      if (isMissingCheckOut) totals.missingCheckOut += 1;
      if (isEarlyDeparture) totals.earlyDeparture += 1;
      if (isCheckedOut) totals.checkedOut += 1;

      const labels = buildStatusDimensionLabels({
        primaryStatus: primary,
        punchStatus: punch,
        arrivalStatus: arrival,
        departureStatus: departure,
        isProvisional: row.isProvisional,
        leaveTypeName: row.leaveTypeName,
      });
      const primaryStatusLabel = !hasSummaryRow
        ? 'Pending'
        : labels.primaryStatusLabel || status;

      const leaveTypeLabel = !isOnLeave
        ? null
        : primary
          ? (row.leaveTypeName ?? primaryStatusLabel)
          : (LEAVE_LABELS[status as AttendanceDailyStatusEnum] ?? status);

      return {
        employeeId: Number(row.employeeId),
        employeeNumber: row.employeeNumber,
        employeeName:
          [row.employeeFirstName, row.employeeMiddleName, row.employeeLastName]
            .map((part) => part?.trim())
            .filter((part): part is string => Boolean(part))
            .join(' ') || row.employeeNumber,
        departmentName: row.departmentName ?? null,
        branchName: row.branchName ?? null,
        positionName: row.positionName ?? null,
        checkInAt,
        checkOutAt,
        timezone: row.timezone ?? 'UTC',
        attendanceStatus: status,
        primaryStatusLabel,
        punchStatusLabel: labels.punchStatusLabel,
        arrivalStatusLabel: labels.arrivalStatusLabel,
        departureStatusLabel: labels.departureStatusLabel,
        lateMinutes: row.lateMinutes ?? 0,
        earlyDepartureMinutes: row.earlyDepartureMinutes ?? 0,
        workMinutes: row.workMinutes ?? 0,
        leaveTypeLabel,
        exceptions: exceptionsByEmployeeId.get(Number(row.employeeId)) ?? [],
      };
    });

    return {
      companyId,
      reportDate,
      totals,
      rows,
    };
  }

  private async fetchExceptionsByEmployeeId(
    companyId: number,
    reportDate: string,
    employeeIds: number[],
  ): Promise<Map<number, string[]>> {
    const result = new Map<number, string[]>();

    if (!employeeIds.length) {
      return result;
    }

    const exceptions = await this.exceptionRepository
      .createQueryBuilder('exception')
      .select('exception.employee_id', 'employeeId')
      .addSelect('exception.exception_type', 'exceptionType')
      .addSelect('exception.message', 'message')
      .where('exception.company_id = :companyId', { companyId })
      .andWhere('exception.attendance_date = :reportDate', { reportDate })
      .andWhere('exception.employee_id IN (:...employeeIds)', { employeeIds })
      .getRawMany<{
        employeeId: number;
        exceptionType: string;
        message: string | null;
      }>();

    for (const exception of exceptions) {
      const employeeId = Number(exception.employeeId);
      const label = exception.message?.trim() || exception.exceptionType;
      const existing = result.get(employeeId) ?? [];
      existing.push(label);
      result.set(employeeId, existing);
    }

    return result;
  }
}
