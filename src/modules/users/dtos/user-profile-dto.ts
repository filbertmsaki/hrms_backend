export class UserProfileDto {
  id: number;
  user_no: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  status: string;
  user_type: string;
  is_email_verified: boolean;
  is_two_factor_enabled: boolean;
  last_login_at: Date | null;
  last_login_ip: string | null;
  created_at: Date;
  updated_at: Date;

  roles: string[];
  permissions: string[];
  current_company?: {
    id: number;
    name: string;
    slug: string;
  };
  companies?: Array<{
    companyId: number;
    companyName: string;
    companySlug: string;
    membershipId: number;
    isDefault: boolean;
    roles: string[];
    permissions: string[];
  }>;

  constructor(partial: Partial<UserProfileDto>) {
    Object.assign(this, partial);
  }
}
