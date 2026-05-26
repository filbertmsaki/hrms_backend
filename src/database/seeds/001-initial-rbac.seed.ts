import { DataSource, IsNull, Repository } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { hashPassword } from '../../common/utils/hash.util';
import { Company } from '../../modules/companies/entities/company.entity';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { CompanyUserRole } from '../../modules/companies/entities/company-user-role.entity';
import { Permission } from '../../modules/permissions/entities/permission.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';
import { ALLIANCE_COMPANY_NAME } from './company-structure.constants';

type SeedScope = 'global' | 'default_company';

type PermissionSeed = {
  name: string;
  displayName: string;
  description: string;
  scopes: SeedScope[];
};

type RoleSeed = {
  name: string;
  displayName: string;
  description: string;
  permissionNames: string[];
  scopes: SeedScope[];
};

type SeedUserConfig = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  userNo: string;
  userType: 'OWNER' | 'COMPANY_USER';
};

const GLOBAL_SCOPE: SeedScope[] = ['global'];
const DEFAULT_COMPANY_SCOPE: SeedScope[] = ['default_company'];
const GLOBAL_AND_DEFAULT_COMPANY_SCOPES: SeedScope[] = [
  'global',
  'default_company',
];

const permissionSeeds: PermissionSeed[] = [
  {
    name: 'create_company',
    displayName: 'Create company',
    description: 'Allow creating a new company tenant',
    scopes: GLOBAL_SCOPE,
  },
  {
    name: 'view_companies',
    displayName: 'View companies',
    description: 'Allow viewing companies across the platform',
    scopes: GLOBAL_SCOPE,
  },
  {
    name: 'update_company',
    displayName: 'Update company',
    description: 'Allow updating company details',
    scopes: GLOBAL_SCOPE,
  },
  {
    name: 'delete_company',
    displayName: 'Delete company',
    description: 'Allow deleting a company',
    scopes: GLOBAL_SCOPE,
  },
  {
    name: 'create_company_admin',
    displayName: 'Create company administrator',
    description: 'Allow provisioning the first administrator for a company',
    scopes: GLOBAL_SCOPE,
  },
  {
    name: 'view_company_dashboard',
    displayName: 'View company dashboard',
    description: 'Allow viewing the company dashboard',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'manage_company_users',
    displayName: 'Manage company users',
    description: 'Allow managing users within a company',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'create_company_user',
    displayName: 'Create company user',
    description: 'Allow creating users within a company',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'update_company_user',
    displayName: 'Update company user',
    description: 'Allow updating users within a company',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'delete_company_user',
    displayName: 'Delete company user',
    description: 'Allow deleting users within a company',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'view_company_data',
    displayName: 'View company data',
    description: 'Allow reading company-owned data',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'update_company_data',
    displayName: 'Update company data',
    description: 'Allow updating company-owned data',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'companies:create',
    displayName: 'Create companies',
    description: 'Compatibility permission for company creation endpoints',
    scopes: GLOBAL_SCOPE,
  },
  {
    name: 'companies:read',
    displayName: 'Read companies',
    description: 'Compatibility permission for company listing endpoints',
    scopes: GLOBAL_SCOPE,
  },
  {
    name: 'companies:update',
    displayName: 'Update companies',
    description: 'Compatibility permission for company update endpoints',
    scopes: GLOBAL_SCOPE,
  },
  {
    name: 'companies:delete',
    displayName: 'Delete companies',
    description: 'Compatibility permission for company delete endpoints',
    scopes: GLOBAL_SCOPE,
  },
  {
    name: 'users:read',
    displayName: 'Read users',
    description: 'Compatibility permission for user listing endpoints',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'users:create',
    displayName: 'Create users',
    description: 'Compatibility permission for user creation endpoints',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'users:update',
    displayName: 'Update users',
    description: 'Compatibility permission for user update endpoints',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'users:delete',
    displayName: 'Delete users',
    description: 'Compatibility permission for user delete endpoints',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'users:assign-role',
    displayName: 'Assign user roles',
    description: 'Compatibility permission for role assignment endpoints',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'users:revoke-role',
    displayName: 'Revoke user roles',
    description: 'Compatibility permission for role revocation endpoints',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'roles:read',
    displayName: 'Read roles',
    description: 'Compatibility permission for role listing endpoints',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'roles:create',
    displayName: 'Create roles',
    description: 'Compatibility permission for role creation endpoints',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'roles:update',
    displayName: 'Update roles',
    description: 'Compatibility permission for role update endpoints',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'roles:delete',
    displayName: 'Delete roles',
    description: 'Compatibility permission for role delete endpoints',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'permissions:read',
    displayName: 'Read permissions',
    description: 'Compatibility permission for permission listing endpoints',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'permissions:create',
    displayName: 'Create permissions',
    description: 'Compatibility permission for permission creation endpoints',
    scopes: GLOBAL_SCOPE,
  },
  {
    name: 'permissions:update',
    displayName: 'Update permissions',
    description: 'Compatibility permission for permission update endpoints',
    scopes: GLOBAL_SCOPE,
  },
  {
    name: 'permissions:delete',
    displayName: 'Delete permissions',
    description: 'Compatibility permission for permission delete endpoints',
    scopes: GLOBAL_SCOPE,
  },
  {
    name: 'branches:read',
    displayName: 'Read branches',
    description: 'Allow listing and viewing company branches',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'branches:create',
    displayName: 'Create branches',
    description: 'Allow creating company branches',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'branches:update',
    displayName: 'Update branches',
    description: 'Allow updating company branches',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'branches:delete',
    displayName: 'Delete branches',
    description: 'Allow deleting company branches',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'branches:manage-access',
    displayName: 'Manage branch access',
    description: 'Allow granting and revoking branch-level access for company users',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'departments:read',
    displayName: 'Read departments',
    description: 'Allow listing and viewing company departments',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'departments:create',
    displayName: 'Create departments',
    description: 'Allow creating company departments',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'departments:update',
    displayName: 'Update departments',
    description: 'Allow updating company departments',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'departments:delete',
    displayName: 'Delete departments',
    description: 'Allow deleting company departments',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'positions:read',
    displayName: 'Read positions',
    description: 'Allow listing and viewing company positions',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'positions:create',
    displayName: 'Create positions',
    description: 'Allow creating company positions',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'positions:update',
    displayName: 'Update positions',
    description: 'Allow updating company positions',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'positions:delete',
    displayName: 'Delete positions',
    description: 'Allow deleting company positions',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'designations:read',
    displayName: 'Read designations',
    description: 'Allow listing and viewing company designations',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'designations:create',
    displayName: 'Create designations',
    description: 'Allow creating company designations',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'designations:update',
    displayName: 'Update designations',
    description: 'Allow updating company designations',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'designations:delete',
    displayName: 'Delete designations',
    description: 'Allow deleting company designations',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'employees:read',
    displayName: 'Read employees',
    description: 'Allow listing and viewing employee profiles',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'employees:create',
    displayName: 'Create employees',
    description: 'Allow creating employee profiles for existing company users',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'employees:update',
    displayName: 'Update employees',
    description: 'Allow updating employee profiles and documents',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'employees:delete',
    displayName: 'Delete employees',
    description: 'Allow deleting employee profiles',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'employees:change-status',
    displayName: 'Change employee status',
    description: 'Allow managing employee lifecycle statuses',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_types:read',
    displayName: 'Read leave types',
    description: 'Allow listing and viewing leave types',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_types:create',
    displayName: 'Create leave types',
    description: 'Allow creating leave types',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_types:update',
    displayName: 'Update leave types',
    description: 'Allow updating leave types',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_types:delete',
    displayName: 'Delete leave types',
    description: 'Allow deleting leave types',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_policies:read',
    displayName: 'Read leave policies',
    description: 'Allow listing and viewing leave policies',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_policies:create',
    displayName: 'Create leave policies',
    description: 'Allow creating leave policies',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_policies:update',
    displayName: 'Update leave policies',
    description: 'Allow updating leave policies',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_policies:delete',
    displayName: 'Delete leave policies',
    description: 'Allow deleting leave policies',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_workflows:read',
    displayName: 'Read leave workflows',
    description: 'Allow listing and viewing leave workflows',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_workflows:create',
    displayName: 'Create leave workflows',
    description: 'Allow creating leave workflows',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_workflows:update',
    displayName: 'Update leave workflows',
    description: 'Allow updating leave workflows',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_workflows:delete',
    displayName: 'Delete leave workflows',
    description: 'Allow deleting leave workflows',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'holidays:read',
    displayName: 'Read holidays',
    description: 'Allow listing and viewing holidays',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'holidays:create',
    displayName: 'Create holidays',
    description: 'Allow creating holidays',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'holidays:update',
    displayName: 'Update holidays',
    description: 'Allow updating holidays',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'holidays:delete',
    displayName: 'Delete holidays',
    description: 'Allow deleting holidays',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_balances:read',
    displayName: 'Read leave balances',
    description: 'Allow listing and viewing leave balances',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_balances:adjust',
    displayName: 'Adjust leave balances',
    description: 'Allow manually adjusting leave balances',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_requests:read',
    displayName: 'Read leave requests',
    description: 'Allow listing and viewing leave requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_requests:create',
    displayName: 'Create leave requests',
    description: 'Allow creating leave requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_requests:update',
    displayName: 'Update leave requests',
    description: 'Allow updating leave request documents and medical details',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_requests:approve',
    displayName: 'Approve leave requests',
    description: 'Allow approving or rejecting leave requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'leave_requests:cancel',
    displayName: 'Cancel leave requests',
    description: 'Allow cancelling leave requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_policies:read',
    displayName: 'Read attendance policies',
    description: 'Allow listing and viewing attendance policies',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_policies:create',
    displayName: 'Create attendance policies',
    description: 'Allow creating attendance policies',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_policies:update',
    displayName: 'Update attendance policies',
    description: 'Allow updating and activating attendance policies',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_policies:delete',
    displayName: 'Delete attendance policies',
    description: 'Allow deleting attendance policies',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_settings:read',
    displayName: 'Read attendance settings',
    description: 'Allow listing and viewing attendance settings',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_settings:create',
    displayName: 'Create attendance settings',
    description: 'Allow creating attendance settings',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_settings:update',
    displayName: 'Update attendance settings',
    description: 'Allow updating attendance settings',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_settings:delete',
    displayName: 'Delete attendance settings',
    description: 'Allow deleting attendance settings',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_holiday_groups:read',
    displayName: 'Read attendance holiday groups',
    description: 'Allow listing and viewing attendance holiday groups',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_holiday_groups:create',
    displayName: 'Create attendance holiday groups',
    description: 'Allow creating attendance holiday groups',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_holiday_groups:update',
    displayName: 'Update attendance holiday groups',
    description: 'Allow updating attendance holiday groups',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_holiday_groups:delete',
    displayName: 'Delete attendance holiday groups',
    description: 'Allow deleting attendance holiday groups',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_holidays:read',
    displayName: 'Read attendance holidays',
    description: 'Allow listing and viewing attendance holidays',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_holidays:create',
    displayName: 'Create attendance holidays',
    description: 'Allow creating attendance holidays',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_holidays:update',
    displayName: 'Update attendance holidays',
    description: 'Allow updating attendance holidays',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_holidays:delete',
    displayName: 'Delete attendance holidays',
    description: 'Allow deleting attendance holidays',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_devices:read',
    displayName: 'Read attendance devices',
    description: 'Allow listing and viewing attendance devices',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_devices:create',
    displayName: 'Create attendance devices',
    description: 'Allow creating attendance devices',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_devices:update',
    displayName: 'Update attendance devices',
    description: 'Allow updating attendance devices',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_devices:delete',
    displayName: 'Delete attendance devices',
    description: 'Allow deleting attendance devices',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'access_doors:read',
    displayName: 'Read access doors',
    description: 'Allow listing and viewing access doors',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'access_doors:create',
    displayName: 'Create access doors',
    description: 'Allow creating access doors',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'access_doors:update',
    displayName: 'Update access doors',
    description: 'Allow updating and syncing access doors',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'access_doors:delete',
    displayName: 'Delete access doors',
    description: 'Allow deleting access doors',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_checkpoints:read',
    displayName: 'Read attendance checkpoints',
    description: 'Allow listing and viewing attendance checkpoints',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_checkpoints:create',
    displayName: 'Create attendance checkpoints',
    description: 'Allow creating attendance checkpoints',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_checkpoints:update',
    displayName: 'Update attendance checkpoints',
    description: 'Allow updating attendance checkpoints',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_checkpoints:delete',
    displayName: 'Delete attendance checkpoints',
    description: 'Allow deleting attendance checkpoints',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_device_sync_logs:read',
    displayName: 'Read attendance device sync logs',
    description: 'Allow listing and viewing attendance device sync logs',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'attendance_device_sync_logs:create',
    displayName: 'Create attendance device sync logs',
    description: 'Allow creating attendance device sync logs',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shifts:read',
    displayName: 'Read shifts',
    description: 'Allow listing and viewing shifts',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shifts:create',
    displayName: 'Create shifts',
    description: 'Allow creating shifts',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shifts:update',
    displayName: 'Update shifts',
    description: 'Allow updating shifts',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shifts:delete',
    displayName: 'Delete shifts',
    description: 'Allow deleting shifts',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_breaks:read',
    displayName: 'Read shift breaks',
    description: 'Allow listing and viewing shift breaks',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_breaks:create',
    displayName: 'Create shift breaks',
    description: 'Allow creating shift breaks',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_breaks:update',
    displayName: 'Update shift breaks',
    description: 'Allow updating shift breaks',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_breaks:delete',
    displayName: 'Delete shift breaks',
    description: 'Allow deleting shift breaks',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_overtime_rules:read',
    displayName: 'Read shift overtime rules',
    description: 'Allow listing and viewing shift overtime rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_overtime_rules:create',
    displayName: 'Create shift overtime rules',
    description: 'Allow creating shift overtime rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_overtime_rules:update',
    displayName: 'Update shift overtime rules',
    description: 'Allow updating shift overtime rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_overtime_rules:delete',
    displayName: 'Delete shift overtime rules',
    description: 'Allow deleting shift overtime rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_attendance_rules:read',
    displayName: 'Read shift attendance rules',
    description: 'Allow listing and viewing shift attendance rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_attendance_rules:create',
    displayName: 'Create shift attendance rules',
    description: 'Allow creating shift attendance rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_attendance_rules:update',
    displayName: 'Update shift attendance rules',
    description: 'Allow updating shift attendance rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_attendance_rules:delete',
    displayName: 'Delete shift attendance rules',
    description: 'Allow deleting shift attendance rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_assignments:read',
    displayName: 'Read shift assignments',
    description: 'Allow listing and viewing shift assignments',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_assignments:create',
    displayName: 'Create shift assignments',
    description: 'Allow creating shift assignments',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_assignments:update',
    displayName: 'Update shift assignments',
    description: 'Allow updating shift assignments',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_assignments:delete',
    displayName: 'Delete shift assignments',
    description: 'Allow deleting shift assignments',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_rotation_groups:read',
    displayName: 'Read shift rotation groups',
    description: 'Allow listing and viewing shift rotation groups',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_rotation_groups:create',
    displayName: 'Create shift rotation groups',
    description: 'Allow creating shift rotation groups',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_rotation_groups:update',
    displayName: 'Update shift rotation groups',
    description: 'Allow updating shift rotation groups',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_rotation_groups:delete',
    displayName: 'Delete shift rotation groups',
    description: 'Allow deleting shift rotation groups',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_rotation_rules:read',
    displayName: 'Read shift rotation rules',
    description: 'Allow listing and viewing shift rotation rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_rotation_rules:create',
    displayName: 'Create shift rotation rules',
    description: 'Allow creating shift rotation rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_rotation_rules:update',
    displayName: 'Update shift rotation rules',
    description: 'Allow updating shift rotation rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_rotation_rules:delete',
    displayName: 'Delete shift rotation rules',
    description: 'Allow deleting shift rotation rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_schedules:read',
    displayName: 'Read shift schedules',
    description: 'Allow listing and viewing shift schedules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_schedules:create',
    displayName: 'Create shift schedules',
    description: 'Allow creating shift schedules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_schedules:update',
    displayName: 'Update shift schedules',
    description: 'Allow updating shift schedules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_schedules:delete',
    displayName: 'Delete shift schedules',
    description: 'Allow deleting shift schedules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_change_requests:read',
    displayName: 'Read shift change requests',
    description: 'Allow listing and viewing shift change requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_change_requests:create',
    displayName: 'Create shift change requests',
    description: 'Allow creating shift change requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_change_requests:update',
    displayName: 'Update shift change requests',
    description: 'Allow updating shift change requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_change_requests:delete',
    displayName: 'Delete shift change requests',
    description: 'Allow deleting shift change requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_templates:read',
    displayName: 'Read shift templates',
    description: 'Allow listing and viewing shift templates',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_templates:create',
    displayName: 'Create shift templates',
    description: 'Allow creating shift templates',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_templates:update',
    displayName: 'Update shift templates',
    description: 'Allow updating shift templates',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'shift_templates:delete',
    displayName: 'Delete shift templates',
    description: 'Allow deleting shift templates',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetables:read',
    displayName: 'Read timetables',
    description: 'Allow listing and viewing timetables',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetables:create',
    displayName: 'Create timetables',
    description: 'Allow creating timetables',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetables:update',
    displayName: 'Update timetables',
    description: 'Allow updating timetables',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetables:delete',
    displayName: 'Delete timetables',
    description: 'Allow deleting timetables',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_days:read',
    displayName: 'Read timetable days',
    description: 'Allow listing and viewing timetable day configurations',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_days:create',
    displayName: 'Create timetable days',
    description: 'Allow creating timetable day configurations',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_days:update',
    displayName: 'Update timetable days',
    description: 'Allow updating timetable day configurations',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_days:delete',
    displayName: 'Delete timetable days',
    description: 'Allow deleting timetable day configurations',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_shift_rules:read',
    displayName: 'Read timetable shift rules',
    description: 'Allow listing and viewing timetable shift rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_shift_rules:create',
    displayName: 'Create timetable shift rules',
    description: 'Allow creating timetable shift rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_shift_rules:update',
    displayName: 'Update timetable shift rules',
    description: 'Allow updating timetable shift rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_shift_rules:delete',
    displayName: 'Delete timetable shift rules',
    description: 'Allow deleting timetable shift rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'employee_timetables:read',
    displayName: 'Read employee timetables',
    description: 'Allow listing and viewing employee timetable assignments',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'employee_timetables:create',
    displayName: 'Create employee timetables',
    description: 'Allow creating employee timetable assignments',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'employee_timetables:update',
    displayName: 'Update employee timetables',
    description: 'Allow updating employee timetable assignments',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'employee_timetables:delete',
    displayName: 'Delete employee timetables',
    description: 'Allow deleting employee timetable assignments',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_rotations:read',
    displayName: 'Read timetable rotations',
    description: 'Allow listing and viewing timetable rotations',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_rotations:create',
    displayName: 'Create timetable rotations',
    description: 'Allow creating timetable rotations',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_rotations:update',
    displayName: 'Update timetable rotations',
    description: 'Allow updating timetable rotations',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_rotations:delete',
    displayName: 'Delete timetable rotations',
    description: 'Allow deleting timetable rotations',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_rotation_rules:read',
    displayName: 'Read timetable rotation rules',
    description: 'Allow listing and viewing timetable rotation rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_rotation_rules:create',
    displayName: 'Create timetable rotation rules',
    description: 'Allow creating timetable rotation rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_rotation_rules:update',
    displayName: 'Update timetable rotation rules',
    description: 'Allow updating timetable rotation rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_rotation_rules:delete',
    displayName: 'Delete timetable rotation rules',
    description: 'Allow deleting timetable rotation rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_holiday_rules:read',
    displayName: 'Read timetable holiday rules',
    description: 'Allow listing and viewing timetable holiday rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_holiday_rules:create',
    displayName: 'Create timetable holiday rules',
    description: 'Allow creating timetable holiday rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_holiday_rules:update',
    displayName: 'Update timetable holiday rules',
    description: 'Allow updating timetable holiday rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_holiday_rules:delete',
    displayName: 'Delete timetable holiday rules',
    description: 'Allow deleting timetable holiday rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_attendance_rules:read',
    displayName: 'Read timetable attendance rules',
    description: 'Allow listing and viewing timetable attendance rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_attendance_rules:create',
    displayName: 'Create timetable attendance rules',
    description: 'Allow creating timetable attendance rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_attendance_rules:update',
    displayName: 'Update timetable attendance rules',
    description: 'Allow updating timetable attendance rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_attendance_rules:delete',
    displayName: 'Delete timetable attendance rules',
    description: 'Allow deleting timetable attendance rules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_generated_schedules:read',
    displayName: 'Read timetable generated schedules',
    description: 'Allow listing and viewing timetable generated schedules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_generated_schedules:create',
    displayName: 'Create timetable generated schedules',
    description: 'Allow creating timetable generated schedules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_generated_schedules:update',
    displayName: 'Update timetable generated schedules',
    description: 'Allow updating timetable generated schedules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'timetable_generated_schedules:delete',
    displayName: 'Delete timetable generated schedules',
    description: 'Allow deleting timetable generated schedules',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'onboarding_workflows:read',
    displayName: 'Read onboarding workflows',
    description: 'Allow listing and viewing onboarding workflows',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'onboarding_workflows:create',
    displayName: 'Create onboarding workflows',
    description: 'Allow creating onboarding workflows',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'onboarding_workflows:update',
    displayName: 'Update onboarding workflows',
    description: 'Allow updating onboarding workflows',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'onboarding_workflows:delete',
    displayName: 'Delete onboarding workflows',
    description: 'Allow deactivating onboarding workflows',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'onboarding_requests:read',
    displayName: 'Read onboarding requests',
    description: 'Allow listing and viewing onboarding requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'onboarding_requests:create',
    displayName: 'Create onboarding requests',
    description: 'Allow creating onboarding requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'onboarding_requests:update',
    displayName: 'Update onboarding requests',
    description: 'Allow updating onboarding requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'onboarding_requests:approve',
    displayName: 'Approve onboarding requests',
    description: 'Allow approving and rejecting onboarding requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'onboarding_requests:complete',
    displayName: 'Complete onboarding requests',
    description: 'Allow finalizing onboarding requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'onboarding_requests:cancel',
    displayName: 'Cancel onboarding requests',
    description: 'Allow cancelling onboarding requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'onboarding_tasks:create',
    displayName: 'Create onboarding tasks',
    description: 'Allow creating onboarding tasks',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'onboarding_tasks:complete',
    displayName: 'Complete onboarding tasks',
    description: 'Allow completing onboarding tasks',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'onboarding_documents:create',
    displayName: 'Create onboarding documents',
    description: 'Allow uploading onboarding documents',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'onboarding_documents:verify',
    displayName: 'Verify onboarding documents',
    description: 'Allow verifying onboarding documents',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'offboarding_workflows:read',
    displayName: 'Read offboarding workflows',
    description: 'Allow listing and viewing offboarding workflows',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'offboarding_workflows:create',
    displayName: 'Create offboarding workflows',
    description: 'Allow creating offboarding workflows',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'offboarding_workflows:update',
    displayName: 'Update offboarding workflows',
    description: 'Allow updating offboarding workflows',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'offboarding_workflows:delete',
    displayName: 'Delete offboarding workflows',
    description: 'Allow deactivating offboarding workflows',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'offboarding_requests:read',
    displayName: 'Read offboarding requests',
    description: 'Allow listing and viewing offboarding requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'offboarding_requests:create',
    displayName: 'Create offboarding requests',
    description: 'Allow creating offboarding requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'offboarding_requests:update',
    displayName: 'Update offboarding requests',
    description: 'Allow updating offboarding requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'offboarding_requests:submit',
    displayName: 'Submit offboarding requests',
    description: 'Allow submitting offboarding requests to workflow',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'offboarding_requests:approve',
    displayName: 'Approve offboarding requests',
    description: 'Allow approving and rejecting offboarding requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'offboarding_requests:complete',
    displayName: 'Complete offboarding requests',
    description: 'Allow finalizing offboarding requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'offboarding_requests:cancel',
    displayName: 'Cancel offboarding requests',
    description: 'Allow cancelling offboarding requests',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'offboarding_tasks:create',
    displayName: 'Create offboarding tasks',
    description: 'Allow creating offboarding tasks',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'offboarding_tasks:complete',
    displayName: 'Complete offboarding tasks',
    description: 'Allow completing offboarding tasks',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'offboarding_tasks:reject',
    displayName: 'Reject offboarding tasks',
    description: 'Allow rejecting offboarding tasks',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'offboarding_clearances:create',
    displayName: 'Create offboarding clearances',
    description: 'Allow creating offboarding clearances',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'offboarding_clearances:complete',
    displayName: 'Complete offboarding clearances',
    description: 'Allow completing offboarding clearances',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'offboarding_documents:create',
    displayName: 'Create offboarding documents',
    description: 'Allow uploading offboarding documents',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
  {
    name: 'offboarding_documents:read',
    displayName: 'Read offboarding documents',
    description: 'Allow viewing offboarding documents',
    scopes: GLOBAL_AND_DEFAULT_COMPANY_SCOPES,
  },
];

const roleSeeds: RoleSeed[] = [
  {
    name: 'OWNER',
    displayName: 'Platform Owner',
    description: 'Global platform-level owner with no company membership',
    scopes: GLOBAL_SCOPE,
    permissionNames: [
      'create_company',
      'view_companies',
      'update_company',
      'delete_company',
      'create_company_admin',
      'companies:create',
      'companies:read',
      'companies:update',
      'companies:delete',
      'roles:read',
      'roles:create',
      'roles:update',
      'roles:delete',
      'permissions:read',
      'permissions:create',
      'permissions:update',
      'permissions:delete',
    ],
  },
  {
    name: 'ADMINISTRATOR',
    displayName: 'Company Administrator',
    description: 'Administrator with full access limited to their own company',
    scopes: DEFAULT_COMPANY_SCOPE,
    permissionNames: [
      'view_company_dashboard',
      'manage_company_users',
      'create_company_user',
      'update_company_user',
      'delete_company_user',
      'view_company_data',
      'update_company_data',
      'users:read',
      'users:create',
      'users:update',
      'users:delete',
      'users:assign-role',
      'users:revoke-role',
      'roles:read',
      'roles:create',
      'roles:update',
      'roles:delete',
      'permissions:read',
      'branches:read',
      'branches:create',
      'branches:update',
      'branches:delete',
      'branches:manage-access',
      'departments:read',
      'departments:create',
      'departments:update',
      'departments:delete',
      'positions:read',
      'positions:create',
      'positions:update',
      'positions:delete',
      'designations:read',
      'designations:create',
      'designations:update',
      'designations:delete',
      'employees:read',
      'employees:create',
      'employees:update',
      'employees:delete',
      'employees:change-status',
      'leave_types:read',
      'leave_types:create',
      'leave_types:update',
      'leave_types:delete',
      'leave_policies:read',
      'leave_policies:create',
      'leave_policies:update',
      'leave_policies:delete',
      'leave_workflows:read',
      'leave_workflows:create',
      'leave_workflows:update',
      'leave_workflows:delete',
      'holidays:read',
      'holidays:create',
      'holidays:update',
      'holidays:delete',
      'leave_balances:read',
      'leave_balances:adjust',
      'leave_requests:read',
      'leave_requests:create',
      'leave_requests:update',
      'leave_requests:approve',
      'leave_requests:cancel',
      'attendance_policies:read',
      'attendance_policies:create',
      'attendance_policies:update',
      'attendance_policies:delete',
      'attendance_settings:read',
      'attendance_settings:create',
      'attendance_settings:update',
      'attendance_settings:delete',
      'attendance_holiday_groups:read',
      'attendance_holiday_groups:create',
      'attendance_holiday_groups:update',
      'attendance_holiday_groups:delete',
      'attendance_holidays:read',
      'attendance_holidays:create',
      'attendance_holidays:update',
      'attendance_holidays:delete',
      'attendance_devices:read',
      'attendance_devices:create',
      'attendance_devices:update',
      'attendance_devices:delete',
      'access_doors:read',
      'access_doors:create',
      'access_doors:update',
      'access_doors:delete',
      'attendance_checkpoints:read',
      'attendance_checkpoints:create',
      'attendance_checkpoints:update',
      'attendance_checkpoints:delete',
      'attendance_device_sync_logs:read',
      'attendance_device_sync_logs:create',
      'shifts:read',
      'shifts:create',
      'shifts:update',
      'shifts:delete',
      'shift_breaks:read',
      'shift_breaks:create',
      'shift_breaks:update',
      'shift_breaks:delete',
      'shift_overtime_rules:read',
      'shift_overtime_rules:create',
      'shift_overtime_rules:update',
      'shift_overtime_rules:delete',
      'shift_attendance_rules:read',
      'shift_attendance_rules:create',
      'shift_attendance_rules:update',
      'shift_attendance_rules:delete',
      'shift_assignments:read',
      'shift_assignments:create',
      'shift_assignments:update',
      'shift_assignments:delete',
      'shift_rotation_groups:read',
      'shift_rotation_groups:create',
      'shift_rotation_groups:update',
      'shift_rotation_groups:delete',
      'shift_rotation_rules:read',
      'shift_rotation_rules:create',
      'shift_rotation_rules:update',
      'shift_rotation_rules:delete',
      'shift_schedules:read',
      'shift_schedules:create',
      'shift_schedules:update',
      'shift_schedules:delete',
      'shift_change_requests:read',
      'shift_change_requests:create',
      'shift_change_requests:update',
      'shift_change_requests:delete',
      'shift_templates:read',
      'shift_templates:create',
      'shift_templates:update',
      'shift_templates:delete',
      'timetables:read',
      'timetables:create',
      'timetables:update',
      'timetables:delete',
      'timetable_days:read',
      'timetable_days:create',
      'timetable_days:update',
      'timetable_days:delete',
      'timetable_shift_rules:read',
      'timetable_shift_rules:create',
      'timetable_shift_rules:update',
      'timetable_shift_rules:delete',
      'employee_timetables:read',
      'employee_timetables:create',
      'employee_timetables:update',
      'employee_timetables:delete',
      'timetable_rotations:read',
      'timetable_rotations:create',
      'timetable_rotations:update',
      'timetable_rotations:delete',
      'timetable_rotation_rules:read',
      'timetable_rotation_rules:create',
      'timetable_rotation_rules:update',
      'timetable_rotation_rules:delete',
      'timetable_holiday_rules:read',
      'timetable_holiday_rules:create',
      'timetable_holiday_rules:update',
      'timetable_holiday_rules:delete',
      'timetable_attendance_rules:read',
      'timetable_attendance_rules:create',
      'timetable_attendance_rules:update',
      'timetable_attendance_rules:delete',
      'timetable_generated_schedules:read',
      'timetable_generated_schedules:create',
      'timetable_generated_schedules:update',
      'timetable_generated_schedules:delete',
      'onboarding_workflows:read',
      'onboarding_workflows:create',
      'onboarding_workflows:update',
      'onboarding_workflows:delete',
      'onboarding_requests:read',
      'onboarding_requests:create',
      'onboarding_requests:update',
      'onboarding_requests:approve',
      'onboarding_requests:complete',
      'onboarding_requests:cancel',
      'onboarding_tasks:create',
      'onboarding_tasks:complete',
      'onboarding_documents:create',
      'onboarding_documents:verify',
      'offboarding_requests:read',
      'offboarding_requests:create',
      'offboarding_requests:update',
      'offboarding_requests:submit',
      'offboarding_requests:approve',
      'offboarding_requests:complete',
      'offboarding_requests:cancel',
      'offboarding_workflows:read',
      'offboarding_workflows:create',
      'offboarding_workflows:update',
      'offboarding_workflows:delete',
      'offboarding_tasks:create',
      'offboarding_tasks:complete',
      'offboarding_tasks:reject',
      'offboarding_clearances:create',
      'offboarding_clearances:complete',
      'offboarding_documents:create',
      'offboarding_documents:read',
    ],
  },
  {
    name: 'USER',
    displayName: 'Company User',
    description:
      'Regular company user with access to view company data and manage their user profile',
    scopes: DEFAULT_COMPANY_SCOPE,
    permissionNames: [
      'view_company_data',
      'users:update',
      'employees:read',
      'employees:update',
    ],
  },
  {
    name: 'VIEWER',
    displayName: 'Viewer',
    description:
      'Compatibility role mirroring the default read-only company user access',
    scopes: DEFAULT_COMPANY_SCOPE,
    permissionNames: ['view_company_data'],
  },
];

export default class InitialRbacSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;
      const permissionRepo = manager.getRepository(Permission);
      const roleRepo = manager.getRepository(Role);
      const userRepo = manager.getRepository(User);
      const companyRepo = manager.getRepository(Company);
      const companyUserRepo = manager.getRepository(CompanyUser);
      const companyUserRoleRepo = manager.getRepository(CompanyUserRole);

      const ownerConfig: SeedUserConfig = {
        firstName: process.env.INITIAL_OWNER_FIRST_NAME ?? 'Filbert',
        lastName: process.env.INITIAL_OWNER_LAST_NAME ?? 'Msaki',
        email: process.env.INITIAL_OWNER_EMAIL ?? 'filbert@alliance.co.tz',
        phone: process.env.INITIAL_OWNER_PHONE ?? '+255700000001',
        password: process.env.INITIAL_OWNER_PASSWORD ?? 'Owner123!',
        userNo: process.env.INITIAL_OWNER_USER_NO ?? 'OWNER-00001',
        userType: 'OWNER',
      };

      const companyName =
        process.env.DEFAULT_COMPANY_NAME ?? ALLIANCE_COMPANY_NAME;

      const adminConfig: SeedUserConfig = {
        firstName: process.env.INITIAL_COMPANY_ADMIN_FIRST_NAME ?? 'Inocent',
        lastName: process.env.INITIAL_COMPANY_ADMIN_LAST_NAME ?? 'Nuruva',
        email:
          process.env.INITIAL_COMPANY_ADMIN_EMAIL ?? 'inocent@alliance.co.tz',
        phone: process.env.INITIAL_COMPANY_ADMIN_PHONE ?? '+255700000002',
        password: process.env.INITIAL_COMPANY_ADMIN_PASSWORD ?? 'Admin123!',
        userNo: process.env.INITIAL_COMPANY_ADMIN_USER_NO ?? 'ADMIN-00001',
        userType: 'COMPANY_USER',
      };

      if (
        ownerConfig.email.toLowerCase() === adminConfig.email.toLowerCase() ||
        ownerConfig.phone === adminConfig.phone
      ) {
        throw new Error(
          'OWNER and company administrator must use different email addresses and phone numbers',
        );
      }

      const defaultCompany = await this.ensureCompany(companyRepo, companyName);

      const permissionsByName = await this.syncPermissions(
        permissionRepo,
        permissionSeeds,
      );

      const rolesByScopeAndName = await this.syncRoles(
        roleRepo,
        roleSeeds,
        permissionsByName,
        defaultCompany.id,
      );

      const ownerRole = this.requireRole(rolesByScopeAndName, 'OWNER', null);
      const adminRole = this.requireRole(
        rolesByScopeAndName,
        'ADMINISTRATOR',
        defaultCompany.id,
      );

      const ownerUser = await this.findUserByIdentity(
        userRepo,
        ownerConfig.email,
        ownerConfig.phone,
      );

      const savedOwner = await this.ensureOwnerUser(
        userRepo,
        ownerUser,
        ownerConfig,
        ownerRole,
      );

      await companyUserRepo.delete({ user_id: savedOwner.id });

      const adminUser = await this.findUserByIdentity(
        userRepo,
        adminConfig.email,
        adminConfig.phone,
      );

      const savedAdmin = await this.ensureCompanyUser(
        userRepo,
        adminUser,
        adminConfig,
      );

      const membership = await this.ensureCompanyMembership(
        companyUserRepo,
        defaultCompany.id,
        savedAdmin.id,
      );

      await this.ensureMembershipRole(
        companyUserRoleRepo,
        membership.id,
        adminRole.id,
      );

      await queryRunner.commitTransaction();

      console.log('Multi-tenant seed completed successfully');
      console.log(`OWNER: ${savedOwner.email}`);
      console.log(`COMPANY: ${defaultCompany.name} (${defaultCompany.slug})`);
      console.log(`ADMIN: ${savedAdmin.email}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Seeding failed:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private buildScopeKey(name: string, companyId: number | null): string {
    return `${companyId ?? 'global'}::${name}`;
  }

  private resolveScopeCompanyId(
    scope: SeedScope,
    defaultCompanyId: number,
  ): number | null {
    return scope === 'default_company' ? defaultCompanyId : null;
  }

  private async syncPermissions(
    permissionRepo: Repository<Permission>,
    definitions: PermissionSeed[],
  ): Promise<Map<string, Permission>> {
    const permissionsByName = new Map<string, Permission>();

    for (const definition of definitions) {
      let permission = await permissionRepo.findOne({
        where: { name: definition.name },
      });

      if (!permission) {
        permission = permissionRepo.create({
          name: definition.name,
          display_name: definition.displayName,
          description: definition.description,
          is_system_generated: true,
        });
      } else {
        permission.display_name = definition.displayName;
        permission.description = definition.description;
      }

      permission.is_system_generated = true;

      permission = await permissionRepo.save(permission);
      permissionsByName.set(permission.name, permission);
    }

    return permissionsByName;
  }

  private async syncRoles(
    roleRepo: Repository<Role>,
    definitions: RoleSeed[],
    permissionsByName: Map<string, Permission>,
    defaultCompanyId: number,
  ): Promise<Map<string, Role>> {
    const rolesByScopeAndName = new Map<string, Role>();

    for (const definition of definitions) {
      for (const scope of definition.scopes) {
        const companyId = this.resolveScopeCompanyId(scope, defaultCompanyId);

        let role = await roleRepo.findOne({
          where: {
            name: definition.name,
            company_id: companyId === null ? IsNull() : companyId,
          },
          relations: ['permissions'],
        });

        if (!role) {
          role = roleRepo.create({
            name: definition.name,
            display_name: definition.displayName,
            description: definition.description,
            company_id: companyId,
            is_system_generated: true,
          });
        } else {
          role.display_name = definition.displayName;
          role.description = definition.description;
          role.company_id = companyId;
        }

        role.is_system_generated = true;
        role.permissions = definition.permissionNames.map((permissionName) => {
          const permission = permissionsByName.get(permissionName);

          if (!permission) {
            throw new Error(
              `Permission "${permissionName}" is missing for scope "${scope}"`,
            );
          }

          return permission;
        });

        role = await roleRepo.save(role);
        rolesByScopeAndName.set(this.buildScopeKey(role.name, companyId), role);
      }
    }

    return rolesByScopeAndName;
  }

  private requireRole(
    rolesByScopeAndName: Map<string, Role>,
    roleName: string,
    companyId: number | null,
  ): Role {
    const role = rolesByScopeAndName.get(this.buildScopeKey(roleName, companyId));

    if (!role) {
      throw new Error(`Role "${roleName}" could not be resolved`);
    }

    return role;
  }

  private async findUserByIdentity(
    userRepo: Repository<User>,
    email: string,
    phone: string,
  ): Promise<User | null> {
    const userByEmail = await userRepo.findOne({
      where: { email },
      relations: ['roles'],
    });
    const userByPhone = await userRepo.findOne({
      where: { phone },
      relations: ['roles'],
    });

    if (userByEmail && userByPhone && userByEmail.id !== userByPhone.id) {
      throw new Error(
        `Email ${email} and phone ${phone} belong to different users`,
      );
    }

    return userByEmail ?? userByPhone;
  }

  private async ensureOwnerUser(
    userRepo: Repository<User>,
    existingUser: User | null,
    config: SeedUserConfig,
    ownerRole: Role,
  ): Promise<User> {
    let user = existingUser;

    if (!user) {
      user = userRepo.create({
        user_no: config.userNo,
        first_name: config.firstName,
        last_name: config.lastName,
        phone: config.phone,
        email: config.email,
        password: await hashPassword(config.password),
        status: 'active',
        user_type: config.userType,
        is_email_verified: true,
        roles: [ownerRole],
      });
    } else {
      user.first_name = config.firstName;
      user.last_name = config.lastName;
      user.status = 'active';
      user.user_type = 'OWNER';
      user.is_email_verified = true;
      user.roles = this.mergeRole(user.roles, ownerRole);
    }

    return userRepo.save(user);
  }

  private async ensureCompanyUser(
    userRepo: Repository<User>,
    existingUser: User | null,
    config: SeedUserConfig,
  ): Promise<User> {
    if (existingUser?.user_type === 'OWNER') {
      throw new Error(
        `User ${config.email} is already marked as OWNER and cannot also be a company administrator`,
      );
    }

    let user = existingUser;

    if (!user) {
      user = userRepo.create({
        user_no: config.userNo,
        first_name: config.firstName,
        last_name: config.lastName,
        phone: config.phone,
        email: config.email,
        password: await hashPassword(config.password),
        status: 'active',
        user_type: config.userType,
        is_email_verified: true,
      });
    } else {
      user.first_name = config.firstName;
      user.last_name = config.lastName;
      user.status = 'active';
      user.user_type = 'COMPANY_USER';
      user.is_email_verified = true;
    }

    return userRepo.save(user);
  }

  private async ensureCompany(
    companyRepo: Repository<Company>,
    companyName: string,
  ): Promise<Company> {
    const normalizedCompanyName = companyName.trim();
    let company = await companyRepo.findOne({
      where: { name: normalizedCompanyName },
    });

    if (!company) {
      const uniqueSlug = await this.generateUniqueCompanySlug(
        companyRepo,
        normalizedCompanyName,
      );
      company = companyRepo.create({
        name: normalizedCompanyName,
        slug: uniqueSlug,
        status: 'active',
        metadata: {
          seeded: true,
          purpose: 'default-aicl',
        },
      });
    } else {
      company.name = normalizedCompanyName;
      company.status = 'active';
      company.metadata = {
        ...(company.metadata ?? {}),
        seeded: true,
        purpose: 'default-aicl',
      };
    }

    return companyRepo.save(company);
  }

  private slugifyCompanyName(value: string): string {
    return value
      .trim()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
  }

  private buildSlugCandidate(baseSlug: string, suffix: number): string {
    if (suffix === 0) {
      return baseSlug;
    }

    const suffixText = `-${suffix}`;
    const maxBaseLength = Math.max(1, 120 - suffixText.length);
    const trimmedBase = baseSlug.slice(0, maxBaseLength).replace(/-+$/g, '');
    const safeBase = trimmedBase || 'company';

    return `${safeBase}${suffixText}`;
  }

  private async generateUniqueCompanySlug(
    companyRepo: Repository<Company>,
    companyName: string,
  ): Promise<string> {
    const baseSlug = this.slugifyCompanyName(companyName);

    if (!baseSlug) {
      throw new Error('Company slug could not be generated from company name');
    }

    let suffix = 0;
    while (true) {
      const slugCandidate = this.buildSlugCandidate(baseSlug, suffix);
      const existingCompany = await companyRepo.findOne({
        where: { slug: slugCandidate },
        select: ['id'],
      });

      if (!existingCompany) {
        return slugCandidate;
      }

      suffix += 1;
    }
  }

  private async ensureCompanyMembership(
    companyUserRepo: Repository<CompanyUser>,
    companyId: number,
    userId: number,
  ): Promise<CompanyUser> {
    await companyUserRepo.update({ user_id: userId }, { is_default: false });

    let membership = await companyUserRepo.findOne({
      where: {
        company_id: companyId,
        user_id: userId,
      },
    });

    if (!membership) {
      membership = companyUserRepo.create({
        company_id: companyId,
        user_id: userId,
        status: 'active',
        is_default: true,
      });
    } else {
      membership.status = 'active';
      membership.is_default = true;
    }

    return companyUserRepo.save(membership);
  }

  private async ensureMembershipRole(
    companyUserRoleRepo: Repository<CompanyUserRole>,
    companyUserId: number,
    roleId: number,
  ): Promise<CompanyUserRole> {
    const existingAssignment = await companyUserRoleRepo.findOne({
      where: {
        company_user_id: companyUserId,
        role_id: roleId,
      },
    });

    if (existingAssignment) {
      return existingAssignment;
    }

    return companyUserRoleRepo.save(
      companyUserRoleRepo.create({
        company_user_id: companyUserId,
        role_id: roleId,
      }),
    );
  }

  private mergeRole(existingRoles: Role[] | undefined, role: Role): Role[] {
    const roles = existingRoles ?? [];

    if (roles.some((existingRole) => existingRole.id === role.id)) {
      return roles;
    }

    return [...roles, role];
  }
}
