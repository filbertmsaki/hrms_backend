export const HIKVISION_SYNC_QUEUE = 'hikvision-sync';

export enum HikvisionSyncJobName {
  SYNC_USERS = 'sync-users',
  SYNC_FINGERPRINTS = 'sync-fingerprints',
}

export type HikvisionSyncJobData = {
  companyId: number;
  deviceId: number;
  requestedByUserId: number | null;
  requestedByCompanyUserId: number | null;
  requestedAt: string;
};
