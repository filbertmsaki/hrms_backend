export interface CompanyEmployeeHrSeed {
  employeeNo: string;
  secondaryDepartmentCodes?: string[];
}

export const ALLIANCE_EMPLOYEE_DEFAULT_PASSWORD = 'Employee123!';
export const ALLIANCE_EMPLOYEE_DEFAULT_HIRE_DATE = '2025-01-01';

// Keep HR-specific enrichments separate from the main company structure seeds.
// The current Alliance structure uses FINANCE_MANAGER as the Accounts lead.
export const ALLIANCE_EMPLOYEE_HR_SEEDS: CompanyEmployeeHrSeed[] = [
  {
    employeeNo: 'AICL-0004',
    secondaryDepartmentCodes: ['ACCOUNTS'],
  },
];
