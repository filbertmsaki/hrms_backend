import { DataSource, In } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { Permission } from '../../modules/permissions/entities/permission.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

type CompanyRoleSeed = {
  name: string;
  displayName: string;
  description: string;
  permissionNames: string[];
  hierarchyLevel?: number;
  hierarchySlug?: string;
};

const COMPANY_ROLE_SEEDS: CompanyRoleSeed[] = [
  {
    name: 'ADMINISTRATOR',
    displayName: 'Company Administrator',
    description: 'Administrator with full access limited to their own company',
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
      'Regular company user with access to view company data, manage their profile, and use HR self-service features',
    permissionNames: [
      'view_company_data',
      'users:update',
      'employees:read',
      'employees:update',
      'leave_requests:read',
      'leave_requests:create',
      'leave_requests:cancel',
      'leave_balances:read',
      'attendance_summaries:read',
      'attendance_mobile_punches:create',
      'shift_change_requests:read',
      'shift_change_requests:create',
    ],
  },
  {
    name: 'VIEWER',
    displayName: 'Viewer',
    description:
      'Compatibility role mirroring the default read-only company user access',
    permissionNames: ['view_company_data'],
  },
  {
    name: 'DEPARTMENT_MANAGER',
    displayName: 'Department Manager',
    description:
      'Non-HR department manager (Claims, Finance, Underwriting, Bancassurance, Operations, IT) with team management and approval capabilities, without HR lifecycle powers',
    permissionNames: [
      'view_company_data',
      'view_company_dashboard',
      'employees:read',
      'employees:update',
      'leave_requests:read',
      'leave_requests:create',
      'leave_requests:cancel',
      'leave_requests:approve',
      'leave_balances:read',
      'attendance_summaries:read',
      'attendance_mobile_punches:create',
      'shift_change_requests:read',
      'shift_change_requests:create',
      'shift_change_requests:update',
      'onboarding_requests:read',
      'onboarding_requests:approve',
      'onboarding_tasks:complete',
      'offboarding_requests:read',
      'offboarding_requests:approve',
      'offboarding_tasks:complete',
      'offboarding_tasks:reject',
    ],
  },
  // Onboarding/offboarding hierarchy roles
  {
    name: 'INTERN_TRAINEE',
    displayName: 'Intern / Trainee',
    description:
      '[level:1][slug:intern-trainee] Onboarding role hierarchy level 1 for interns and trainees.',
    permissionNames: [
      'view_company_data',
      'employees:read',
      'leave_requests:read',
      'leave_requests:create',
      'leave_requests:cancel',
      'leave_balances:read',
      'attendance_summaries:read',
      'attendance_mobile_punches:create',
    ],
    hierarchyLevel: 1,
    hierarchySlug: 'intern-trainee',
  },
  {
    name: 'HR_OFFICER',
    displayName: 'Junior Employee / HR Officer',
    description:
      '[level:2][slug:junior-employee-hr-officer] Onboarding role hierarchy level 2 for junior staff and HR document verification.',
    permissionNames: [
      'view_company_data',
      'employees:read',
      'leave_requests:read',
      'leave_requests:create',
      'leave_requests:cancel',
      'leave_balances:read',
      'attendance_summaries:read',
      'attendance_mobile_punches:create',
      'onboarding_requests:read',
      'onboarding_requests:approve',
      'onboarding_tasks:complete',
      'onboarding_documents:verify',
      'offboarding_requests:read',
      'offboarding_tasks:complete',
    ],
    hierarchyLevel: 2,
    hierarchySlug: 'junior-employee-hr-officer',
  },
  {
    name: 'IT_ADMINISTRATOR',
    displayName: 'Mid-Level Employee / IT Administrator',
    description:
      '[level:3][slug:mid-level-employee-it-admin] Onboarding role hierarchy level 3 for mid-level staff and IT setup approval.',
    permissionNames: [
      'view_company_data',
      'employees:read',
      'leave_requests:read',
      'leave_requests:create',
      'leave_requests:cancel',
      'leave_balances:read',
      'attendance_summaries:read',
      'attendance_mobile_punches:create',
      'onboarding_requests:read',
      'onboarding_requests:approve',
      'onboarding_tasks:complete',
      'offboarding_requests:read',
      'offboarding_tasks:complete',
      'employee_access_credentials:read',
      'employee_access_credentials:create',
      'employee_access_credentials:update',
      'employee_device_assignments:read',
    ],
    hierarchyLevel: 3,
    hierarchySlug: 'mid-level-employee-it-admin',
  },
  {
    name: 'SENIOR_EMPLOYEE',
    displayName: 'Senior Employee',
    description:
      '[level:4][slug:senior-employee] Onboarding role hierarchy level 4 for senior staff and security training recommendation.',
    permissionNames: [
      'view_company_data',
      'employees:read',
      'leave_requests:read',
      'leave_requests:create',
      'leave_requests:cancel',
      'leave_balances:read',
      'attendance_summaries:read',
      'attendance_mobile_punches:create',
      'onboarding_requests:read',
      'onboarding_requests:approve',
      'onboarding_tasks:complete',
    ],
    hierarchyLevel: 4,
    hierarchySlug: 'senior-employee',
  },
  {
    name: 'HR_MANAGER',
    displayName: 'Manager / Head of Department / HR Manager',
    description:
      '[level:5][slug:manager-head-of-department-hr-manager] Onboarding role hierarchy level 5 for managerial approvals and final HR activation.',
    permissionNames: [
      'view_company_data',
      'view_company_dashboard',
      'employees:read',
      'employees:update',
      'employees:change-status',
      'leave_requests:read',
      'leave_requests:create',
      'leave_requests:cancel',
      'leave_requests:approve',
      'leave_balances:read',
      'attendance_summaries:read',
      'attendance_mobile_punches:create',
      'onboarding_requests:read',
      'onboarding_requests:approve',
      'onboarding_requests:complete',
      'onboarding_tasks:complete',
      'onboarding_documents:verify',
      'offboarding_requests:read',
      'offboarding_requests:approve',
      'offboarding_requests:complete',
      'offboarding_tasks:complete',
      'offboarding_tasks:reject',
      'offboarding_clearances:complete',
    ],
    hierarchyLevel: 5,
    hierarchySlug: 'manager-head-of-department-hr-manager',
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
      const company = await companyRepo.findOne({ where: { slug: companySlug } });
      if (!company) {
        throw new Error(
          `Company "${companyName}" not found. Run 004-company.seed.ts first.`,
        );
      }

      const allPermissionNames = [
        ...new Set(COMPANY_ROLE_SEEDS.flatMap((r) => r.permissionNames)),
      ];
      const permissions = await permissionRepo.find({
        where: { name: In(allPermissionNames) },
      });
      const permissionMap = new Map(permissions.map((p) => [p.name, p]));

      for (const seed of COMPANY_ROLE_SEEDS) {
        let role = await roleRepo.findOne({
          where: { name: seed.name, company_id: company.id },
          relations: ['permissions'],
        });

        if (!role) {
          role = roleRepo.create({
            name: seed.name,
            company_id: company.id,
          });
        }

        role.display_name = seed.displayName;
        role.description = seed.description;
        role.is_system_generated = true;
        role.permissions = seed.permissionNames
          .map((n) => permissionMap.get(n))
          .filter((p): p is Permission => p !== undefined);

        await roleRepo.save(role);
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][CompanyRoles] Upserted ${COMPANY_ROLE_SEEDS.length} roles for company "${company.name}"`,
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
