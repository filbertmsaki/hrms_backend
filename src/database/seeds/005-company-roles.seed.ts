import { DataSource, In } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { Permission } from '../../modules/permissions/entities/permission.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

export type CompanyRoleSeed = {
  name: string;
  displayName: string;
  description: string;
  permissionNames: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared permission sets reused across roles
// ─────────────────────────────────────────────────────────────────────────────

/** Permissions every authenticated company user needs */
const HOLIDAY_READ_PERMISSIONS = [
  'holidays:read',
  'attendance_holiday_groups:read',
  'attendance_holidays:read',
];

const ATTENDANCE_READ_PERMISSIONS = ['attendance_policies:read'];

const SELF_SERVICE_OFFBOARDING_REQUEST_PERMISSIONS = [
  'offboarding_workflows:read',
  'offboarding_requests:read',
  'offboarding_requests:create',
  'offboarding_requests:update',
  'offboarding_requests:submit',
  'offboarding_requests:cancel',
];

const SELF_SERVICE_PERMISSIONS = [
  'view_company_data',
  'users:update', // own profile
  'employees:read',
  'notifications:read',
  'notifications:update',
  'notifications:delete',
  ...HOLIDAY_READ_PERMISSIONS,
  ...ATTENDANCE_READ_PERMISSIONS,
  'leave_types:read',
  'leave_requests:read',
  'leave_requests:create',
  'leave_requests:cancel',
  'leave_balances:read',
  'leave-balances.view-own',
  'attendance_summaries:read',
  'attendance_mobile_punches:create',
  'shift_change_requests:read',
  'shift_change_requests:create',
  'performance_self_service:read',
  'performance_self_service:update',
  ...SELF_SERVICE_OFFBOARDING_REQUEST_PERMISSIONS,
  'performance_periods:read',
  'performance_kpis:self:read',
  'performance_kpis:self:create',
  'performance_kpis:self:update',
  'performance_kpis:self:submit',
  'performance_self_service:read',
  'performance_self_service:update',
  'work_activities:self-service:read',
  'work_activities:self-service:update',
];

/** HR Performance management (`/dashboard/performance/*`). */
const PERFORMANCE_MANAGEMENT_PERMISSIONS = [
  'performance_financial_years:read',
  'performance_financial_years:create',
  'performance_periods:read',
  'performance_periods:create',
  'performance_rating_scales:read',
  'performance_rating_scales:create',
  'performance_competencies:read',
  'performance_competencies:create',
  'kpi_definitions:read',
  'kpi_definitions:create',
  'kpi_definitions:update',
  'kpi_applicability_rules:read',
  'kpi_applicability_rules:create',
  'kpi_templates:read',
  'kpi_templates:create',
  'performance_plans:read',
  'performance_plans:create',
  'performance_assignments:create',
  'performance_reviews:approve',
  'performance_reviews:moderate',
  'performance_reviews:reopen',
  'performance_reviews:appeal-review',
  'performance_kpis:sync',
  'performance_aggregates:read',
  'performance_aggregates:calculate',
  'performance_dashboards:read',
  'performance_manager:read',
  'performance_manager:review',
  'performance_manager:validate',
  'performance_pip:read',
  'performance_pip:create',
  'performance_pip:review',
  'performance_pip:close',
];

/** Read-only structural lookups needed by managers and HR */
const ORG_STRUCTURE_READ_PERMISSIONS = [
  'branches:read',
  'departments:read',
  'positions:read',
  'employee_grades:read',
  'cost_centers:read',
  'employee_assignments:read',
  'employee_numbering:read',
];

/** Team approval permissions shared by all manager-level roles */
const TEAM_APPROVAL_PERMISSIONS = [
  'manager_self_service:read',
  'manager_team:read',
  'manager:read',
  'work_activities:manager:read',
  'work_activities:manager:review',
  'performance_kpis:team:read',
  'performance_kpis:review',
  'performance_manager:read',
  'performance_manager:review',
  'performance_manager:validate',
  'performance_reviews:workflow-read',
  'performance_reviews:workflow-action',
  'performance_development_plans:read',
  'performance_development_plans:update',
  'performance_periods:create',
  'performance_periods:update',
  'performance_periods:activate',
  'performance_periods:close',
  'leave_requests:approve',
  'shift_change_requests:update',
  'shift_change_requests:delete',
  'onboarding_requests:read',
  'onboarding_requests:approve',
  'onboarding_tasks:read',
  'onboarding_tasks:complete',
  'onboarding_documents:read',
  'onboarding_documents:verify',
  'offboarding_requests:read',
  'offboarding_requests:approve',
  'offboarding_tasks:complete',
  'offboarding_tasks:reject',
  'offboarding_clearances:complete',
];

const PERFORMANCE_ADMIN_PERMISSIONS = [
  'performance_financial_years:read',
  'performance_financial_years:create',
  'performance_periods:read',
  'performance_periods:create',
  'performance_periods:update',
  'performance_periods:activate',
  'performance_periods:close',
  'performance_scorecards:read',
  'performance_scorecards:create',
  'performance_workflows:read',
  'performance_workflows:create',
  'performance_reviews:workflow-read',
  'performance_reviews:workflow-action',
  'performance_development_plans:read',
  'performance_development_plans:create',
  'performance_development_plans:update',
  'performance_reports:read',
  'performance_reports:export',
  'performance_calibration:read',
  'performance_kpis:all:read',
  'performance_kpis:team:read',
  'performance_kpis:review',
  'performance_dashboards:read',
];

const COMPANY_USER_ADMIN_PERMISSIONS = [
  'company_users:read',
  'company_users:create',
  'company_users:update',
  'company_users:delete',
];

const TEAM_ATTENDANCE_PERMISSIONS = ['team_attendance:read'];

const SELF_SERVICE_APPROVAL_PERMISSIONS = ['self_service_requests:approve'];
const PROFILE_CHANGE_APPROVAL_PERMISSIONS = [
  'profile_change_request.view_all',
  'profile_change_request.review',
  'profile_change_request.approve',
  'profile_change_request.reject',
  'profile_change_request.request_correction',
  'profile_change_request.view_audit',
  'profile_change_request.view_pending_files',
];

const ATTENDANCE_BUSINESS_TRIP_FULL_PERMISSIONS = [
  'attendance_business_trips:read',
  'attendance_business_trips:create',
  'attendance_business_trips:update',
  'attendance_business_trips:approve',
  'attendance_business_trips:cancel',
  'attendance_business_trips:delete',
];

const ATTENDANCE_BUSINESS_TRIP_OPERATIONAL_PERMISSIONS = [
  'attendance_business_trips:read',
  'attendance_business_trips:create',
  'attendance_business_trips:update',
  'attendance_business_trips:approve',
  'attendance_business_trips:cancel',
];

export const COMPANY_ROLE_SEEDS: CompanyRoleSeed[] = [
  // ───────────────────────────────────────────────
  // 1. COMPANY_ADMIN
  // Full control over their company tenant.
  // ───────────────────────────────────────────────
  {
    name: 'COMPANY_ADMIN',
    displayName: 'Company Admin',
    description:
      'Manages company setup, users, branches, departments, roles, and all settings within the company.',
    permissionNames: [
      // Company & dashboard
      'companies:read',
      'view_company_dashboard',
      'view_company_data',
      'update_company_data',
      'data_scope:company',
      'security_events:read',
      // Users & roles
      'manage_company_users',
      'create_company_user',
      'update_company_user',
      'delete_company_user',
      ...COMPANY_USER_ADMIN_PERMISSIONS,
      'users:read',
      'users:create',
      'users:update',
      'users:delete',
      'users:assign-role',
      'users:revoke-role',
      'users:manage-2fa',
      'users:enable-2fa',
      'users:disable-2fa',
      'roles:read',
      'roles:create',
      'roles:update',
      'roles:delete',
      'roles:assign-permission',
      'roles:revoke-permission',
      'permissions:read',
      'notifications:send',
      'notifications:test',
      'notifications:delivery-logs:read',
      'notifications:mail-logs:read',
      'notifications:mail-logs:retry',
      'notifications:settings:read',
      'notifications:settings:update',
      'sms:settings:read',
      'sms:settings:update',
      'sms:logs:read',
      'sms:logs:retry',
      'sms:test',
      'scheduled_reports:read',
      'scheduled_reports:create',
      'scheduled_reports:update',
      'scheduled_reports:delete',
      'scheduled_reports:run',
      'scheduled_reports:manage_smtp',
      'scheduled_reports:test_smtp',
      'scheduled_reports:view_history',
      'scheduled_reports:download',
      // Org structure
      'branches:read',
      'branches:create',
      'branches:update',
      'branches:delete',
      'branches:manage-access',
      'departments:read',
      'departments:create',
      'departments:update',
      'departments:delete',
      'departments:manage-access',
      'positions:read',
      'positions:create',
      'positions:update',
      'positions:delete',
      'positions:assign-department',
      // Employees (full lifecycle)
      'employees:read',
      'employees:create',
      'employees:update',
      'employees:delete',
      'employees:change-status',
      'employees:force-exit-status',
      'employees:override-number',
      'employee_assignments:update',
      'employee_numbering:update',
      'employee_grades:create',
      'employee_grades:update',
      'employee_grades:delete',
      'cost_centers:create',
      'cost_centers:update',
      'cost_centers:delete',
      'default_avatars:read',
      'default_avatars:create',
      'default_avatars:update',
      'default_avatars:delete',
      'employees.import.template.download',
      'employees.import.preview',
      'employees.import.execute',
      'employees.import.history.view',
      'employees.import.result.download',
      // Leave (full management)
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
      'leave-balances.view',
      'leave-balances.view-own',
      'leave-balances.manage',
      'leave-balances.adjust',
      'leave-balances.generate',
      'leave-balances.carry-forward',
      'leave_requests:read',
      'leave_requests:create',
      'leave_requests:update',
      'leave_requests:approve',
      'leave_requests:cancel',
      // Attendance (full management)
      'attendance_policies:read',
      'attendance_policies:create',
      'attendance_policies:update',
      'attendance_policies:delete',
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
      'attendance_checkpoints:read',
      'attendance_checkpoints:create',
      'attendance_checkpoints:update',
      'attendance_checkpoints:delete',
      'attendance_geofences:read',
      'attendance_geofences:create',
      'attendance_geofences:update',
      'attendance_geofences:delete',
      'attendance_wifi_networks:read',
      'attendance_wifi_networks:create',
      'attendance_wifi_networks:update',
      'attendance_wifi_networks:delete',
      'attendance_mobile_punches:read',
      'attendance_mobile_punches:create',
      'attendance_mobile_punches:update',
      'attendance_device_sync_logs:read',
      'attendance_device_sync_logs:create',
      'attendance_processing:read',
      'attendance_processing:execute',
      'attendance_recalculation:execute',
      'attendance_summaries:read',
      ...TEAM_ATTENDANCE_PERMISSIONS,
      ...ATTENDANCE_BUSINESS_TRIP_FULL_PERMISSIONS,
      'hrms_launch_readiness:read',
      // Access control
      'access_doors:read',
      'access_doors:create',
      'access_doors:update',
      'access_doors:delete',
      'access_organizations:read',
      'access_organizations:create',
      'access_organizations:update',
      'access_organizations:delete',
      'access_schedule_templates:read',
      'access_schedule_templates:create',
      'access_schedule_templates:update',
      'access_schedule_templates:delete',
      'access_week_plans:read',
      'access_week_plans:create',
      'access_week_plans:update',
      'access_week_plans:delete',
      'access_groups:read',
      'access_groups:create',
      'access_groups:update',
      'access_groups:delete',
      'employee_access_credentials:read',
      'employee_access_credentials:create',
      'employee_access_credentials:update',
      'employee_access_credentials:delete',
      'employee_device_assignments:read',
      'employee_device_assignments:create',
      'employee_device_assignments:update',
      'employee_device_assignments:delete',
      'access_control_sync:execute',
      'hikvision_attendance:read',
      'hikvision_attendance:sync',
      // Shifts (full management)
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
      'shift_change_requests:update',
      'shift_change_requests:delete',
      'shift_templates:read',
      'shift_templates:create',
      'shift_templates:update',
      'shift_templates:delete',
      // Timetables (full management)
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
      // Onboarding & offboarding (full management)
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
      'onboarding_tasks:read',
      'onboarding_tasks:create',
      'onboarding_tasks:update',
      'onboarding_tasks:complete',
      'onboarding_documents:read',
      'onboarding_documents:create',
      'onboarding_documents:update',
      'onboarding_documents:verify',
      'onboarding_documents:delete',
      'offboarding_workflows:read',
      'offboarding_workflows:create',
      'offboarding_workflows:update',
      'offboarding_workflows:delete',
      'offboarding_requests:read',
      'offboarding_requests:create',
      'offboarding_requests:update',
      'offboarding_requests:submit',
      'offboarding_requests:approve',
      'offboarding_requests:complete',
      'offboarding_requests:cancel',
      'offboarding_tasks:read',
      'offboarding_tasks:create',
      'offboarding_tasks:complete',
      'offboarding_tasks:reject',
      'offboarding_clearances:read',
      'offboarding_clearances:create',
      'offboarding_clearances:complete',
      'offboarding_documents:update',
      'offboarding_documents:delete',
      'offboarding_documents:create',
      'offboarding_documents:read',
      // Performance management (years, periods, plans, reviews)
      ...PERFORMANCE_MANAGEMENT_PERMISSIONS,
      ...SELF_SERVICE_APPROVAL_PERMISSIONS,
      ...PROFILE_CHANGE_APPROVAL_PERMISSIONS,
    ],
  },

  // ───────────────────────────────────────────────
  // 2. HR_MANAGER
  // Full HR operations. Owns employee lifecycle,
  // leave, attendance, onboarding/offboarding.
  // Cannot manage system roles, access control hardware,
  // or company-level billing/settings.
  // ───────────────────────────────────────────────
  {
    name: 'HR_MANAGER',
    displayName: 'HR Manager',
    description:
      'Manages HR operations: employees, leave, attendance, onboarding, offboarding, shifts, and reports.',
    permissionNames: [
      'view_company_dashboard',
      'data_scope:company',
      // Self-service (HR Manager is also an employee)
      ...SELF_SERVICE_PERMISSIONS,
      ...PERFORMANCE_ADMIN_PERMISSIONS,
      // Org structure read
      ...ORG_STRUCTURE_READ_PERMISSIONS,
      // Users (read only — cannot delete/create system users)
      'users:read',
      // Employees (full lifecycle including status change)
      'employees:update',
      'employees:create',
      'employees:delete',
      'employees:change-status',
      'employees:force-exit-status',
      'employees:override-number',
      'employee_assignments:update',
      'employee_numbering:update',
      'employee_grades:create',
      'employee_grades:update',
      'employee_grades:delete',
      'cost_centers:create',
      'cost_centers:update',
      'cost_centers:delete',
      'employees.import.template.download',
      'employees.import.preview',
      'employees.import.execute',
      'employees.import.history.view',
      'employees.import.result.download',
      // Leave (full management)
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
      'leave_balances:adjust',
      'leave-balances.view',
      'leave-balances.manage',
      'leave-balances.adjust',
      'leave-balances.generate',
      'leave-balances.carry-forward',
      'leave_requests:read',
      'leave_requests:create',
      'leave_requests:update',
      'leave_requests:approve',
      'leave_requests:cancel',
      // Attendance (full management except hardware sync)
      'attendance_policies:read',
      'attendance_policies:create',
      'attendance_policies:update',
      'attendance_policies:delete',
      'attendance_holiday_groups:read',
      'attendance_holiday_groups:create',
      'attendance_holiday_groups:update',
      'attendance_holiday_groups:delete',
      'attendance_holidays:read',
      'attendance_holidays:create',
      'attendance_holidays:update',
      'attendance_holidays:delete',
      'attendance_checkpoints:read',
      'attendance_checkpoints:create',
      'attendance_checkpoints:update',
      'attendance_checkpoints:delete',
      'attendance_geofences:read',
      'attendance_geofences:create',
      'attendance_geofences:update',
      'attendance_geofences:delete',
      'attendance_wifi_networks:read',
      'attendance_wifi_networks:create',
      'attendance_wifi_networks:update',
      'attendance_wifi_networks:delete',
      'attendance_mobile_punches:read',
      'attendance_mobile_punches:update',
      'attendance_device_sync_logs:read',
      'attendance_processing:read',
      'attendance_processing:execute',
      'attendance_recalculation:execute',
      ...TEAM_ATTENDANCE_PERMISSIONS,
      ...ATTENDANCE_BUSINESS_TRIP_FULL_PERMISSIONS,
      ...SELF_SERVICE_APPROVAL_PERMISSIONS,
      ...PROFILE_CHANGE_APPROVAL_PERMISSIONS,
      'hrms_launch_readiness:read',
      // Shifts (full management)
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
      'shift_change_requests:update',
      'shift_change_requests:delete',
      'shift_templates:read',
      'shift_templates:create',
      'shift_templates:update',
      'shift_templates:delete',
      // Timetables (full management)
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
      // Onboarding & offboarding (full HR control)
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
      'onboarding_tasks:read',
      'onboarding_tasks:create',
      'onboarding_tasks:update',
      'onboarding_tasks:complete',
      'onboarding_documents:read',
      'onboarding_documents:create',
      'onboarding_documents:update',
      'onboarding_documents:verify',
      'onboarding_documents:delete',
      'offboarding_workflows:read',
      'offboarding_workflows:create',
      'offboarding_workflows:update',
      'offboarding_workflows:delete',
      'offboarding_requests:read',
      'offboarding_requests:create',
      'offboarding_requests:update',
      'offboarding_requests:submit',
      'offboarding_requests:approve',
      'offboarding_requests:complete',
      'offboarding_requests:cancel',
      'offboarding_tasks:read',
      'offboarding_tasks:create',
      'offboarding_tasks:complete',
      'offboarding_tasks:reject',
      'offboarding_clearances:read',
      'offboarding_clearances:create',
      'offboarding_clearances:complete',
      'offboarding_documents:update',
      'offboarding_documents:delete',
      'offboarding_documents:create',
      'offboarding_documents:read',
      // Performance management (years, periods, plans, reviews)
      ...PERFORMANCE_MANAGEMENT_PERMISSIONS,
      // Role permission management
      'roles:assign-permission',
      'roles:revoke-permission',
      'notifications:send',
      'notifications:test',
      'notifications:delivery-logs:read',
      'notifications:mail-logs:read',
      'notifications:mail-logs:retry',
      'notifications:settings:read',
      'notifications:settings:update',
      'sms:settings:read',
      'sms:settings:update',
      'sms:logs:read',
      'sms:logs:retry',
      'sms:test',
    ],
  },

  // ───────────────────────────────────────────────
  // 3. HR_OFFICER
  // Handles daily HR activities: employee records,
  // documents, leave review, onboarding tasks.
  // Cannot change employee status or delete employees.
  // ───────────────────────────────────────────────
  {
    name: 'HR_OFFICER',
    displayName: 'HR Officer',
    description:
      'Handles daily HR activities: employee records, documents, leave review, attendance, and onboarding tasks.',
    permissionNames: [
      'data_scope:company',
      // Self-service (HR Officer is also an employee)
      ...SELF_SERVICE_PERMISSIONS,
      ...PERFORMANCE_ADMIN_PERMISSIONS,
      ...ORG_STRUCTURE_READ_PERMISSIONS,
      'users:read',
      // Employees (no delete, no status change)
      'employees:update',
      'employee_assignments:update',
      'employees.import.template.download',
      'employees.import.preview',
      'employees.import.execute',
      'employees.import.history.view',
      'employees.import.result.download',
      // Leave (read + day-to-day ops, no policy/type management)
      'leave_types:read',
      'leave_policies:read',
      'leave_workflows:read',
      'holidays:read',
      'leave-balances.view',
      'leave-balances.manage',
      'leave-balances.adjust',
      'leave_requests:read',
      'leave_requests:update',
      'leave_requests:approve',
      // Attendance
      'attendance_mobile_punches:update',
      'attendance_processing:read',
      ...ATTENDANCE_BUSINESS_TRIP_OPERATIONAL_PERMISSIONS,
      ...SELF_SERVICE_APPROVAL_PERMISSIONS,
      ...PROFILE_CHANGE_APPROVAL_PERMISSIONS,
      'hrms_launch_readiness:read',
      // Shifts (read only)
      'shifts:read',
      'shift_assignments:read',
      'shift_schedules:read',
      'shift_change_requests:update',
      // Onboarding (day-to-day tasks and document verification)
      'onboarding_workflows:read',
      'onboarding_requests:read',
      'onboarding_requests:update',
      'onboarding_requests:approve',
      'onboarding_tasks:read',
      'onboarding_tasks:complete',
      'onboarding_documents:read',
      'onboarding_documents:create',
      'onboarding_documents:verify',
      // Offboarding (day-to-day tasks)
      'offboarding_workflows:read',
      'offboarding_requests:read',
      'offboarding_tasks:read',
      'offboarding_tasks:complete',
      'offboarding_tasks:reject',
      'offboarding_clearances:read',
      'offboarding_clearances:complete',
      'offboarding_documents:create',
      'offboarding_documents:read',
    ],
  },

  // ───────────────────────────────────────────────
  // 4. DEPARTMENT_MANAGER
  // Manages a department's team. Approves leave,
  // shift changes, and onboarding/offboarding steps.
  // No HR lifecycle powers (cannot hire/fire/change status).
  // ───────────────────────────────────────────────
  {
    name: 'DEPARTMENT_MANAGER',
    displayName: 'Department Manager',
    description:
      'Manages employees within their department. Approves leave, shift changes, and workflow steps. No HR lifecycle powers.',
    permissionNames: [
      'view_company_dashboard',
      'data_scope:department',
      // Self-service (covers view_company_data, employees:read, leave, attendance, shift change)
      ...SELF_SERVICE_PERMISSIONS,
      ...ORG_STRUCTURE_READ_PERMISSIONS,
      'leave-balances.view',
      // Team approval
      ...TEAM_APPROVAL_PERMISSIONS,
      ...TEAM_ATTENDANCE_PERMISSIONS,
      // Shifts (team visibility)
      'shifts:read',
      'shift_assignments:read',
      'shift_schedules:read',
    ],
  },

  // ───────────────────────────────────────────────
  // 5. BRANCH_MANAGER
  // Manages employees, attendance, and approvals
  // scoped to their branch. Similar powers to
  // Department Manager but branch-scoped.
  // ───────────────────────────────────────────────
  {
    name: 'BRANCH_MANAGER',
    displayName: 'Branch Manager',
    description:
      'Manages employees, attendance, and approvals for their branch. Branch-scoped equivalent of Department Manager.',
    permissionNames: [
      'view_company_dashboard',
      'data_scope:branch',
      // Self-service (covers view_company_data, employees:read, leave, attendance, shift change)
      ...SELF_SERVICE_PERMISSIONS,
      // ORG_STRUCTURE_READ_PERMISSIONS already includes branches:read
      ...ORG_STRUCTURE_READ_PERMISSIONS,
      'leave-balances.view',
      // Team approval
      ...TEAM_APPROVAL_PERMISSIONS,
      ...TEAM_ATTENDANCE_PERMISSIONS,
      // Attendance (branch-wide visibility)
      'attendance_mobile_punches:read',
      // Shifts (branch visibility)
      'shifts:read',
      'shift_assignments:read',
      'shift_schedules:read',
    ],
  },

  // ───────────────────────────────────────────────
  // 6. EMPLOYEE
  // Self-service only. Views their own profile,
  // submits leave/attendance/shift change requests.
  // All data is further scoped to own records in services.
  // ───────────────────────────────────────────────
  {
    name: 'EMPLOYEE',
    displayName: 'Employee',
    description:
      'Self-service role. Can view profile, attendance, leave balance, and submit requests. Data is scoped to own records.',
    permissionNames: ['data_scope:self', ...SELF_SERVICE_PERMISSIONS],
  },

  {
    name: 'IT_ADMIN',
    displayName: 'IT Administrator',
    description:
      'Manages user accounts, authentication, access-control devices and technical security configuration.',
    permissionNames: [
      'data_scope:company',
      'company_users:read',
      'company_users:create',
      'company_users:update',
      'users:read',
      'users:create',
      'users:update',
      'users:assign-role',
      'users:revoke-role',
      'users:manage-2fa',
      'users:enable-2fa',
      'users:disable-2fa',
      'roles:read',
      'permissions:read',
      'branches:read',
      'departments:read',
      'positions:read',
      'attendance_devices:read',
      'attendance_devices:create',
      'attendance_devices:update',
      'employee_access_credentials:read',
      'employee_access_credentials:update',
      'employee_device_assignments:read',
      'employee_device_assignments:create',
      'employee_device_assignments:update',
      'employee_device_assignments:delete',
      'access_control_sync:execute',
      'security_events:read',
    ],
  },

  {
    name: 'ATTENDANCE_ADMIN',
    displayName: 'Attendance Administrator',
    description:
      'Manages attendance policies, shifts, devices, corrections and attendance processing.',
    permissionNames: [
      'data_scope:company',
      'employees:read',
      'branches:read',
      'departments:read',
      'attendance_policies:read',
      'attendance_policies:create',
      'attendance_policies:update',
      'attendance_devices:read',
      'attendance_device_sync_logs:read',
      'attendance_processing:read',
      'attendance_processing:execute',
      'attendance_recalculation:execute',
      'attendance_summaries:read',
      'attendance_mobile_punches:update',
      'team_attendance:read',
      'shifts:read',
      'shift_assignments:read',
      'shift_assignments:create',
      'shift_assignments:update',
      'timetables:read',
      'employee_timetables:read',
      'employee_timetables:create',
      'employee_timetables:update',
    ],
  },

  {
    name: 'LEAVE_ADMIN',
    displayName: 'Leave Administrator',
    description:
      'Manages leave types, policies, balances, workflows and HR leave approvals.',
    permissionNames: [
      'data_scope:company',
      'employees:read',
      'branches:read',
      'departments:read',
      'leave_types:read',
      'leave_types:create',
      'leave_types:update',
      'leave_policies:read',
      'leave_policies:create',
      'leave_policies:update',
      'leave_workflows:read',
      'leave_workflows:create',
      'leave_workflows:update',
      'leave_balances:read',
      'leave_balances:adjust',
      'leave_requests:read',
      'leave_requests:update',
      'leave_requests:approve',
      'leave_requests:cancel',
    ],
  },

  // ───────────────────────────────────────────────
  // 7. AUDITOR
  // Read-only access to HR data, reports, logs,
  // and compliance records. Cannot create, update,
  // or approve anything.
  // ───────────────────────────────────────────────
  {
    name: 'AUDITOR',
    displayName: 'Auditor',
    description:
      'Read-only access to reports, logs, HR data, and compliance records. Cannot create, update, or approve anything.',
    permissionNames: [
      'view_company_dashboard',
      'view_company_data',
      'data_scope:company',
      'security_events:read',
      ...ORG_STRUCTURE_READ_PERMISSIONS,
      'users:read',
      'employees:read',
      'employees.import.history.view',
      'employees.import.result.download',
      // Leave (read only)
      'leave_types:read',
      'leave_policies:read',
      'leave_workflows:read',
      ...HOLIDAY_READ_PERMISSIONS,
      'leave_balances:read',
      'leave-balances.view',
      'leave_requests:read',
      // Attendance (read only)
      ...ATTENDANCE_READ_PERMISSIONS,
      'attendance_summaries:read',
      'attendance_processing:read',
      'attendance_device_sync_logs:read',
      // Shifts (read only — full structure for audit)
      'shifts:read',
      'shift_breaks:read',
      'shift_overtime_rules:read',
      'shift_attendance_rules:read',
      'shift_assignments:read',
      'shift_rotation_groups:read',
      'shift_rotation_rules:read',
      'shift_schedules:read',
      'shift_change_requests:read',
      'shift_templates:read',
      // Timetables (read only — full structure for audit)
      'timetables:read',
      'timetable_days:read',
      'timetable_shift_rules:read',
      'employee_timetables:read',
      'timetable_rotations:read',
      'timetable_rotation_rules:read',
      'timetable_holiday_rules:read',
      'timetable_attendance_rules:read',
      'timetable_generated_schedules:read',
      // Onboarding & offboarding (read only)
      'onboarding_workflows:read',
      'onboarding_requests:read',
      'onboarding_documents:read',
      'offboarding_workflows:read',
      'offboarding_requests:read',
      'offboarding_documents:read',
    ],
  },
];

export default class CompanyRolesSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const companyRepo = qr.manager.getRepository(Company);
      const roleRepo = qr.manager.getRepository(Role);
      const permissionRepo = qr.manager.getRepository(Permission);

      const companySlug = ALLIANCE_COMPANY_SLUG;
      const companyName =
        process.env.DEFAULT_COMPANY_NAME ?? ALLIANCE_COMPANY_NAME;
      const company = await companyRepo.findOne({
        where: { slug: companySlug },
      });
      if (!company) {
        throw new Error(
          `Company "${companyName}" not found. Run 004-company.seed.ts first.`,
        );
      }

      // Remove legacy roles that are being replaced
      const legacyRoleNames = [
        'OWNER',
        'ADMINISTRATOR',
        'USER',
        'VIEWER',
        'INTERN_TRAINEE',
        'HR_OFFICER', // will be re-created with correct permissions
        'IT_ADMINISTRATOR',
        'SENIOR_EMPLOYEE',
        'HR_MANAGER', // will be re-created with correct permissions
        'DEPARTMENT_MANAGER', // will be re-created with correct permissions
      ];
      const legacyRoles = await roleRepo.find({
        where: { company_id: company.id },
      });
      const toDelete = legacyRoles.filter(
        (r) =>
          legacyRoleNames.includes(r.name) &&
          !COMPANY_ROLE_SEEDS.find((s) => s.name === r.name),
      );
      if (toDelete.length > 0) {
        await roleRepo.remove(toDelete);
      }

      const allPermissionNames = [
        ...new Set(COMPANY_ROLE_SEEDS.flatMap((r) => r.permissionNames)),
      ];
      const permissions = await permissionRepo.find({
        where: { name: In(allPermissionNames) },
      });
      const permissionMap = new Map(permissions.map((p) => [p.name, p]));

      let createdCount = 0;
      for (const seed of COMPANY_ROLE_SEEDS) {
        const role = await roleRepo.findOne({
          where: { name: seed.name, company_id: company.id },
          relations: ['permissions'],
        });

        if (!role) {
          const newRole = roleRepo.create({
            name: seed.name,
            company_id: company.id,
            display_name: seed.displayName,
            description: seed.description,
            is_system_generated: true,
            permissions: Array.from(new Set(seed.permissionNames))
              .map((n) => permissionMap.get(n))
              .filter((p): p is Permission => p !== undefined),
          });
          await roleRepo.save(newRole);
          createdCount += 1;
        } else if (seed.name === 'HR_MANAGER' || seed.name === 'HR_OFFICER') {
          const have = new Set(
            (role.permissions ?? []).map((permission) => permission.name),
          );
          const missing = [
            'leave_requests:read',
            'leave_requests:update',
            'leave_requests:approve',
          ]
            .map((name) => permissionMap.get(name))
            .filter((permission): permission is Permission =>
              Boolean(permission && !have.has(permission.name)),
            );
          if (missing.length > 0) {
            role.permissions = [...(role.permissions ?? []), ...missing];
            await roleRepo.save(role);
          }
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][CompanyRoles] Created ${createdCount} new roles (${COMPANY_ROLE_SEEDS.length - createdCount} already existed, left unchanged) for company "${company.name}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][CompanyRoles] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
