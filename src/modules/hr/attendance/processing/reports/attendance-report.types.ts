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
}

export interface AttendanceReportContext {
  companyName: string;
  filename: string;
  reportingPeriodLabel: string;
  generatedAt: Date;
}
