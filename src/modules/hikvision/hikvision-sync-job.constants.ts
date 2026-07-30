export const HIKVISION_SYNC_QUEUE = 'hikvision-sync';

export enum HikvisionSyncJobName {
  SYNC_ATTENDANCE = 'sync-attendance',
  SYNC_USERS = 'sync-users',
  SYNC_FINGERPRINTS = 'sync-fingerprints',
  SYNC_IMPORTED_EMPLOYEES = 'sync-imported-employees',
}

export type HikvisionImportedEmployeePayload = {
  employeeId: number;
  employeeNumber: string | null;
  deviceEmployeeNumber: string | null;
};

export type HikvisionSyncJobData = {
  companyId: number;
  deviceId: number;
  requestedByUserId: number | null;
  requestedByCompanyUserId: number | null;
  requestedAt: string;
  attendanceSyncJobId?: number;
  attendanceStartTime?: string;
  attendanceEndTime?: string;
  attendanceMaxResults?: number;
  attendanceEmployeeNo?: string;
  importedEmployees?: HikvisionImportedEmployeePayload[];
  importBatchId?: string;
  importFileName?: string;
  scheduledFor?: string;
  timeZone?: string;
};
