export type AuthScope = 'platform' | 'company';
export type UserType = 'OWNER' | 'COMPANY_USER';

export interface AuthenticatedUser {
  id: number;
  email: string;
  scope: AuthScope;
  userType: UserType;
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
