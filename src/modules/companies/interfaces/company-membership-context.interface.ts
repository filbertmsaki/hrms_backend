import { CompanyModules } from '../../../common/utils/company-modules.util';

export interface CompanySummary {
  companyId: number;
  companyName: string;
  companySlug: string;
  membershipId: number;
  employeeId: number | null;
  employeeNo: string | null;
  isDefault: boolean;
  modules: CompanyModules;
  roles: string[];
  permissions: string[];
}

export interface CompanyMembershipContext extends CompanySummary {
  status: string;
}
