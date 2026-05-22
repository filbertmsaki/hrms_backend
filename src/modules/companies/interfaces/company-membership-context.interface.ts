export interface CompanySummary {
  companyId: number;
  companyName: string;
  companySlug: string;
  membershipId: number;
  employeeId: number | null;
  employeeNo: string | null;
  isDefault: boolean;
  roles: string[];
  permissions: string[];
}

export interface CompanyMembershipContext extends CompanySummary {
  status: string;
}
