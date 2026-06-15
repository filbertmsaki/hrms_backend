import { DataSource } from 'typeorm';
import { runSeeders } from 'typeorm-extension';
import InitialRbacSeeder from './001-initial-rbac.seed';
import AllianceCompanyStructureSeeder from './002-alliance-company-structure.seed';
import LeaveManagementSeeder from './003-leave-management.seed';
import OnboardingRoleHierarchySeeder from './004-onboarding-role-hierarchy.seed';
import OnboardingCompanyUsersSeeder from './005-onboarding-company-users.seed';
import OnboardingWorkflowSeeder from './006-onboarding-workflow.seed';
import OnboardingWorkflowStepsSeeder from './007-onboarding-workflow-steps.seed';
import OffboardingWorkflowSeeder from './008-offboarding-workflow.seed';
import OffboardingWorkflowStepsSeeder from './009-offboarding-workflow-steps.seed';
import AccessControlDefaultsSeeder from './010-access-control-defaults.seed';
import AttendanceSampleDataSeeder from './011-attendance-sample-data.seed';
import HikvisionDeviceSeeder from './hikvision-device.seed';
// import CountriesSeeder from './002-countries.seed';
// import CategoriesSeeder from './003-categories.seed';
// ... import other seeders here

const seeders = [
  InitialRbacSeeder,
  AllianceCompanyStructureSeeder,
  LeaveManagementSeeder,
  OnboardingRoleHierarchySeeder,
  OnboardingCompanyUsersSeeder,
  OnboardingWorkflowSeeder,
  OnboardingWorkflowStepsSeeder,
  OffboardingWorkflowSeeder,
  OffboardingWorkflowStepsSeeder,
  HikvisionDeviceSeeder,
  AccessControlDefaultsSeeder,
  AttendanceSampleDataSeeder,
  // CountriesSeeder,
  // CategoriesSeeder,
  // Add new seeders here ↑
  // They will run in this exact order
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
    console.log('│     ✓ Database seeding completed successfully     │');
    console.log('└────────────────────────────────────────────┘');
  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  }
}
