export class EmployeeImportResponseDto {
  batchId: string;
  status: string;
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  skippedRows: number;
  warningRows: number;
  createdEmployees: number;
  updatedEmployees: number;
  createdUsers: number;
  deviceAssignmentsCreated: number;
  deviceSyncPending: number;
}
