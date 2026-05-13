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

export const ONBOARDING_ROLE_HIERARCHY_SEEDS: OnboardingRoleHierarchySeed[] = [
  {
    level: 1,
    name: 'INTERN_TRAINEE',
    display_name: 'Intern / Trainee',
    slug: 'intern-trainee',
    description:
      'Onboarding role hierarchy level 1 for interns and trainees.',
  },
  {
    level: 2,
    name: 'HR_OFFICER',
    display_name: 'Junior Employee / HR Officer',
    slug: 'junior-employee-hr-officer',
    description:
      'Onboarding role hierarchy level 2 for junior staff and HR document verification.',
  },
  {
    level: 3,
    name: 'IT_ADMINISTRATOR',
    display_name: 'Mid-Level Employee / IT Administrator',
    slug: 'mid-level-employee-it-admin',
    description:
      'Onboarding role hierarchy level 3 for mid-level staff and IT setup approval.',
  },
  {
    level: 4,
    name: 'SENIOR_EMPLOYEE',
    display_name: 'Senior Employee',
    slug: 'senior-employee',
    description:
      'Onboarding role hierarchy level 4 for senior staff and security training recommendation.',
  },
  {
    level: 5,
    name: 'HR_MANAGER',
    display_name: 'Manager / Head of Department / HR Manager',
    slug: 'manager-head-of-department-hr-manager',
    description:
      'Onboarding role hierarchy level 5 for managerial approvals and final HR activation.',
  },
];

export const ONBOARDING_ROLE_USER_SEEDS: OnboardingRoleUserSeed[] = [
  {
    role_name: 'INTERN_TRAINEE',
    user_no: 'ONB-USER-0001',
    first_name: 'Intern',
    last_name: 'User',
    email: 'intern_user@seed.local',
    phone: '+255799000001',
  },
  {
    role_name: 'HR_OFFICER',
    user_no: 'ONB-USER-0002',
    first_name: 'Junior',
    last_name: 'User',
    email: 'junior_user@seed.local',
    phone: '+255799000002',
  },
  {
    role_name: 'IT_ADMINISTRATOR',
    user_no: 'ONB-USER-0003',
    first_name: 'Mid',
    last_name: 'User',
    email: 'mid_user@seed.local',
    phone: '+255799000003',
  },
  {
    role_name: 'SENIOR_EMPLOYEE',
    user_no: 'ONB-USER-0004',
    first_name: 'Senior',
    last_name: 'User',
    email: 'senior_user@seed.local',
    phone: '+255799000004',
  },
  {
    role_name: 'HR_MANAGER',
    user_no: 'ONB-USER-0005',
    first_name: 'Manager',
    last_name: 'User',
    email: 'manager_user@seed.local',
    phone: '+255799000005',
  },
];

export const STANDARD_ONBOARDING_WORKFLOW_NAME =
  'Standard Employee Onboarding Workflow';
