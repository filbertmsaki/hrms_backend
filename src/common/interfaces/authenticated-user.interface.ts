import { CompanyModules } from '../utils/company-modules.util';

export type AuthScope = 'platform' | 'company';
export type UserType = 'OWNER' | 'COMPANY_USER';
export type DashboardType = 'admin' | 'employee';

export interface AuthenticatedUser {
  id: number;
  email: string;
  scope: AuthScope;
  userType: UserType;
  sessionId?: string;
  dashboardType?: DashboardType;
  companyId?: number;
  companyName?: string;
  companySlug?: string;
  companyMembershipId?: number;
  companyModules?: CompanyModules;
  employeeId?: number;
  employeeNo?: string;
  requiresPasswordChange?: boolean;
  forceTwoFactor?: boolean;
  roles: string[];
  permissions: string[];
}
