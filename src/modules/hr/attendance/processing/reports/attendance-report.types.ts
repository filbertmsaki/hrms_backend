export interface AttendanceReportRow {
  summaryId: number;
  employeeName: string;
  employeeNumber: string;
  attendanceDate: string;
  shiftName: string;
  timetableName: string;
  attendanceStatus: string;
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

export interface AttendanceReportContext {
  companyName: string;
  filename: string;
  reportingPeriodLabel: string;
  generatedAt: Date;
}
