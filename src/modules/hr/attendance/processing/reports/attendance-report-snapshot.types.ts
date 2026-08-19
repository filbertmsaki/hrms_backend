export type AttendanceDaySnapshotRow = {
  employeeId: number;
  employeeNumber: string;
  employeeName: string;
  departmentName: string | null;
  branchName: string | null;
  positionName: string | null;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  timezone: string;
  attendanceStatus: string; // raw status or 'PENDING' if no summary row yet
  lateMinutes: number;
  earlyDepartureMinutes: number;
  workMinutes: number;
  leaveTypeLabel: string | null;
  exceptions: string[];
};

export type AttendanceDaySnapshot = {
  companyId: number;
  reportDate: string;
  totals: {
    expected: number;
    present: number;
    absent: number;
    onLeave: number;
    notYetCheckedIn: number;
    late: number;
    missingCheckOut: number;
    earlyDeparture: number;
    checkedOut: number;
  };
  rows: AttendanceDaySnapshotRow[];
};

export type AttendanceDaySnapshotFilters = {
  branchId?: number;
  departmentId?: number;
};
