export interface CompanyBranchSeed {
  name: string;
  code: string;
  city: string;
  country: string;
  status?: string;
}

export interface CompanyDepartmentSeed {
  name: string;
  code: string;
  description: string;
  branchCode: string;
}

export interface CompanyPositionSeed {
  name: string;
  code: string;
  category: string;
  reportsToPositionCode?: string;
  level: number | null;
  isManager: boolean;
  headcount?: number;
  description: string;
}

export interface CompanyDepartmentPositionSeed {
  departmentCode: string;
  positionCode: string;
}

export interface CompanyEmployeeSeed {
  employeeNo: string;
  hikvisionEmployeeNo: string;
  firstName: string;
  lastName: string;
  gender: 'male' | 'female';
  email: string;
  phone: string;
  positionCode: string;
  primaryBranchCode: string;
  primaryDepartmentCode: string;
  reportsToEmployeeNo: string | null;
  roleNames?: string[];
  permissionNames?: string[];
}

type ReusablePositionSeedDefinition = Omit<CompanyPositionSeed, 'description'>;

type BranchDepartmentStructureSeed = {
  branchCode: string;
  departments: Array<{
    code: string;
    name: string;
    description: string;
    positionCodes: string[];
  }>;
};

export const ALLIANCE_COMPANY_NAME = 'Alliance Insurance Corporation Limited';
export const ALLIANCE_COMPANY_SLUG = 'alliance-insurance';
export const ALLIANCE_COMPANY_METADATA = {
  industry: 'insurance',
  sector: 'financial_services',
  tenant: 'Alliance Insurance',
};

export const ALLIANCE_BRANCHES: CompanyBranchSeed[] = [
  {
    name: 'Head Office',
    code: 'HQ',
    city: 'Dar es Salaam',
    country: 'Tanzania',
    status: 'active',
  },
  {
    name: 'Arusha Branch',
    code: 'ARU',
    city: 'Arusha',
    country: 'Tanzania',
    status: 'active',
  },
  {
    name: 'Moshi Branch',
    code: 'MOS',
    city: 'Moshi',
    country: 'Tanzania',
    status: 'active',
  },
  {
    name: 'Mwanza Branch',
    code: 'MWZ',
    city: 'Mwanza',
    country: 'Tanzania',
    status: 'active',
  },
  {
    name: 'Zanzibar Branch',
    code: 'ZNZ',
    city: 'Zanzibar',
    country: 'Tanzania',
    status: 'active',
  },
];

const ALLIANCE_BRANCH_DEPARTMENT_STRUCTURE: BranchDepartmentStructureSeed[] = [
  {
    branchCode: 'HQ',
    departments: [
      {
        code: 'HQ_EXECUTIVE_MANAGEMENT',
        name: 'Executive Management',
        description: 'Executive leadership and strategic company direction.',
        positionCodes: [
          'GMD',
          'CEO',
          'CFO',
          'GENERAL_MANAGER',
          'ASSISTANT_GENERAL_MANAGER',
          'DEPUTY_GENERAL_MANAGER',
        ],
      },
      {
        code: 'HQ_ACCOUNTS_FINANCE',
        name: 'Accounts & Finance',
        description:
          'Financial operations, reporting, treasury, and actuarial support.',
        positionCodes: [
          'MANAGER',
          'DEPUTY_MANAGER',
          'ASSISTANT_MANAGER',
          'SENIOR_ACTUARIAL_ANALYST',
          'ACTUARIAL_OFFICER',
          'SENIOR_EXECUTIVE',
          'EXECUTIVE',
          'ACCOUNTS_ASSISTANT',
        ],
      },
      {
        code: 'HQ_CLAIMS',
        name: 'Claims',
        description:
          'Claims handling, settlement coordination, and service support.',
        positionCodes: [
          'ASSISTANT_BRANCH_MANAGER',
          'MANAGER',
          'DEPUTY_MANAGER',
          'ASSISTANT_MANAGER',
          'EXECUTIVE',
        ],
      },
      {
        code: 'HQ_UNDERWRITING',
        name: 'Underwriting',
        description:
          'Risk assessment, policy administration, and underwriting control.',
        positionCodes: [
          'SENIOR_MANAGER',
          'MANAGER',
          'SENIOR_DEPUTY_MANAGER',
          'DEPUTY_MANAGER',
          'ASSISTANT_MANAGER',
          'SENIOR_EXECUTIVE',
          'EXECUTIVE',
        ],
      },
      {
        code: 'HQ_BANCASSURANCE',
        name: 'Bancassurance',
        description:
          'Partner-channel growth, distribution management, and sales support.',
        positionCodes: [
          'HEAD_OF_DEPARTMENT',
          'MANAGER',
          'ASSISTANT_MANAGER',
          'SENIOR_EXECUTIVE',
          'EXECUTIVE',
        ],
      },
      {
        code: 'HQ_DIGITAL_INNOVATION_MARKETING',
        name: 'Digital Innovation & Marketing',
        description:
          'Digital transformation, innovation initiatives, and marketing.',
        positionCodes: ['HEAD_OF_DEPARTMENT'],
      },
      {
        code: 'HQ_HUMAN_RESOURCES',
        name: 'Human Resources',
        description:
          'People operations, workforce administration, and talent support.',
        positionCodes: ['DEPUTY_MANAGER', 'ASSISTANT_MANAGER'],
      },
      {
        code: 'HQ_INFORMATION_TECHNOLOGY',
        name: 'Information Technology',
        description:
          'Technology operations, systems support, and digital service delivery.',
        positionCodes: ['MANAGER', 'ASSISTANT_MANAGER', 'EXECUTIVE'],
      },
      {
        code: 'HQ_ADMINISTRATION',
        name: 'Administration',
        description:
          'Administrative support, facilities coordination, and office services.',
        positionCodes: [
          'MANAGER',
          'ASSISTANT_MANAGER',
          'EXECUTIVE_ASSISTANT',
          'PERSONAL_ASSISTANT',
          'FRONT_DESK_OFFICER',
          'OFFICE_ASSISTANT',
          'OFFICE_ATTENDANT',
          'MESSENGER',
          'EXECUTIVE_DRIVER',
          'DRIVER',
        ],
      },
    ],
  },
  {
    branchCode: 'ARU',
    departments: [
      {
        code: 'ARU_ACCOUNTS_FINANCE',
        name: 'Accounts & Finance',
        description: 'Branch accounting, reporting, and finance support.',
        positionCodes: [
          'DEPUTY_BRANCH_MANAGER',
          'ASSISTANT_MANAGER',
          'EXECUTIVE',
        ],
      },
      {
        code: 'ARU_CLAIMS',
        name: 'Claims',
        description: 'Branch claims intake and claims operations support.',
        positionCodes: ['MANAGER', 'ASSISTANT_MANAGER'],
      },
      {
        code: 'ARU_UNDERWRITING',
        name: 'Underwriting',
        description: 'Branch underwriting operations and risk review.',
        positionCodes: [
          'BRANCH_MANAGER',
          'DEPUTY_MANAGER',
          'SENIOR_EXECUTIVE',
          'EXECUTIVE',
        ],
      },
      {
        code: 'ARU_BANCASSURANCE',
        name: 'Bancassurance',
        description: 'Regional bancassurance leadership and partner support.',
        positionCodes: ['ZONAL_HEAD'],
      },
      {
        code: 'ARU_ADMINISTRATION',
        name: 'Administration',
        description: 'Branch administrative and office support services.',
        positionCodes: ['OFFICE_ASSISTANT'],
      },
    ],
  },
  {
    branchCode: 'MOS',
    departments: [
      {
        code: 'MOS_ACCOUNTS_FINANCE',
        name: 'Accounts & Finance',
        description: 'Branch accounting and finance support.',
        positionCodes: ['EXECUTIVE'],
      },
      {
        code: 'MOS_UNDERWRITING',
        name: 'Underwriting',
        description: 'Branch underwriting and risk administration.',
        positionCodes: ['DEPUTY_MANAGER', 'SENIOR_EXECUTIVE', 'EXECUTIVE'],
      },
      {
        code: 'MOS_ADMINISTRATION',
        name: 'Administration',
        description: 'Branch office administration and support.',
        positionCodes: ['ASSISTANT_BRANCH_MANAGER'],
      },
    ],
  },
  {
    branchCode: 'MWZ',
    departments: [
      {
        code: 'MWZ_BANCASSURANCE',
        name: 'Bancassurance',
        description: 'Branch bancassurance support operations.',
        positionCodes: ['EXECUTIVE'],
      },
      {
        code: 'MWZ_ADMINISTRATION',
        name: 'Administration',
        description: 'Branch administration support operations.',
        positionCodes: ['EXECUTIVE'],
      },
    ],
  },
];

export const ALLIANCE_DEPARTMENTS: CompanyDepartmentSeed[] =
  ALLIANCE_BRANCH_DEPARTMENT_STRUCTURE.flatMap((branch) =>
    branch.departments.map((department) => ({
      name: department.name,
      code: department.code,
      description: department.description,
      branchCode: branch.branchCode,
    })),
  );

const ALLIANCE_POSITION_MASTER_DEFINITIONS: ReusablePositionSeedDefinition[] = [
  {
    name: 'Group Managing Director',
    code: 'GMD',
    category: 'Executive Leadership',
    level: 15,
    isManager: true,
  },
  {
    name: 'Chief Executive Officer',
    code: 'CEO',
    category: 'Executive Leadership',
    reportsToPositionCode: 'GMD',
    level: 14,
    isManager: true,
  },
  {
    name: 'Chief Financial Officer',
    code: 'CFO',
    category: 'Executive Leadership',
    reportsToPositionCode: 'CEO',
    level: 14,
    isManager: true,
  },
  {
    name: 'General Manager',
    code: 'GENERAL_MANAGER',
    category: 'Executive Leadership',
    reportsToPositionCode: 'CEO',
    level: 13,
    isManager: true,
  },
  {
    name: 'Assistant General Manager',
    code: 'ASSISTANT_GENERAL_MANAGER',
    category: 'Executive Leadership',
    reportsToPositionCode: 'GENERAL_MANAGER',
    level: 12,
    isManager: true,
  },
  {
    name: 'Deputy General Manager',
    code: 'DEPUTY_GENERAL_MANAGER',
    category: 'Executive Leadership',
    reportsToPositionCode: 'GENERAL_MANAGER',
    level: 12,
    isManager: true,
  },
  {
    name: 'Head of Department',
    code: 'HEAD_OF_DEPARTMENT',
    category: 'Leadership',
    reportsToPositionCode: 'GENERAL_MANAGER',
    level: 11,
    isManager: true,
  },
  {
    name: 'Zonal Head',
    code: 'ZONAL_HEAD',
    category: 'Leadership',
    reportsToPositionCode: 'GENERAL_MANAGER',
    level: 11,
    isManager: true,
  },
  {
    name: 'Senior Manager',
    code: 'SENIOR_MANAGER',
    category: 'Leadership',
    reportsToPositionCode: 'HEAD_OF_DEPARTMENT',
    level: 10,
    isManager: true,
  },
  {
    name: 'Manager',
    code: 'MANAGER',
    category: 'Leadership',
    reportsToPositionCode: 'HEAD_OF_DEPARTMENT',
    level: 9,
    isManager: true,
  },
  {
    name: 'Senior Deputy Manager',
    code: 'SENIOR_DEPUTY_MANAGER',
    category: 'Leadership',
    reportsToPositionCode: 'SENIOR_MANAGER',
    level: 8,
    isManager: true,
  },
  {
    name: 'Deputy Manager',
    code: 'DEPUTY_MANAGER',
    category: 'Leadership',
    reportsToPositionCode: 'MANAGER',
    level: 8,
    isManager: true,
  },
  {
    name: 'Assistant Manager',
    code: 'ASSISTANT_MANAGER',
    category: 'Leadership',
    reportsToPositionCode: 'DEPUTY_MANAGER',
    level: 7,
    isManager: true,
  },
  {
    name: 'Branch Manager',
    code: 'BRANCH_MANAGER',
    category: 'Branch Leadership',
    reportsToPositionCode: 'ZONAL_HEAD',
    level: 10,
    isManager: true,
  },
  {
    name: 'Deputy Branch Manager',
    code: 'DEPUTY_BRANCH_MANAGER',
    category: 'Branch Leadership',
    reportsToPositionCode: 'BRANCH_MANAGER',
    level: 9,
    isManager: true,
  },
  {
    name: 'Assistant Branch Manager',
    code: 'ASSISTANT_BRANCH_MANAGER',
    category: 'Branch Leadership',
    reportsToPositionCode: 'DEPUTY_BRANCH_MANAGER',
    level: 8,
    isManager: true,
  },
  {
    name: 'Senior Actuarial Analyst',
    code: 'SENIOR_ACTUARIAL_ANALYST',
    category: 'Professional',
    reportsToPositionCode: 'MANAGER',
    level: 8,
    isManager: false,
  },
  {
    name: 'Actuarial Officer',
    code: 'ACTUARIAL_OFFICER',
    category: 'Professional',
    reportsToPositionCode: 'SENIOR_ACTUARIAL_ANALYST',
    level: 6,
    isManager: false,
  },
  {
    name: 'Senior Executive',
    code: 'SENIOR_EXECUTIVE',
    category: 'Professional',
    reportsToPositionCode: 'MANAGER',
    level: 8,
    isManager: false,
  },
  {
    name: 'Executive',
    code: 'EXECUTIVE',
    category: 'Professional',
    reportsToPositionCode: 'SENIOR_EXECUTIVE',
    level: 7,
    isManager: false,
  },
  {
    name: 'Accounts Assistant',
    code: 'ACCOUNTS_ASSISTANT',
    category: 'Support',
    reportsToPositionCode: 'EXECUTIVE',
    level: 6,
    isManager: false,
  },
  {
    name: 'Executive Assistant',
    code: 'EXECUTIVE_ASSISTANT',
    category: 'Administration and Support',
    reportsToPositionCode: 'CEO',
    level: 7,
    isManager: false,
  },
  {
    name: 'Personal Assistant',
    code: 'PERSONAL_ASSISTANT',
    category: 'Administration and Support',
    reportsToPositionCode: 'EXECUTIVE_ASSISTANT',
    level: 7,
    isManager: false,
  },
  {
    name: 'Front Desk Officer',
    code: 'FRONT_DESK_OFFICER',
    category: 'Administration and Support',
    reportsToPositionCode: 'ASSISTANT_MANAGER',
    level: 6,
    isManager: false,
  },
  {
    name: 'Office Assistant',
    code: 'OFFICE_ASSISTANT',
    category: 'Administration and Support',
    reportsToPositionCode: 'ASSISTANT_MANAGER',
    level: 5,
    isManager: false,
  },
  {
    name: 'Office Attendant',
    code: 'OFFICE_ATTENDANT',
    category: 'Administration and Support',
    reportsToPositionCode: 'OFFICE_ASSISTANT',
    level: 4,
    isManager: false,
  },
  {
    name: 'Messenger',
    code: 'MESSENGER',
    category: 'Administration and Support',
    reportsToPositionCode: 'OFFICE_ATTENDANT',
    level: 4,
    isManager: false,
  },
  {
    name: 'Executive Driver',
    code: 'EXECUTIVE_DRIVER',
    category: 'Administration and Support',
    reportsToPositionCode: 'CEO',
    level: 6,
    isManager: false,
  },
  {
    name: 'Driver',
    code: 'DRIVER',
    category: 'Administration and Support',
    reportsToPositionCode: 'EXECUTIVE_DRIVER',
    level: 5,
    isManager: false,
  },
];

export const ALLIANCE_POSITIONS: CompanyPositionSeed[] =
  ALLIANCE_POSITION_MASTER_DEFINITIONS.map((position) => ({
    ...position,
    description: `Reusable master position for ${position.name}.`,
  }));

export const ALLIANCE_DEPARTMENT_POSITIONS: CompanyDepartmentPositionSeed[] =
  ALLIANCE_BRANCH_DEPARTMENT_STRUCTURE.flatMap((branch) =>
    branch.departments.flatMap((department) =>
      department.positionCodes.map((positionCode) => ({
        departmentCode: department.code,
        positionCode,
      })),
    ),
  );

export const ALLIANCE_EMPLOYEES: CompanyEmployeeSeed[] = [];
