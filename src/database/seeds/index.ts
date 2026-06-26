import { DataSource } from 'typeorm';
import { runSeeders } from 'typeorm-extension';

// Phase 1 — Platform Defaults
import PermissionsSeeder from './001-permissions.seed';
import GlobalRolesSeeder from './002-global-roles.seed';
import PlatformUsersSeeder from './003-platform-users.seed';

// Phase 2 — Company Setup
import CompanySeeder from './004-company.seed';
import CompanyRolesSeeder from './005-company-roles.seed';
import CompanyAdminSeeder from './006-company-admin.seed';

// Phase 3 — Organizational Structure
import BranchesSeeder from './007-branches.seed';
import DepartmentsSeeder from './008-departments.seed';
import DesignationsSeeder from './009-designations.seed';
import PositionsSeeder from './010-positions.seed';

// Phase 4 — Employees
import EmployeesSeeder from './011-employees.seed';
import EmployeeProfilesSeeder from './012-employee-profiles.seed';

// Phase 5 — HRMS Configuration
import LeaveTypesSeeder from './013-leave-types.seed';
import LeavePoliciesSeeder from './014-leave-policies.seed';
import LeaveWorkflowsSeeder from './015-leave-workflows.seed';

// Phase 6 — Shifts & Attendance
import ShiftsSeeder from './016-shifts.seed';
import TimetablesSeeder from './017-timetables.seed';
import ShiftAssignmentsSeeder from './018-shift-assignments.seed';

// Phase 7 — HR Workflow Templates
import OnboardingWorkflowSeeder from './019-onboarding-workflow.seed';
import OffboardingWorkflowSeeder from './020-offboarding-workflow.seed';

// Phase 8 — Access Control
import AttendanceDevicesSeeder from './021-attendance-devices.seed';
import AccessOrganizationsSeeder from './022-access-organizations.seed';
import AccessGroupsSeeder from './023-access-groups.seed';
import EmployeeDeviceAssignmentsSeeder from './024-employee-device-assignments.seed';

const seeders = [
  PermissionsSeeder,
  GlobalRolesSeeder,
  PlatformUsersSeeder,
  CompanySeeder,
  CompanyRolesSeeder,
  CompanyAdminSeeder,
  BranchesSeeder,
  DepartmentsSeeder,
  DesignationsSeeder,
  PositionsSeeder,
  EmployeesSeeder,
  EmployeeProfilesSeeder,
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
  EmployeeDeviceAssignmentsSeeder,
];

export async function runAllSeeders(dataSource: DataSource): Promise<void> {
  console.log('┌────────────────────────────────────────────┐');
  console.log('│          Starting database seeding         │');
  console.log('└────────────────────────────────────────────┘');

  try {
    await runSeeders(dataSource, {
      seeds: seeders,
    });

    console.log('\n┌────────────────────────────────────────────┐');
    console.log('│   ✓ Database seeding completed successfully │');
    console.log('└────────────────────────────────────────────┘');
  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  }
}
