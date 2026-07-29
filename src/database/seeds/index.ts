import { DataSource } from 'typeorm';
import { runSeeders } from 'typeorm-extension';

// Phase 1 - Platform Defaults
import PermissionsSeeder from './001-permissions.seed';
import GlobalRolesSeeder from './002-global-roles.seed';
import PlatformUsersSeeder from './003-platform-users.seed';

// Phase 2 - Company Setup
import CompanySeeder from './004-company.seed';
import CompanyRolesSeeder from './005-company-roles.seed';
import CompanyAdminSeeder from './006-company-admin.seed';

// Phase 3 - Organizational Structure
import BranchesSeeder from './007-branches.seed';
import DepartmentsSeeder from './008-departments.seed';
import DepartmentPositionMappingsSeeder from './009-department-position-mappings.seed';
import PositionsSeeder from './010-positions.seed';

// Phase 4 - HRMS Configuration
import LeaveTypesSeeder from './013-leave-types.seed';
import LeavePoliciesSeeder from './014-leave-policies.seed';
import LeaveWorkflowsSeeder from './015-leave-workflows.seed';

// Phase 5 - Shifts and Attendance
import ShiftsSeeder from './016-shifts.seed';
import TimetablesSeeder from './017-timetables.seed';
import ShiftAssignmentsSeeder from './018-shift-assignments.seed';

// Phase 6 - HR Workflow Templates
import OnboardingWorkflowSeeder from './019-onboarding-workflow.seed';
import OffboardingWorkflowSeeder from './020-offboarding-workflow.seed';

// Phase 7 - Access Control
import AttendanceDevicesSeeder from './021-attendance-devices.seed';
import AccessOrganizationsSeeder from './022-access-organizations.seed';
import AccessGroupsSeeder from './023-access-groups.seed';

// Phase 8 - Calendar and Assets
import HolidaysSeeder from './035-holidays.seed';
import DefaultAvatarsSeeder from './037-default-avatars.seed';

const seeders = [
  PermissionsSeeder,
  GlobalRolesSeeder,
  PlatformUsersSeeder,
  CompanySeeder,
  CompanyRolesSeeder,
  CompanyAdminSeeder,
  BranchesSeeder,
  DepartmentsSeeder,
  PositionsSeeder,
  DepartmentPositionMappingsSeeder,
  LeaveTypesSeeder,
  LeavePoliciesSeeder,
  LeaveWorkflowsSeeder,
  ShiftsSeeder,
  TimetablesSeeder,
  ShiftAssignmentsSeeder,
  OnboardingWorkflowSeeder,
  OffboardingWorkflowSeeder,
  AttendanceDevicesSeeder,
  AccessOrganizationsSeeder,
  AccessGroupsSeeder,
  HolidaysSeeder,
  DefaultAvatarsSeeder,
];

export async function runAllSeeders(dataSource: DataSource): Promise<void> {
  console.log('Starting database seeding');

  try {
    await runSeeders(dataSource, {
      seeds: seeders,
    });

    console.log('Database seeding completed successfully');
  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  }
}
