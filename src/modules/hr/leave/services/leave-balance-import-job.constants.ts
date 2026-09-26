export const LEAVE_BALANCE_IMPORT_QUEUE = 'leave-balance-import';

export enum LeaveBalanceImportJobName {
  PROCESS_BATCH = 'process-leave-balance-import-batch',
}

export interface LeaveBalanceImportJobData {
  companyId: number;
  databaseBatchId: number;
}
