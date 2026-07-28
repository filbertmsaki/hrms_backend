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
import PositionsSeeder from './010-positions.seed';

// Phase 4b — Department Employees (structured onboarding seed)
import ExecEmployeesSeeder from './027-exec-employees.seed';
import HrEmployeesSeeder from './028-hr-employees.seed';
import ItEmployeesSeeder from './029-it-employees.seed';
import ClaimsEmployeesSeeder from './030-claims-employees.seed';
import UnderwritingEmployeesSeeder from './031-underwriting-employees.seed';
import FinanceEmployeesSeeder from './032-finance-employees.seed';
import BancassuranceEmployeesSeeder from './033-bancassurance-employees.seed';
import AdministrationEmployeesSeeder from './034-administration-employees.seed';

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

// Phase 9 — Attendance Readiness
import EmployeeTimetablesSeeder from './025-employee-timetables.seed';
import EmployeeAccessCredentialsSeeder from './026-employee-access-credentials.seed';
import HolidaysSeeder from './035-holidays.seed';
import LeaveBalancesSeeder from './036-leave-balances.seed';
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
  // EmployeesSeeder,         // legacy Hikvision bulk import — replaced by per-dept seeders
  // EmployeeProfilesSeeder, // depends on EmployeesSeeder
  ExecEmployeesSeeder,
  HrEmployeesSeeder,
  ItEmployeesSeeder,
  ClaimsEmployeesSeeder,
  UnderwritingEmployeesSeeder,
  FinanceEmployeesSeeder,
  BancassuranceEmployeesSeeder,
  AdministrationEmployeesSeeder,
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
  EmployeeTimetablesSeeder,
  EmployeeAccessCredentialsSeeder,
  HolidaysSeeder,
  LeaveBalancesSeeder,
  DefaultAvatarsSeeder,
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
