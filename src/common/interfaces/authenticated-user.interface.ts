export type AuthScope = 'platform' | 'company';
export type UserType = 'OWNER' | 'COMPANY_USER';
export type DashboardType = 'admin' | 'employee';

export interface AuthenticatedUser {
  id: number;
  email: string;
  scope: AuthScope;
  userType: UserType;
  dashboardType?: DashboardType;
  companyId?: number;
  companyName?: string;
  companySlug?: string;
  companyMembershipId?: number;
  employeeId?: number;
  employeeNo?: string;
  requiresPasswordChange?: boolean;
  roles: string[];
  permissions: string[];
}
