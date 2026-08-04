import { DataSource, Repository } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Permission } from '../../modules/permissions/entities/permission.entity';
import { PermissionScope } from '../../modules/permissions/enums/permission-scope.enum';

type PermissionSeed = {
  name: string;
  displayName: string;
  description: string;
};

const PLATFORM_PERMISSION_NAMES = new Set<string>([
  'create_company',
  'view_companies',
  'update_company',
  'delete_company',
  'create_company_admin',
  'companies:create',
  'companies:update',
  'companies:delete',
  'permissions:create',
  'permissions:update',
  'permissions:delete',
]);

const SHARED_PERMISSION_NAMES = new Set<string>([
  'companies:read',
  'roles:read',
  'roles:create',
  'roles:update',
  'roles:delete',
  'roles:assign-permission',
  'roles:revoke-permission',
  'permissions:read',
  'security_events:read',
]);

function resolvePermissionScope(name: string): PermissionScope {
  if (PLATFORM_PERMISSION_NAMES.has(name)) {
    return PermissionScope.PLATFORM;
  }

  if (SHARED_PERMISSION_NAMES.has(name)) {
    return PermissionScope.SHARED;
  }

  return PermissionScope.COMPANY;
}

const PERMISSION_SEEDS: PermissionSeed[] = [
  // Company management
  {
    name: 'create_company',
    displayName: 'Create company',
    description: 'Allow creating a new company tenant',
  },
  {
    name: 'view_companies',
    displayName: 'View companies',
    description: 'Allow viewing companies across the platform',
  },
  {
    name: 'update_company',
    displayName: 'Update company',
    description: 'Allow updating company details',
  },
  {
    name: 'delete_company',
    displayName: 'Delete company',
    description: 'Allow deleting a company',
  },
  {
    name: 'create_company_admin',
    displayName: 'Create company administrator',
    description: 'Allow provisioning the first administrator for a company',
  },
  {
    name: 'view_company_dashboard',
    displayName: 'View company dashboard',
    description: 'Allow viewing the company dashboard',
  },
  {
    name: 'manage_company_users',
    displayName: 'Manage company users',
    description: 'Allow managing users within a company',
  },
  {
    name: 'create_company_user',
    displayName: 'Create company user',
    description: 'Allow creating users within a company',
  },
  {
    name: 'update_company_user',
    displayName: 'Update company user',
    description: 'Allow updating users within a company',
  },
  {
    name: 'delete_company_user',
    displayName: 'Delete company user',
    description: 'Allow deleting users within a company',
  },
  {
    name: 'company_users:read',
    displayName: 'Read company users',
    description: 'Allow listing active company users within the current tenant',
  },
  {
    name: 'company_users:create',
    displayName: 'Create company users',
    description: 'Allow adding existing users to the current company tenant',
  },
  {
    name: 'company_users:update',
    displayName: 'Update company users',
    description:
      'Allow assigning roles and direct permissions to company users',
  },
  {
    name: 'company_users:delete',
    displayName: 'Delete company users',
    description: 'Allow removing users from the current company tenant',
  },
  {
    name: 'view_company_data',
    displayName: 'View company data',
    description: 'Allow reading company-owned data',
  },
  {
    name: 'update_company_data',
    displayName: 'Update company data',
    description: 'Allow updating company-owned data',
  },
  // Company CRUD compat
  {
    name: 'companies:create',
    displayName: 'Create companies',
    description: 'Compatibility permission for company creation endpoints',
  },
  {
    name: 'companies:read',
    displayName: 'Read companies',
    description: 'Compatibility permission for company listing endpoints',
  },
  {
    name: 'companies:update',
    displayName: 'Update companies',
    description: 'Compatibility permission for company update endpoints',
  },
  {
    name: 'companies:delete',
    displayName: 'Delete companies',
    description: 'Compatibility permission for company delete endpoints',
  },
  // Users
  {
    name: 'users:read',
    displayName: 'Read users',
    description: 'Compatibility permission for user listing endpoints',
  },
  {
    name: 'users:create',
    displayName: 'Create users',
    description: 'Compatibility permission for user creation endpoints',
  },
  {
    name: 'users:update',
    displayName: 'Update users',
    description: 'Compatibility permission for user update endpoints',
  },
  {
    name: 'users:delete',
    displayName: 'Delete users',
    description: 'Compatibility permission for user delete endpoints',
  },
  {
    name: 'users:assign-role',
    displayName: 'Assign user roles',
    description: 'Compatibility permission for role assignment endpoints',
  },
  {
    name: 'users:revoke-role',
    displayName: 'Revoke user roles',
    description: 'Compatibility permission for role revocation endpoints',
  },
  {
    name: 'users:manage-2fa',
    displayName: 'Manage user 2FA',
    description:
      'Allow administrators to enable or disable two-factor authentication for company users',
  },
  {
    name: 'users:enable-2fa',
    displayName: 'Enable user 2FA',
    description:
      'Allow administrators to enable two-factor authentication for company users',
  },
  {
    name: 'users:disable-2fa',
    displayName: 'Disable user 2FA',
    description:
      'Allow administrators to disable two-factor authentication for company users',
  },
  // Roles
  {
    name: 'roles:read',
    displayName: 'Read roles',
    description: 'Compatibility permission for role listing endpoints',
  },
  {
    name: 'roles:create',
    displayName: 'Create roles',
    description: 'Compatibility permission for role creation endpoints',
  },
  {
    name: 'roles:update',
    displayName: 'Update roles',
    description: 'Compatibility permission for role update endpoints',
  },
  {
    name: 'roles:delete',
    displayName: 'Delete roles',
    description: 'Compatibility permission for role delete endpoints',
  },
  {
    name: 'roles:assign-permission',
    displayName: 'Assign permission to role',
    description:
      'Allow assigning a permission to a role, including system-generated roles',
  },
  {
    name: 'roles:revoke-permission',
    displayName: 'Revoke permission from role',
    description:
      'Allow revoking a permission from a role, including system-generated roles',
  },
  // Permissions
  {
    name: 'permissions:read',
    displayName: 'Read permissions',
    description: 'Compatibility permission for permission listing endpoints',
  },
  {
    name: 'security_events:read',
    displayName: 'Read security events',
    description:
      'Allow viewing authentication, authorization and security audit events',
  },
  {
    name: 'permissions:create',
    displayName: 'Create permissions',
    description: 'Compatibility permission for permission creation endpoints',
  },
  {
    name: 'permissions:update',
    displayName: 'Update permissions',
    description: 'Compatibility permission for permission update endpoints',
  },
  {
    name: 'permissions:delete',
    displayName: 'Delete permissions',
    description: 'Compatibility permission for permission delete endpoints',
  },
  // Branches
  {
    name: 'branches:read',
    displayName: 'Read branches',
    description: 'Allow listing and viewing company branches',
  },
  {
    name: 'branches:create',
    displayName: 'Create branches',
    description: 'Allow creating company branches',
  },
  {
    name: 'branches:update',
    displayName: 'Update branches',
    description: 'Allow updating company branches',
  },
  {
    name: 'branches:delete',
    displayName: 'Delete branches',
    description: 'Allow deleting company branches',
  },
  {
    name: 'branches:manage-access',
    displayName: 'Manage branch access',
    description:
      'Allow granting and revoking branch-level access for company users',
  },
  // Departments
  {
    name: 'departments:read',
    displayName: 'Read departments',
    description: 'Allow listing and viewing company departments',
  },
  {
    name: 'departments:create',
    displayName: 'Create departments',
    description: 'Allow creating company departments',
  },
  {
    name: 'departments:update',
    displayName: 'Update departments',
    description: 'Allow updating company departments',
  },
  {
    name: 'departments:delete',
    displayName: 'Delete departments',
    description: 'Allow deleting company departments',
  },
  {
    name: 'departments:manage-access',
    displayName: 'Manage department access',
    description:
      'Allow granting and revoking department-level user access',
  },
  {
    name: 'data_scope:company',
    displayName: 'Company-wide data scope',
    description:
      'Allow access to authorized records across the active company',
  },
  {
    name: 'data_scope:branch',
    displayName: 'Branch data scope',
    description: 'Restrict access to specifically assigned branches',
  },
  {
    name: 'data_scope:department',
    displayName: 'Department data scope',
    description:
      'Restrict access to assigned or managed departments',
  },
  {
    name: 'data_scope:team',
    displayName: 'Reporting team data scope',
    description:
      'Restrict access to the user and direct reporting employees',
  },
  {
    name: 'data_scope:self',
    displayName: 'Self data scope',
    description:
      'Restrict access to the authenticated employee record',
  },
  // Positions
  {
    name: 'positions:read',
    displayName: 'Read positions',
    description: 'Allow listing and viewing company positions',
  },
  {
    name: 'positions:create',
    displayName: 'Create positions',
    description: 'Allow creating company positions',
  },
  {
    name: 'positions:update',
    displayName: 'Update positions',
    description: 'Allow updating company positions',
  },
  {
    name: 'positions:delete',
    displayName: 'Delete positions',
    description: 'Allow deleting company positions',
  },
  {
    name: 'positions:assign-department',
    displayName: 'Assign positions to departments',
    description:
      'Allow assigning and removing department-position relationships',
  },
  // Employees
  {
    name: 'employees:read',
    displayName: 'Read employees',
    description: 'Allow listing and viewing employee profiles',
  },
  {
    name: 'employees:create',
    displayName: 'Create employees',
    description: 'Allow creating employee profiles for existing company users',
  },
  {
    name: 'employees:update',
    displayName: 'Update employees',
    description: 'Allow updating employee profiles and documents',
  },
  {
    name: 'employees:delete',
    displayName: 'Delete employees',
    description: 'Allow deleting employee profiles',
  },
  {
    name: 'default_avatars:read',
    displayName: 'Read default avatars',
    description: 'Allow viewing the company default avatar library',
  },
  {
    name: 'default_avatars:create',
    displayName: 'Create default avatars',
    description: 'Allow adding new default avatar templates',
  },
  {
    name: 'default_avatars:update',
    displayName: 'Update default avatars',
    description: 'Allow updating default avatar metadata and defaults',
  },
  {
    name: 'default_avatars:delete',
    displayName: 'Delete default avatars',
    description: 'Allow deleting default avatar templates that are not in use',
  },
  {
    name: 'employees:change-status',
    displayName: 'Change employee status',
    description: 'Allow managing employee lifecycle statuses',
  },
  {
    name: 'employees:force-exit-status',
    displayName: 'Force employee exit status',
    description:
      'Allow applying exit-related employee statuses outside the offboarding workflow',
  },
  {
    name: 'employees:override-number',
    displayName: 'Override employee number',
    description:
      'Allow manually supplying or reserving employee numbers during approved migration operations',
  },
  {
    name: 'employee_numbering:read',
    displayName: 'Read employee numbering',
    description:
      'Allow viewing company employee-number configuration and next-sequence settings',
  },
  {
    name: 'employee_numbering:update',
    displayName: 'Update employee numbering',
    description:
      'Allow configuring company employee-number prefixes, padding and next sequence values',
  },
  {
    name: 'employee_assignments:read',
    displayName: 'Read employee assignments',
    description:
      'Allow viewing employee assignment history and current branch, department, position and reporting-line data',
  },
  {
    name: 'employee_assignments:update',
    displayName: 'Update employee assignments',
    description:
      'Allow changing employee branch, department, position, manager, grade and cost centre assignments',
  },
  {
    name: 'employees.import.template.download',
    displayName: 'Download employee import template',
    description: 'Allow downloading the employee Excel import template',
  },
  {
    name: 'employees.import.preview',
    displayName: 'Preview employee imports',
    description:
      'Allow uploading employee Excel files for validation preview before import',
  },
  {
    name: 'employees.import.execute',
    displayName: 'Execute employee imports',
    description: 'Allow confirming and executing employee Excel imports',
  },
  {
    name: 'employees.import.history.view',
    displayName: 'View employee import history',
    description: 'Allow viewing employee Excel import history and summaries',
  },
  {
    name: 'employees.import.result.download',
    displayName: 'Download employee import results',
    description: 'Allow downloading employee Excel import result workbooks',
  },
  {
    name: 'employee_grades:read',
    displayName: 'Read employee grades',
    description: 'Allow listing and viewing employee grades',
  },
  {
    name: 'employee_grades:create',
    displayName: 'Create employee grades',
    description: 'Allow creating employee grades',
  },
  {
    name: 'employee_grades:update',
    displayName: 'Update employee grades',
    description: 'Allow updating employee grades',
  },
  {
    name: 'employee_grades:delete',
    displayName: 'Delete employee grades',
    description: 'Allow deleting employee grades',
  },
  {
    name: 'cost_centers:read',
    displayName: 'Read cost centers',
    description: 'Allow listing and viewing company cost centers',
  },
  {
    name: 'cost_centers:create',
    displayName: 'Create cost centers',
    description: 'Allow creating company cost centers',
  },
  {
    name: 'cost_centers:update',
    displayName: 'Update cost centers',
    description: 'Allow updating company cost centers',
  },
  {
    name: 'cost_centers:delete',
    displayName: 'Delete cost centers',
    description: 'Allow deleting company cost centers',
  },
  // Leave types
  {
    name: 'leave_types:read',
    displayName: 'Read leave types',
    description: 'Allow listing and viewing leave types',
  },
  {
    name: 'leave_types:create',
    displayName: 'Create leave types',
    description: 'Allow creating leave types',
  },
  {
    name: 'leave_types:update',
    displayName: 'Update leave types',
    description: 'Allow updating leave types',
  },
  {
    name: 'leave_types:delete',
    displayName: 'Delete leave types',
    description: 'Allow deleting leave types',
  },
  // Leave policies
  {
    name: 'leave_policies:read',
    displayName: 'Read leave policies',
    description: 'Allow listing and viewing leave policies',
  },
  {
    name: 'leave_policies:create',
    displayName: 'Create leave policies',
    description: 'Allow creating leave policies',
  },
  {
    name: 'leave_policies:update',
    displayName: 'Update leave policies',
    description: 'Allow updating leave policies',
  },
  {
    name: 'leave_policies:delete',
    displayName: 'Delete leave policies',
    description: 'Allow deleting leave policies',
  },
  // Leave workflows
  {
    name: 'leave_workflows:read',
    displayName: 'Read leave workflows',
    description: 'Allow listing and viewing leave workflows',
  },
  {
    name: 'leave_workflows:create',
    displayName: 'Create leave workflows',
    description: 'Allow creating leave workflows',
  },
  {
    name: 'leave_workflows:update',
    displayName: 'Update leave workflows',
    description: 'Allow updating leave workflows',
  },
  {
    name: 'leave_workflows:delete',
    displayName: 'Delete leave workflows',
    description: 'Allow deleting leave workflows',
  },
  // Holidays
  {
    name: 'holidays:read',
    displayName: 'Read holidays',
    description: 'Allow listing and viewing holidays',
  },
  {
    name: 'holidays:create',
    displayName: 'Create holidays',
    description: 'Allow creating holidays',
  },
  {
    name: 'holidays:update',
    displayName: 'Update holidays',
    description: 'Allow updating holidays',
  },
  {
    name: 'holidays:delete',
    displayName: 'Delete holidays',
    description: 'Allow deleting holidays',
  },
  // Leave balances
  {
    name: 'leave_balances:read',
    displayName: 'Read leave balances',
    description: 'Allow listing and viewing leave balances',
  },
  {
    name: 'leave_balances:adjust',
    displayName: 'Adjust leave balances',
    description: 'Allow manually adjusting leave balances',
  },
  {
    name: 'leave-balances.view',
    displayName: 'View leave balances',
    description: 'Allow viewing leave balances for accessible employees',
  },
  {
    name: 'leave-balances.view-own',
    displayName: 'View own leave balances',
    description: 'Allow employees to view only their own leave balances',
  },
  {
    name: 'leave-balances.manage',
    displayName: 'Manage leave balances',
    description: 'Allow managing leave balances across accessible employees',
  },
  {
    name: 'leave-balances.adjust',
    displayName: 'Adjust leave balances',
    description: 'Allow applying manual leave balance adjustments',
  },
  {
    name: 'leave-balances.generate',
    displayName: 'Generate leave balances',
    description: 'Allow generating yearly leave balances',
  },
  {
    name: 'leave-balances.carry-forward',
    displayName: 'Carry forward leave balances',
    description: 'Allow recalculating carry-forward leave balances',
  },
  // Leave requests
  {
    name: 'leave_requests:read',
    displayName: 'Read leave requests',
    description: 'Allow listing and viewing leave requests',
  },
  {
    name: 'leave_requests:create',
    displayName: 'Create leave requests',
    description: 'Allow creating leave requests',
  },
  {
    name: 'leave_requests:update',
    displayName: 'Update leave requests',
    description: 'Allow updating leave request documents and medical details',
  },
  {
    name: 'leave_requests:approve',
    displayName: 'Approve leave requests',
    description: 'Allow approving or rejecting leave requests',
  },
  {
    name: 'leave_requests:cancel',
    displayName: 'Cancel leave requests',
    description: 'Allow cancelling leave requests',
  },
  // Attendance policies
  {
    name: 'attendance_policies:read',
    displayName: 'Read attendance policies',
    description: 'Allow listing and viewing attendance policies',
  },
  {
    name: 'attendance_policies:create',
    displayName: 'Create attendance policies',
    description: 'Allow creating attendance policies',
  },
  {
    name: 'attendance_policies:update',
    displayName: 'Update attendance policies',
    description: 'Allow updating and activating attendance policies',
  },
  {
    name: 'attendance_policies:delete',
    displayName: 'Delete attendance policies',
    description: 'Allow deleting attendance policies',
  },
  // Attendance holiday groups
  {
    name: 'attendance_holiday_groups:read',
    displayName: 'Read attendance holiday groups',
    description: 'Allow listing and viewing attendance holiday groups',
  },
  {
    name: 'attendance_holiday_groups:create',
    displayName: 'Create attendance holiday groups',
    description: 'Allow creating attendance holiday groups',
  },
  {
    name: 'attendance_holiday_groups:update',
    displayName: 'Update attendance holiday groups',
    description: 'Allow updating attendance holiday groups',
  },
  {
    name: 'attendance_holiday_groups:delete',
    displayName: 'Delete attendance holiday groups',
    description: 'Allow deleting attendance holiday groups',
  },
  // Attendance holidays
  {
    name: 'attendance_holidays:read',
    displayName: 'Read attendance holidays',
    description: 'Allow listing and viewing attendance holidays',
  },
  {
    name: 'attendance_holidays:create',
    displayName: 'Create attendance holidays',
    description: 'Allow creating attendance holidays',
  },
  {
    name: 'attendance_holidays:update',
    displayName: 'Update attendance holidays',
    description: 'Allow updating attendance holidays',
  },
  {
    name: 'attendance_holidays:delete',
    displayName: 'Delete attendance holidays',
    description: 'Allow deleting attendance holidays',
  },
  // Attendance devices
  {
    name: 'attendance_devices:read',
    displayName: 'Read attendance devices',
    description: 'Allow listing and viewing attendance devices',
  },
  {
    name: 'attendance_devices:create',
    displayName: 'Create attendance devices',
    description: 'Allow creating attendance devices',
  },
  {
    name: 'attendance_devices:update',
    displayName: 'Update attendance devices',
    description: 'Allow updating attendance devices',
  },
  {
    name: 'attendance_devices:delete',
    displayName: 'Delete attendance devices',
    description: 'Allow deleting attendance devices',
  },
  // Access doors
  {
    name: 'access_doors:read',
    displayName: 'Read access doors',
    description: 'Allow listing and viewing access doors',
  },
  {
    name: 'access_doors:create',
    displayName: 'Create access doors',
    description: 'Allow creating access doors',
  },
  {
    name: 'access_doors:update',
    displayName: 'Update access doors',
    description: 'Allow updating and syncing access doors',
  },
  {
    name: 'access_doors:delete',
    displayName: 'Delete access doors',
    description: 'Allow deleting access doors',
  },
  // Access organizations
  {
    name: 'access_organizations:read',
    displayName: 'Read access organizations',
    description: 'Allow listing and viewing access organizations',
  },
  {
    name: 'access_organizations:create',
    displayName: 'Create access organizations',
    description: 'Allow creating access organizations',
  },
  {
    name: 'access_organizations:update',
    displayName: 'Update access organizations',
    description: 'Allow updating and syncing access organizations',
  },
  {
    name: 'access_organizations:delete',
    displayName: 'Delete access organizations',
    description: 'Allow deleting access organizations',
  },
  // Access schedule templates
  {
    name: 'access_schedule_templates:read',
    displayName: 'Read access schedule templates',
    description: 'Allow listing and viewing access schedule templates',
  },
  {
    name: 'access_schedule_templates:create',
    displayName: 'Create access schedule templates',
    description: 'Allow creating access schedule templates',
  },
  {
    name: 'access_schedule_templates:update',
    displayName: 'Update access schedule templates',
    description: 'Allow updating access schedule templates',
  },
  {
    name: 'access_schedule_templates:delete',
    displayName: 'Delete access schedule templates',
    description: 'Allow deleting access schedule templates',
  },
  // Access week plans
  {
    name: 'access_week_plans:read',
    displayName: 'Read access week plans',
    description: 'Allow listing and viewing access week plans',
  },
  {
    name: 'access_week_plans:create',
    displayName: 'Create access week plans',
    description: 'Allow creating access week plans',
  },
  {
    name: 'access_week_plans:update',
    displayName: 'Update access week plans',
    description: 'Allow updating access week plans',
  },
  {
    name: 'access_week_plans:delete',
    displayName: 'Delete access week plans',
    description: 'Allow deleting access week plans',
  },
  // Access groups
  {
    name: 'access_groups:read',
    displayName: 'Read access groups',
    description: 'Allow listing and viewing access groups',
  },
  {
    name: 'access_groups:create',
    displayName: 'Create access groups',
    description: 'Allow creating access groups',
  },
  {
    name: 'access_groups:update',
    displayName: 'Update access groups',
    description: 'Allow updating and syncing access groups',
  },
  {
    name: 'access_groups:delete',
    displayName: 'Delete access groups',
    description: 'Allow deleting access groups',
  },
  // Employee access credentials
  {
    name: 'employee_access_credentials:read',
    displayName: 'Read employee access credentials',
    description: 'Allow viewing employee access credentials',
  },
  {
    name: 'employee_access_credentials:create',
    displayName: 'Create employee access credentials',
    description: 'Allow creating employee access credentials',
  },
  {
    name: 'employee_access_credentials:update',
    displayName: 'Update employee access credentials',
    description: 'Allow updating employee access credentials',
  },
  {
    name: 'employee_access_credentials:delete',
    displayName: 'Delete employee access credentials',
    description: 'Allow deleting employee access credentials',
  },
  // Employee device assignments
  {
    name: 'employee_device_assignments:read',
    displayName: 'Read employee device assignments',
    description:
      'Allow viewing employee device assignments and Hikvision device users',
  },
  {
    name: 'employee_device_assignments:create',
    displayName: 'Create employee device assignments',
    description: 'Allow assigning employees to devices',
  },
  {
    name: 'employee_device_assignments:update',
    displayName: 'Update employee device assignments',
    description:
      'Allow updating employee device assignments and device user details',
  },
  {
    name: 'employee_device_assignments:delete',
    displayName: 'Delete employee device assignments',
    description: 'Allow removing employee device assignments',
  },
  // Access control sync
  {
    name: 'access_control_sync:execute',
    displayName: 'Execute access control sync',
    description: 'Allow triggering centralized access control synchronization',
  },
  // Hikvision
  {
    name: 'hikvision_attendance:read',
    displayName: 'Read Hikvision attendance logs',
    description:
      'Allow listing and viewing Hikvision attendance logs and capabilities',
  },
  {
    name: 'hikvision_attendance:sync',
    displayName: 'Sync Hikvision attendance',
    description:
      'Allow pulling and syncing Hikvision attendance events from devices',
  },
  // Attendance checkpoints
  {
    name: 'attendance_checkpoints:read',
    displayName: 'Read attendance checkpoints',
    description: 'Allow listing and viewing attendance checkpoints',
  },
  {
    name: 'attendance_checkpoints:create',
    displayName: 'Create attendance checkpoints',
    description: 'Allow creating attendance checkpoints',
  },
  {
    name: 'attendance_checkpoints:update',
    displayName: 'Update attendance checkpoints',
    description: 'Allow updating attendance checkpoints',
  },
  {
    name: 'attendance_checkpoints:delete',
    displayName: 'Delete attendance checkpoints',
    description: 'Allow deleting attendance checkpoints',
  },
  // Attendance geofences
  {
    name: 'attendance_geofences:read',
    displayName: 'Read attendance geofences',
    description: 'Allow listing and viewing attendance geofences',
  },
  {
    name: 'attendance_geofences:create',
    displayName: 'Create attendance geofences',
    description: 'Allow creating attendance geofences',
  },
  {
    name: 'attendance_geofences:update',
    displayName: 'Update attendance geofences',
    description: 'Allow updating attendance geofences',
  },
  {
    name: 'attendance_geofences:delete',
    displayName: 'Delete attendance geofences',
    description: 'Allow deleting attendance geofences',
  },
  // Attendance WiFi networks
  {
    name: 'attendance_wifi_networks:read',
    displayName: 'Read attendance WiFi networks',
    description: 'Allow listing and viewing attendance WiFi networks',
  },
  {
    name: 'attendance_wifi_networks:create',
    displayName: 'Create attendance WiFi networks',
    description: 'Allow creating attendance WiFi networks',
  },
  {
    name: 'attendance_wifi_networks:update',
    displayName: 'Update attendance WiFi networks',
    description: 'Allow updating attendance WiFi networks',
  },
  {
    name: 'attendance_wifi_networks:delete',
    displayName: 'Delete attendance WiFi networks',
    description: 'Allow deleting attendance WiFi networks',
  },
  // Attendance mobile punches
  {
    name: 'attendance_mobile_punches:read',
    displayName: 'Read attendance mobile punches',
    description: 'Allow viewing attendance mobile punches across the company',
  },
  {
    name: 'attendance_mobile_punches:create',
    displayName: 'Create attendance mobile punches',
    description:
      'Allow creating attendance mobile punches for company employees',
  },
  {
    name: 'attendance_mobile_punches:update',
    displayName: 'Update attendance mobile punches',
    description: 'Allow reviewing attendance mobile punch override requests',
  },
  // Attendance device sync logs
  {
    name: 'attendance_device_sync_logs:read',
    displayName: 'Read attendance device sync logs',
    description: 'Allow listing and viewing attendance device sync logs',
  },
  {
    name: 'attendance_device_sync_logs:create',
    displayName: 'Create attendance device sync logs',
    description: 'Allow creating attendance device sync logs',
  },
  // Attendance processing
  {
    name: 'attendance_processing:read',
    displayName: 'Read attendance processing',
    description: 'Allow viewing attendance processing jobs and unmatched logs',
  },
  {
    name: 'attendance_processing:execute',
    displayName: 'Execute attendance processing',
    description: 'Allow running attendance processing from raw logs',
  },
  {
    name: 'attendance_recalculation:execute',
    displayName: 'Execute attendance recalculation',
    description: 'Allow queueing and running attendance recalculation jobs',
  },
  {
    name: 'attendance_summaries:read',
    displayName: 'Read attendance summaries',
    description: 'Allow viewing processed daily attendance summaries',
  },
  {
    name: 'team_attendance:read',
    displayName: 'Read team attendance',
    description:
      'Allow viewing attendance summaries for direct reports and scoped teams',
  },
  {
    name: 'attendance_business_trips:read',
    displayName: 'Read attendance business trips',
    description: 'Allow viewing attendance business trips',
  },
  {
    name: 'attendance_business_trips:create',
    displayName: 'Create attendance business trips',
    description: 'Allow creating attendance business trips',
  },
  {
    name: 'attendance_business_trips:update',
    displayName: 'Update attendance business trips',
    description: 'Allow editing or submitting draft attendance business trips',
  },
  {
    name: 'attendance_business_trips:approve',
    displayName: 'Approve attendance business trips',
    description: 'Allow approving or rejecting attendance business trips',
  },
  {
    name: 'attendance_business_trips:cancel',
    displayName: 'Cancel attendance business trips',
    description: 'Allow cancelling attendance business trips',
  },
  {
    name: 'attendance_business_trips:delete',
    displayName: 'Delete attendance business trips',
    description: 'Allow deleting attendance business trips',
  },
  // Shifts
  {
    name: 'shifts:read',
    displayName: 'Read shifts',
    description: 'Allow listing and viewing shifts',
  },
  {
    name: 'shifts:create',
    displayName: 'Create shifts',
    description: 'Allow creating shifts',
  },
  {
    name: 'shifts:update',
    displayName: 'Update shifts',
    description: 'Allow updating shifts',
  },
  {
    name: 'shifts:delete',
    displayName: 'Delete shifts',
    description: 'Allow deleting shifts',
  },
  // Shift breaks
  {
    name: 'shift_breaks:read',
    displayName: 'Read shift breaks',
    description: 'Allow listing and viewing shift breaks',
  },
  {
    name: 'shift_breaks:create',
    displayName: 'Create shift breaks',
    description: 'Allow creating shift breaks',
  },
  {
    name: 'shift_breaks:update',
    displayName: 'Update shift breaks',
    description: 'Allow updating shift breaks',
  },
  {
    name: 'shift_breaks:delete',
    displayName: 'Delete shift breaks',
    description: 'Allow deleting shift breaks',
  },
  // Shift overtime rules
  {
    name: 'shift_overtime_rules:read',
    displayName: 'Read shift overtime rules',
    description: 'Allow listing and viewing shift overtime rules',
  },
  {
    name: 'shift_overtime_rules:create',
    displayName: 'Create shift overtime rules',
    description: 'Allow creating shift overtime rules',
  },
  {
    name: 'shift_overtime_rules:update',
    displayName: 'Update shift overtime rules',
    description: 'Allow updating shift overtime rules',
  },
  {
    name: 'shift_overtime_rules:delete',
    displayName: 'Delete shift overtime rules',
    description: 'Allow deleting shift overtime rules',
  },
  // Shift attendance rules
  {
    name: 'shift_attendance_rules:read',
    displayName: 'Read shift attendance rules',
    description: 'Allow listing and viewing shift attendance rules',
  },
  {
    name: 'shift_attendance_rules:create',
    displayName: 'Create shift attendance rules',
    description: 'Allow creating shift attendance rules',
  },
  {
    name: 'shift_attendance_rules:update',
    displayName: 'Update shift attendance rules',
    description: 'Allow updating shift attendance rules',
  },
  {
    name: 'shift_attendance_rules:delete',
    displayName: 'Delete shift attendance rules',
    description: 'Allow deleting shift attendance rules',
  },
  // Shift assignments
  {
    name: 'shift_assignments:read',
    displayName: 'Read shift assignments',
    description: 'Allow listing and viewing shift assignments',
  },
  {
    name: 'shift_assignments:create',
    displayName: 'Create shift assignments',
    description: 'Allow creating shift assignments',
  },
  {
    name: 'shift_assignments:update',
    displayName: 'Update shift assignments',
    description: 'Allow updating shift assignments',
  },
  {
    name: 'shift_assignments:delete',
    displayName: 'Delete shift assignments',
    description: 'Allow deleting shift assignments',
  },
  // Shift rotation groups
  {
    name: 'shift_rotation_groups:read',
    displayName: 'Read shift rotation groups',
    description: 'Allow listing and viewing shift rotation groups',
  },
  {
    name: 'shift_rotation_groups:create',
    displayName: 'Create shift rotation groups',
    description: 'Allow creating shift rotation groups',
  },
  {
    name: 'shift_rotation_groups:update',
    displayName: 'Update shift rotation groups',
    description: 'Allow updating shift rotation groups',
  },
  {
    name: 'shift_rotation_groups:delete',
    displayName: 'Delete shift rotation groups',
    description: 'Allow deleting shift rotation groups',
  },
  // Shift rotation rules
  {
    name: 'shift_rotation_rules:read',
    displayName: 'Read shift rotation rules',
    description: 'Allow listing and viewing shift rotation rules',
  },
  {
    name: 'shift_rotation_rules:create',
    displayName: 'Create shift rotation rules',
    description: 'Allow creating shift rotation rules',
  },
  {
    name: 'shift_rotation_rules:update',
    displayName: 'Update shift rotation rules',
    description: 'Allow updating shift rotation rules',
  },
  {
    name: 'shift_rotation_rules:delete',
    displayName: 'Delete shift rotation rules',
    description: 'Allow deleting shift rotation rules',
  },
  // Shift schedules
  {
    name: 'shift_schedules:read',
    displayName: 'Read shift schedules',
    description: 'Allow listing and viewing shift schedules',
  },
  {
    name: 'shift_schedules:create',
    displayName: 'Create shift schedules',
    description: 'Allow creating shift schedules',
  },
  {
    name: 'shift_schedules:update',
    displayName: 'Update shift schedules',
    description: 'Allow updating shift schedules',
  },
  {
    name: 'shift_schedules:delete',
    displayName: 'Delete shift schedules',
    description: 'Allow deleting shift schedules',
  },
  // Shift change requests
  {
    name: 'shift_change_requests:read',
    displayName: 'Read shift change requests',
    description: 'Allow listing and viewing shift change requests',
  },
  {
    name: 'shift_change_requests:create',
    displayName: 'Create shift change requests',
    description: 'Allow creating shift change requests',
  },
  {
    name: 'shift_change_requests:update',
    displayName: 'Update shift change requests',
    description: 'Allow updating shift change requests',
  },
  {
    name: 'shift_change_requests:delete',
    displayName: 'Delete shift change requests',
    description: 'Allow deleting shift change requests',
  },
  // Shift templates
  {
    name: 'shift_templates:read',
    displayName: 'Read shift templates',
    description: 'Allow listing and viewing shift templates',
  },
  {
    name: 'shift_templates:create',
    displayName: 'Create shift templates',
    description: 'Allow creating shift templates',
  },
  {
    name: 'shift_templates:update',
    displayName: 'Update shift templates',
    description: 'Allow updating shift templates',
  },
  {
    name: 'shift_templates:delete',
    displayName: 'Delete shift templates',
    description: 'Allow deleting shift templates',
  },
  // Timetables
  {
    name: 'timetables:read',
    displayName: 'Read timetables',
    description: 'Allow listing and viewing timetables',
  },
  {
    name: 'timetables:create',
    displayName: 'Create timetables',
    description: 'Allow creating timetables',
  },
  {
    name: 'timetables:update',
    displayName: 'Update timetables',
    description: 'Allow updating timetables',
  },
  {
    name: 'timetables:delete',
    displayName: 'Delete timetables',
    description: 'Allow deleting timetables',
  },
  // Timetable days
  {
    name: 'timetable_days:read',
    displayName: 'Read timetable days',
    description: 'Allow listing and viewing timetable day configurations',
  },
  {
    name: 'timetable_days:create',
    displayName: 'Create timetable days',
    description: 'Allow creating timetable day configurations',
  },
  {
    name: 'timetable_days:update',
    displayName: 'Update timetable days',
    description: 'Allow updating timetable day configurations',
  },
  {
    name: 'timetable_days:delete',
    displayName: 'Delete timetable days',
    description: 'Allow deleting timetable day configurations',
  },
  // Timetable shift rules
  {
    name: 'timetable_shift_rules:read',
    displayName: 'Read timetable shift rules',
    description: 'Allow listing and viewing timetable shift rules',
  },
  {
    name: 'timetable_shift_rules:create',
    displayName: 'Create timetable shift rules',
    description: 'Allow creating timetable shift rules',
  },
  {
    name: 'timetable_shift_rules:update',
    displayName: 'Update timetable shift rules',
    description: 'Allow updating timetable shift rules',
  },
  {
    name: 'timetable_shift_rules:delete',
    displayName: 'Delete timetable shift rules',
    description: 'Allow deleting timetable shift rules',
  },
  // Employee timetables
  {
    name: 'employee_timetables:read',
    displayName: 'Read employee timetables',
    description: 'Allow listing and viewing employee timetable assignments',
  },
  {
    name: 'employee_timetables:create',
    displayName: 'Create employee timetables',
    description: 'Allow creating employee timetable assignments',
  },
  {
    name: 'employee_timetables:update',
    displayName: 'Update employee timetables',
    description: 'Allow updating employee timetable assignments',
  },
  {
    name: 'employee_timetables:delete',
    displayName: 'Delete employee timetables',
    description: 'Allow deleting employee timetable assignments',
  },
  // Timetable rotations
  {
    name: 'timetable_rotations:read',
    displayName: 'Read timetable rotations',
    description: 'Allow listing and viewing timetable rotations',
  },
  {
    name: 'timetable_rotations:create',
    displayName: 'Create timetable rotations',
    description: 'Allow creating timetable rotations',
  },
  {
    name: 'timetable_rotations:update',
    displayName: 'Update timetable rotations',
    description: 'Allow updating timetable rotations',
  },
  {
    name: 'timetable_rotations:delete',
    displayName: 'Delete timetable rotations',
    description: 'Allow deleting timetable rotations',
  },
  // Timetable rotation rules
  {
    name: 'timetable_rotation_rules:read',
    displayName: 'Read timetable rotation rules',
    description: 'Allow listing and viewing timetable rotation rules',
  },
  {
    name: 'timetable_rotation_rules:create',
    displayName: 'Create timetable rotation rules',
    description: 'Allow creating timetable rotation rules',
  },
  {
    name: 'timetable_rotation_rules:update',
    displayName: 'Update timetable rotation rules',
    description: 'Allow updating timetable rotation rules',
  },
  {
    name: 'timetable_rotation_rules:delete',
    displayName: 'Delete timetable rotation rules',
    description: 'Allow deleting timetable rotation rules',
  },
  // Timetable holiday rules
  {
    name: 'timetable_holiday_rules:read',
    displayName: 'Read timetable holiday rules',
    description: 'Allow listing and viewing timetable holiday rules',
  },
  {
    name: 'timetable_holiday_rules:create',
    displayName: 'Create timetable holiday rules',
    description: 'Allow creating timetable holiday rules',
  },
  {
    name: 'timetable_holiday_rules:update',
    displayName: 'Update timetable holiday rules',
    description: 'Allow updating timetable holiday rules',
  },
  {
    name: 'timetable_holiday_rules:delete',
    displayName: 'Delete timetable holiday rules',
    description: 'Allow deleting timetable holiday rules',
  },
  // Timetable attendance rules
  {
    name: 'timetable_attendance_rules:read',
    displayName: 'Read timetable attendance rules',
    description: 'Allow listing and viewing timetable attendance rules',
  },
  {
    name: 'timetable_attendance_rules:create',
    displayName: 'Create timetable attendance rules',
    description: 'Allow creating timetable attendance rules',
  },
  {
    name: 'timetable_attendance_rules:update',
    displayName: 'Update timetable attendance rules',
    description: 'Allow updating timetable attendance rules',
  },
  {
    name: 'timetable_attendance_rules:delete',
    displayName: 'Delete timetable attendance rules',
    description: 'Allow deleting timetable attendance rules',
  },
  // Timetable generated schedules
  {
    name: 'timetable_generated_schedules:read',
    displayName: 'Read timetable generated schedules',
    description: 'Allow listing and viewing timetable generated schedules',
  },
  {
    name: 'timetable_generated_schedules:create',
    displayName: 'Create timetable generated schedules',
    description: 'Allow creating timetable generated schedules',
  },
  {
    name: 'timetable_generated_schedules:update',
    displayName: 'Update timetable generated schedules',
    description: 'Allow updating timetable generated schedules',
  },
  {
    name: 'timetable_generated_schedules:delete',
    displayName: 'Delete timetable generated schedules',
    description: 'Allow deleting timetable generated schedules',
  },
  // Onboarding workflows
  {
    name: 'onboarding_workflows:read',
    displayName: 'Read onboarding workflows',
    description: 'Allow listing and viewing onboarding workflows',
  },
  {
    name: 'onboarding_workflows:create',
    displayName: 'Create onboarding workflows',
    description: 'Allow creating onboarding workflows',
  },
  {
    name: 'onboarding_workflows:update',
    displayName: 'Update onboarding workflows',
    description: 'Allow updating onboarding workflows',
  },
  {
    name: 'onboarding_workflows:delete',
    displayName: 'Delete onboarding workflows',
    description: 'Allow deactivating onboarding workflows',
  },
  // Onboarding requests
  {
    name: 'onboarding_requests:read',
    displayName: 'Read onboarding requests',
    description: 'Allow listing and viewing onboarding requests',
  },
  {
    name: 'onboarding_requests:create',
    displayName: 'Create onboarding requests',
    description: 'Allow creating onboarding requests',
  },
  {
    name: 'onboarding_requests:update',
    displayName: 'Update onboarding requests',
    description: 'Allow updating onboarding requests',
  },
  {
    name: 'onboarding_requests:approve',
    displayName: 'Approve onboarding requests',
    description: 'Allow approving and rejecting onboarding requests',
  },
  {
    name: 'onboarding_requests:complete',
    displayName: 'Complete onboarding requests',
    description: 'Allow finalizing onboarding requests',
  },
  {
    name: 'onboarding_requests:cancel',
    displayName: 'Cancel onboarding requests',
    description: 'Allow cancelling onboarding requests',
  },
  // Onboarding tasks
  {
    name: 'onboarding_tasks:read',
    displayName: 'Read onboarding tasks',
    description: 'Allow viewing onboarding tasks',
  },
  {
    name: 'onboarding_tasks:create',
    displayName: 'Create onboarding tasks',
    description: 'Allow creating onboarding tasks',
  },
  {
    name: 'onboarding_tasks:update',
    displayName: 'Update onboarding tasks',
    description: 'Allow reassigning or updating onboarding tasks',
  },
  {
    name: 'onboarding_tasks:complete',
    displayName: 'Complete onboarding tasks',
    description: 'Allow completing onboarding tasks',
  },
  // Onboarding documents
  {
    name: 'onboarding_documents:read',
    displayName: 'Read onboarding documents',
    description: 'Allow viewing onboarding documents',
  },
  {
    name: 'onboarding_documents:create',
    displayName: 'Create onboarding documents',
    description: 'Allow uploading onboarding documents',
  },
  {
    name: 'onboarding_documents:update',
    displayName: 'Update onboarding documents',
    description: 'Allow updating onboarding document metadata',
  },
  {
    name: 'onboarding_documents:verify',
    displayName: 'Verify onboarding documents',
    description: 'Allow verifying onboarding documents',
  },
  {
    name: 'onboarding_documents:delete',
    displayName: 'Delete onboarding documents',
    description: 'Allow deleting onboarding documents',
  },
  // Offboarding workflows
  {
    name: 'offboarding_workflows:read',
    displayName: 'Read offboarding workflows',
    description: 'Allow listing and viewing offboarding workflows',
  },
  {
    name: 'offboarding_workflows:create',
    displayName: 'Create offboarding workflows',
    description: 'Allow creating offboarding workflows',
  },
  {
    name: 'offboarding_workflows:update',
    displayName: 'Update offboarding workflows',
    description: 'Allow updating offboarding workflows',
  },
  {
    name: 'offboarding_workflows:delete',
    displayName: 'Delete offboarding workflows',
    description: 'Allow deactivating offboarding workflows',
  },
  // Offboarding requests
  {
    name: 'offboarding_requests:read',
    displayName: 'Read offboarding requests',
    description: 'Allow listing and viewing offboarding requests',
  },
  {
    name: 'offboarding_requests:create',
    displayName: 'Create offboarding requests',
    description: 'Allow creating offboarding requests',
  },
  {
    name: 'offboarding_requests:update',
    displayName: 'Update offboarding requests',
    description: 'Allow updating offboarding requests',
  },
  {
    name: 'offboarding_requests:submit',
    displayName: 'Submit offboarding requests',
    description: 'Allow submitting offboarding requests to workflow',
  },
  {
    name: 'offboarding_requests:approve',
    displayName: 'Approve offboarding requests',
    description: 'Allow approving and rejecting offboarding requests',
  },
  {
    name: 'offboarding_requests:complete',
    displayName: 'Complete offboarding requests',
    description: 'Allow finalizing offboarding requests',
  },
  {
    name: 'offboarding_requests:cancel',
    displayName: 'Cancel offboarding requests',
    description: 'Allow cancelling offboarding requests',
  },
  // Offboarding tasks
  {
    name: 'offboarding_tasks:read',
    displayName: 'Read offboarding tasks',
    description: 'Allow viewing offboarding tasks',
  },
  {
    name: 'offboarding_tasks:create',
    displayName: 'Create offboarding tasks',
    description: 'Allow creating offboarding tasks',
  },
  {
    name: 'offboarding_tasks:complete',
    displayName: 'Complete offboarding tasks',
    description: 'Allow completing offboarding tasks',
  },
  {
    name: 'offboarding_tasks:reject',
    displayName: 'Reject offboarding tasks',
    description: 'Allow rejecting offboarding tasks',
  },
  // Offboarding clearances
  {
    name: 'offboarding_clearances:read',
    displayName: 'Read offboarding clearances',
    description: 'Allow viewing offboarding clearances',
  },
  {
    name: 'offboarding_clearances:create',
    displayName: 'Create offboarding clearances',
    description: 'Allow creating offboarding clearances',
  },
  {
    name: 'offboarding_clearances:complete',
    displayName: 'Complete offboarding clearances',
    description: 'Allow completing offboarding clearances',
  },
  // Offboarding documents
  {
    name: 'offboarding_documents:create',
    displayName: 'Create offboarding documents',
    description: 'Allow uploading offboarding documents',
  },
  {
    name: 'offboarding_documents:read',
    displayName: 'Read offboarding documents',
    description: 'Allow viewing offboarding documents',
  },
  {
    name: 'offboarding_documents:update',
    displayName: 'Update offboarding documents',
    description: 'Allow updating offboarding document metadata',
  },
  {
    name: 'offboarding_documents:delete',
    displayName: 'Delete offboarding documents',
    description: 'Allow deleting offboarding documents',
  },
  {
    name: 'offboarding_access:read',
    displayName: 'Read offboarding access-termination operations',
    description: 'Allow viewing offboarding access-termination operations',
  },
  {
    name: 'offboarding_access:retry',
    displayName: 'Retry failed access termination',
    description: 'Allow retrying a failed offboarding access termination',
  },
  {
    name: 'offboarding_access:emergency-terminate',
    displayName: 'Immediately terminate employee access',
    description:
      'Allow immediately scheduling emergency offboarding access termination',
  },
  {
    name: 'offboarding_requests:finalize',
    displayName: 'Finalize completed employee offboarding',
    description:
      'Allow finalizing an offboarding request after access termination completes',
  },
  {
    name: 'offboarding_assets:verify',
    displayName: 'Verify returned employee assets',
    description: 'Allow verifying condition and receipt of returned assets',
  },
  {
    name: 'offboarding_assets:waive',
    displayName: 'Waive unresolved employee assets',
    description: 'Allow waiving a missing or unresolved asset return',
  },
  {
    name: 'offboarding_settlements:verify',
    displayName: 'Verify final-settlement readiness',
    description: 'Allow verifying offboarding settlement items',
  },
  {
    name: 'offboarding_settlements:waive',
    displayName: 'Waive an offboarding settlement item',
    description: 'Allow waiving an offboarding settlement item',
  },
  {
    name: 'offboarding_approvals:delegate',
    displayName: 'Delegate assigned offboarding approval',
    description: 'Allow delegating an approval assigned to the current actor',
  },
  {
    name: 'offboarding_approvals:delegate-any',
    displayName: 'Delegate any offboarding approval',
    description: 'Allow HR to delegate any pending offboarding approval',
  },
  {
    name: 'offboarding_letters:read',
    displayName: 'Read generated exit letters',
    description: 'Allow reading generated relieving and service letters',
  },
  {
    name: 'self_service_requests:approve',
    displayName: 'Approve self-service requests',
    description: 'Allow reviewing employee self-service approval requests',
  },
  {
    name: 'profile_change_request.view_all',
    displayName: 'View profile change requests',
    description: 'Allow listing profile change requests for HR review',
  },
  {
    name: 'profile_change_request.review',
    displayName: 'Start profile change review',
    description: 'Allow starting review of employee profile change requests',
  },
  {
    name: 'profile_change_request.approve',
    displayName: 'Approve profile changes',
    description: 'Allow approving employee profile change requests',
  },
  {
    name: 'profile_change_request.reject',
    displayName: 'Reject profile changes',
    description: 'Allow rejecting employee profile change requests',
  },
  {
    name: 'profile_change_request.request_correction',
    displayName: 'Request profile change correction',
    description:
      'Allow returning employee profile change requests for correction',
  },
  {
    name: 'profile_change_request.view_audit',
    displayName: 'View profile change audit',
    description:
      'Allow viewing audit history for employee profile change requests',
  },
  {
    name: 'profile_change_request.view_pending_files',
    displayName: 'View pending profile change files',
    description:
      'Allow previewing pending files attached to employee profile change requests',
  },
  {
    name: 'notifications:read',
    displayName: 'Read notifications',
    description: 'Allow viewing notifications in the active company context',
  },
  {
    name: 'notifications:update',
    displayName: 'Update notifications',
    description: 'Allow marking notifications as seen or read',
  },
  {
    name: 'notifications:delete',
    displayName: 'Archive notifications',
    description: 'Allow archiving notifications in the active company context',
  },
  {
    name: 'notifications:send',
    displayName: 'Send notifications',
    description: 'Allow sending test or operational notifications',
  },
  {
    name: 'scheduled_reports:read',
    displayName: 'Read scheduled reports',
    description:
      'Allow viewing scheduled report definitions, templates, and schedules',
  },
  {
    name: 'scheduled_reports:create',
    displayName: 'Create scheduled reports',
    description: 'Allow creating report templates and schedules',
  },
  {
    name: 'scheduled_reports:update',
    displayName: 'Update scheduled reports',
    description: 'Allow updating report templates and schedules',
  },
  {
    name: 'scheduled_reports:delete',
    displayName: 'Delete scheduled reports',
    description: 'Allow deleting report templates and schedules',
  },
  {
    name: 'scheduled_reports:run',
    displayName: 'Run scheduled reports',
    description: 'Allow manually running scheduled reports and test deliveries',
  },
  {
    name: 'scheduled_reports:manage_smtp',
    displayName: 'Manage scheduled report SMTP',
    description:
      'Allow creating, updating, and deleting scheduled-report SMTP configurations',
  },
  {
    name: 'scheduled_reports:test_smtp',
    displayName: 'Test scheduled report SMTP',
    description:
      'Allow validating SMTP configurations before they are saved or activated',
  },
  {
    name: 'scheduled_reports:view_history',
    displayName: 'View scheduled report history',
    description: 'Allow viewing scheduled report execution history',
  },
  {
    name: 'hrms_launch_readiness:read',
    displayName: 'Read HRMS launch readiness',
    description: 'Allow viewing the HRMS launch readiness report',
  },
];

export default class PermissionsSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const repo: Repository<Permission> = qr.manager.getRepository(Permission);

      for (const seed of PERMISSION_SEEDS) {
        let permission = await repo.findOne({ where: { name: seed.name } });

        if (!permission) {
          permission = repo.create({
            name: seed.name,
            display_name: seed.displayName,
            description: seed.description,
            scope: resolvePermissionScope(seed.name),
            is_system_generated: true,
          });
        } else {
          permission.display_name = seed.displayName;
          permission.description = seed.description;
          permission.scope = resolvePermissionScope(seed.name);
          permission.is_system_generated = true;
        }

        await repo.save(permission);
      }

      await qr.commitTransaction();
      const totals = PERMISSION_SEEDS.reduce(
        (acc, seed) => {
          acc[resolvePermissionScope(seed.name)] += 1;
          return acc;
        },
        {
          [PermissionScope.PLATFORM]: 0,
          [PermissionScope.COMPANY]: 0,
          [PermissionScope.SHARED]: 0,
        },
      );
      console.log(
        `[Seeder][Permissions] Upserted ${PERMISSION_SEEDS.length} permissions ` +
          `(platform=${totals[PermissionScope.PLATFORM]}, ` +
          `company=${totals[PermissionScope.COMPANY]}, ` +
          `shared=${totals[PermissionScope.SHARED]})`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][Permissions] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
