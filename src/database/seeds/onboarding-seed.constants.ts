export const ONBOARDING_SEED_COMPANY_ID = 1;

export type OnboardingRoleHierarchySeed = {
  level: number;
  name: string;
  display_name: string;
  slug: string;
  description: string;
};

export type OnboardingRoleUserSeed = {
  role_name: string;
  user_no: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
};

/**
 * Onboarding workflow role hierarchy using the new standard roles.
 * Roles map to real system roles — no dedicated hierarchy-only roles needed.
 */
export const ONBOARDING_ROLE_HIERARCHY_SEEDS: OnboardingRoleHierarchySeed[] = [
  {
    level: 1,
    name: 'EMPLOYEE',
    display_name: 'Employee',
    slug: 'employee',
    description: 'Onboarding role hierarchy level 1 — standard employee entry.',
  },
  {
    level: 2,
    name: 'HR_OFFICER',
    display_name: 'HR Officer',
    slug: 'hr-officer',
    description:
      'Onboarding role hierarchy level 2 — HR document verification and record setup.',
  },
  {
    level: 3,
    name: 'DEPARTMENT_MANAGER',
    display_name: 'Department Manager',
    slug: 'department-manager',
    description:
      'Onboarding role hierarchy level 3 — department/IT setup approval and equipment provisioning.',
  },
  {
    level: 4,
    name: 'HR_MANAGER',
    display_name: 'HR Manager',
    slug: 'hr-manager',
    description:
      'Onboarding role hierarchy level 4 — final HR review, activation, and sign-off.',
  },
];

export const ONBOARDING_ROLE_USER_SEEDS: OnboardingRoleUserSeed[] = [
  {
    role_name: 'EMPLOYEE',
    user_no: 'ONB-USER-0001',
    first_name: 'Onboarding',
    last_name: 'Employee',
    email: 'onboarding_employee@seed.local',
    phone: '+255799000001',
  },
  {
    role_name: 'HR_OFFICER',
    user_no: 'ONB-USER-0002',
    first_name: 'Onboarding',
    last_name: 'HrOfficer',
    email: 'onboarding_hr_officer@seed.local',
    phone: '+255799000002',
  },
  {
    role_name: 'DEPARTMENT_MANAGER',
    user_no: 'ONB-USER-0003',
    first_name: 'Onboarding',
    last_name: 'DeptManager',
    email: 'onboarding_dept_manager@seed.local',
    phone: '+255799000003',
  },
  {
    role_name: 'HR_MANAGER',
    user_no: 'ONB-USER-0004',
    first_name: 'Onboarding',
    last_name: 'HrManager',
    email: 'onboarding_hr_manager@seed.local',
    phone: '+255799000004',
  },
];

export const STANDARD_ONBOARDING_WORKFLOW_NAME =
  'Standard Employee Onboarding Workflow';
