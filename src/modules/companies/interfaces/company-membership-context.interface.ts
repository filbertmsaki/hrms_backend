export interface CompanySummary {
  companyId: number;
  companyName: string;
  companySlug: string;
  membershipId: number;
  isDefault: boolean;
  roles: string[];
  permissions: string[];
}

export interface CompanyMembershipContext extends CompanySummary {
  status: string;
}
