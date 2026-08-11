export const EMPLOYEE_IMPORT_QUEUE = 'employee-import';

export enum EmployeeImportJobName {
  PROCESS_BATCH = 'process-employee-import-batch',
}

export interface EmployeeImportJobData {
  companyId: number;
  databaseBatchId: number;
  batchId: string;
  requestedByUserId: number | null;
  requestedByCompanyUserId: number | null;
}
