export interface CompanyEmployeeHrSeed {
  employeeNo: string;
  secondaryDepartmentCodes?: string[];
}

export const ALLIANCE_EMPLOYEE_DEFAULT_PASSWORD = 'Employee123!';
export const ALLIANCE_EMPLOYEE_DEFAULT_HIRE_DATE = '2025-01-01';

// Keep HR-specific enrichments separate from the main company structure seeds.
// Leave empty unless a seeded employee needs additional department assignments.
export const ALLIANCE_EMPLOYEE_HR_SEEDS: CompanyEmployeeHrSeed[] = [];
