export interface AttendanceReportRow {
  summaryId: number;
  employeeName: string;
  employeeNumber: string;
  attendanceDate: string;
  shiftName: string;
  timetableName: string;
  /** Legacy composite status code (payroll-facing). */
  attendanceStatus: string;
  /** Display labels of the four independent status dimensions. */
  primaryStatusLabel?: string;
  punchStatusLabel?: string;
  arrivalStatusLabel?: string;
  departureStatusLabel?: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  timezone: string;
  lateMinutes?: number;
  earlyDepartureMinutes?: number;
  overtimeMinutes?: number;
  approvedOvertimeMinutes?: number;
  payableOvertimeMinutes?: number;
  overtimeApprovalRequired?: boolean;
  overtimeApprovalStatus?: string;
}

/** One-cell summary for compact layouts (PDF). */
export function formatGroupedAttendanceStatus(
  row: AttendanceReportRow,
): string {
  const primary = row.primaryStatusLabel || row.attendanceStatus;
  const lines = [primary];
  if (row.arrivalStatusLabel || row.departureStatusLabel) {
    lines.push(
      `In: ${row.arrivalStatusLabel || '—'} · Out: ${row.departureStatusLabel || '—'}`,
    );
  }
  if (row.punchStatusLabel) lines.push(row.punchStatusLabel);
  return lines.join('\n');
}

export interface AttendanceReportContext {
  companyName: string;
  filename: string;
  reportingPeriodLabel: string;
  generatedAt: Date;
}
