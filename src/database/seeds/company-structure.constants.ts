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
  level: number | null;
  isManager: boolean;
  description: string;
}

export interface CompanyEmployeeSeed {
  employeeNo: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  positionCode: string;
  primaryBranchCode: string;
  primaryDepartmentCode: string;
  reportsToEmployeeNo: string | null; // null for CEO/GM
  roleNames?: string[];
  permissionNames?: string[];
}

export const ALLIANCE_COMPANY_NAME = 'Alliance Insurance Corporation Ltd';
export const ALLIANCE_COMPANY_SLUG = 'alliance-insurance';
export const ALLIANCE_COMPANY_METADATA = {
  industry: 'insurance',
  sector: 'financial_services',
  tenant: 'Alliance Insurance',
};

export const ALLIANCE_BRANCHES: CompanyBranchSeed[] = [
  {
    name: 'HQ',
    code: 'HQ',
    city: 'Dar es Salaam',
    country: 'Tanzania',
    status: 'active',
  },
  {
    name: 'Arusha',
    code: 'ARU',
    city: 'Arusha',
    country: 'Tanzania',
    status: 'active',
  },
  {
    name: 'Moshi',
    code: 'MOS',
    city: 'Moshi',
    country: 'Tanzania',
    status: 'active',
  },
  {
    name: 'Mwanza',
    code: 'MWZ',
    city: 'Mwanza',
    country: 'Tanzania',
    status: 'active',
  },
  {
    name: 'Zanzibar',
    code: 'ZNZ',
    city: 'Zanzibar',
    country: 'Tanzania',
    status: 'active',
  },
];

export const ALLIANCE_DEPARTMENTS: CompanyDepartmentSeed[] = [
  {
    name: 'Admin',
    code: 'ADMIN',
    description: 'Corporate administration, facilities, and executive support.',
    branchCode: 'HQ',
  },
  {
    name: 'HR',
    code: 'HR',
    description: 'Human resources, talent management, and employee services.',
    branchCode: 'HQ',
  },
  {
    name: 'Accounts',
    code: 'ACCOUNTS',
    description: 'Financial accounting, reporting, and treasury operations.',
    branchCode: 'HQ',
  },
  {
    name: 'Claims',
    code: 'CLAIMS',
    description: 'Claims intake, investigation, adjudication, and settlement.',
    branchCode: 'HQ',
  },
  {
    name: 'Underwriting',
    code: 'UNDERWRITING',
    description: 'Risk evaluation, policy issuance, and underwriting analysis.',
    branchCode: 'HQ',
  },
  {
    name: 'Bancassurance',
    code: 'BANCASSURANCE',
    description: 'Bank distribution, partner management, and bancassurance sales.',
    branchCode: 'HQ',
  },
  {
    name: 'General Business',
    code: 'GENERAL_BUSINESS',
    description: 'Sales, marketing, and customer service for general insurance business.',
    branchCode: 'HQ',
  },
  {
    name: 'IT',
    code: 'IT',
    description: 'Information technology, systems, infrastructure, and digital services.',
    branchCode: 'HQ',
  },
];

export const ALLIANCE_POSITIONS: CompanyPositionSeed[] = [
  {
    name: 'Office Administrator',
    code: 'OFFICE_ADMINISTRATOR',
    category: 'Administration',
    level: 1,
    isManager: false,
    description: 'Provides administrative support for the company and branch offices.',
  },
  {
    name: 'Receptionist',
    code: 'RECEPTIONIST',
    category: 'Administration',
    level: 1,
    isManager: false,
    description: 'Responsible for front desk, visitor reception, and administrative coordination.',
  },
  {
    name: 'Operations Manager',
    code: 'OPERATIONS_MANAGER',
    category: 'Administration',
    level: 3,
    isManager: true,
    description: 'Oversees office operations and supports process efficiency across branches.',
  },
  {
    name: 'HR Officer',
    code: 'HR_OFFICER',
    category: 'HR',
    level: 1,
    isManager: false,
    description: 'Supports employee lifecycle operations, onboarding, and HR administration.',
  },
  {
    name: 'HR Manager',
    code: 'HR_MANAGER',
    category: 'HR',
    level: 3,
    isManager: true,
    description: 'Leads the HR function and drives employee engagement and development.',
  },
  {
    name: 'Talent Acquisition Officer',
    code: 'TALENT_ACQUISITION_OFFICER',
    category: 'HR',
    level: 2,
    isManager: false,
    description: 'Manages hiring campaigns and candidate selection for the insurance business.',
  },
  {
    name: 'Accountant',
    code: 'ACCOUNTANT',
    category: 'Accounts',
    level: 1,
    isManager: false,
    description: 'Maintains financial records and supports day-to-day accounting tasks.',
  },
  {
    name: 'Senior Accountant',
    code: 'SENIOR_ACCOUNTANT',
    category: 'Accounts',
    level: 2,
    isManager: false,
    description: 'Delivers advanced accounting, reporting, and financial control support.',
  },
  {
    name: 'Finance Manager',
    code: 'FINANCE_MANAGER',
    category: 'Accounts',
    level: 3,
    isManager: true,
    description: 'Leads financial planning, reporting, and cash management for the company.',
  },
  {
    name: 'Credit Controller',
    code: 'CREDIT_CONTROLLER',
    category: 'Accounts',
    level: 2,
    isManager: false,
    description: 'Manages receivables, credit risk, and collection activity for insurance clients.',
  },
  {
    name: 'Claims Officer',
    code: 'CLAIMS_OFFICER',
    category: 'Claims',
    level: 1,
    isManager: false,
    description: 'Handles first-line claims intake and customer communications.',
  },
  {
    name: 'Senior Claims Officer',
    code: 'SENIOR_CLAIMS_OFFICER',
    category: 'Claims',
    level: 2,
    isManager: false,
    description: 'Manages complex claims and guides claims staff through resolution.',
  },
  {
    name: 'Claims Manager',
    code: 'CLAIMS_MANAGER',
    category: 'Claims',
    level: 3,
    isManager: true,
    description: 'Oversees the claims team and ensures consistent claims handling.',
  },
  {
    name: 'Claims Investigator',
    code: 'CLAIMS_INVESTIGATOR',
    category: 'Claims',
    level: 2,
    isManager: false,
    description: 'Investigates claim incidents and validates coverage before settlement.',
  },
  {
    name: 'Underwriter',
    code: 'UNDERWRITER',
    category: 'Underwriting',
    level: 1,
    isManager: false,
    description: 'Evaluates risk and approves insurance applications for underwriting.',
  },
  {
    name: 'Senior Underwriter',
    code: 'SENIOR_UNDERWRITER',
    category: 'Underwriting',
    level: 2,
    isManager: false,
    description: 'Reviews larger or more complex risks and mentors underwriting staff.',
  },
  {
    name: 'Underwriting Manager',
    code: 'UNDERWRITING_MANAGER',
    category: 'Underwriting',
    level: 3,
    isManager: true,
    description: 'Leads underwriting operations and ensures disciplined risk selection.',
  },
  {
    name: 'Risk Analyst',
    code: 'RISK_ANALYST',
    category: 'Underwriting',
    level: 2,
    isManager: false,
    description: 'Analyzes portfolio risk and supports underwriting decisions.',
  },
  {
    name: 'Bancassurance Officer',
    code: 'BANCASSURANCE_OFFICER',
    category: 'Bancassurance',
    level: 1,
    isManager: false,
    description: 'Develops bancassurance relationships and supports partner sales.',
  },
  {
    name: 'Bancassurance Relationship Manager',
    code: 'BANCASSURANCE_RELATIONSHIP_MANAGER',
    category: 'Bancassurance',
    level: 3,
    isManager: true,
    description: 'Manages bancassurance partnerships and relationship growth.',
  },
  {
    name: 'Business Development Officer',
    code: 'BUSINESS_DEVELOPMENT_OFFICER',
    category: 'General Business',
    level: 1,
    isManager: false,
    description: 'Identifies new business opportunities and builds insurance distribution channels.',
  },
  {
    name: 'Sales Agent',
    code: 'SALES_AGENT',
    category: 'General Business',
    level: 1,
    isManager: false,
    description: 'Executes insurance sales and services customer relationships.',
  },
  {
    name: 'Marketing Officer',
    code: 'MARKETING_OFFICER',
    category: 'General Business',
    level: 1,
    isManager: false,
    description: 'Supports marketing campaigns and brand engagement for insurance products.',
  },
  {
    name: 'Customer Service Officer',
    code: 'CUSTOMER_SERVICE_OFFICER',
    category: 'General Business',
    level: 1,
    isManager: false,
    description: 'Delivers customer support and service for policyholders.',
  },
  {
    name: 'CEO',
    code: 'CEO',
    category: 'Executive',
    level: 4,
    isManager: true,
    description: 'Provides executive leadership and strategic direction for Alliance Insurance.',
  },
  {
    name: 'General Manager',
    code: 'GENERAL_MANAGER',
    category: 'Executive',
    level: 4,
    isManager: true,
    description: 'Drives overall business performance and cross-functional alignment.',
  },
  {
    name: 'Branch Manager',
    code: 'BRANCH_MANAGER',
    category: 'Executive',
    level: 3,
    isManager: true,
    description: 'Leads the branch, ensures local targets are met, and manages branch operations.',
  },
  {
    name: 'IT Officer',
    code: 'IT_OFFICER',
    category: 'IT',
    level: 1,
    isManager: false,
    description: 'Provides technical support, maintains systems, and supports IT operations.',
  },
  {
    name: 'IT Manager',
    code: 'IT_MANAGER',
    category: 'IT',
    level: 3,
    isManager: true,
    description: 'Leads IT operations, manages technology infrastructure, and oversees digital services.',
  },
  {
    name: 'Systems Administrator',
    code: 'SYSTEMS_ADMINISTRATOR',
    category: 'IT',
    level: 2,
    isManager: false,
    description: 'Manages server infrastructure, network systems, and system security.',
  },
  {
    name: 'Software Developer',
    code: 'SOFTWARE_DEVELOPER',
    category: 'IT',
    level: 2,
    isManager: false,
    description: 'Develops and maintains software applications for insurance operations.',
  },
];

export const ALLIANCE_EMPLOYEES: CompanyEmployeeSeed[] = [
  {
    employeeNo: 'AICL-0001',
    firstName: 'Abdul',
    lastName: 'Mwapela',
    email: 'abdul.mwapela@alliance.co.tz',
    phone: '+255700000010',
    positionCode: 'CEO',
    primaryBranchCode: 'HQ',
    primaryDepartmentCode: 'Admin',
    reportsToEmployeeNo: null,
    roleNames: ['ADMINISTRATOR'],
  },
  {
    employeeNo: 'AICL-0002',
    firstName: 'Grace',
    lastName: 'Mhina',
    email: 'grace.mhina@alliance.co.tz',
    phone: '+255700000020',
    positionCode: 'GENERAL_MANAGER',
    primaryBranchCode: 'HQ',
    primaryDepartmentCode: 'General Business',
    reportsToEmployeeNo: 'AICL-0001',
    roleNames: ['ADMINISTRATOR'],
  },
  {
    employeeNo: 'AICL-0003',
    firstName: 'Juma',
    lastName: 'Kilima',
    email: 'juma.kilima@alliance.co.tz',
    phone: '+255700000030',
    positionCode: 'HR_MANAGER',
    primaryBranchCode: 'HQ',
    primaryDepartmentCode: 'HR',
    reportsToEmployeeNo: 'AICL-0002',
    roleNames: ['USER'],
    permissionNames: [
      'employees:read',
      'employees:update',
      'departments:read',
      'positions:read',
      'designations:read',
      'onboarding_requests:read',
      'onboarding_requests:approve',
    ],
  },
  {
    employeeNo: 'AICL-0004',
    firstName: 'Asha',
    lastName: 'Mfaume',
    email: 'asha.mfaume@alliance.co.tz',
    phone: '+255700000040',
    positionCode: 'FINANCE_MANAGER',
    primaryBranchCode: 'HQ',
    primaryDepartmentCode: 'Accounts',
    reportsToEmployeeNo: 'AICL-0002',
    roleNames: ['USER'],
    permissionNames: [
      'view_company_dashboard',
      'leave_balances:read',
      'leave_requests:read',
    ],
  },
  {
    employeeNo: 'AICL-0005',
    firstName: 'Hamza',
    lastName: 'Salum',
    email: 'hamza.salum@alliance.co.tz',
    phone: '+255700000050',
    positionCode: 'CLAIMS_MANAGER',
    primaryBranchCode: 'HQ',
    primaryDepartmentCode: 'Claims',
    reportsToEmployeeNo: 'AICL-0002',
    roleNames: ['USER'],
    permissionNames: [
      'employees:read',
      'leave_requests:read',
      'attendance_holidays:read',
    ],
  },
  {
    employeeNo: 'AICL-0006',
    firstName: 'Mariam',
    lastName: 'Kassim',
    email: 'mariam.kassim@alliance.co.tz',
    phone: '+255700000060',
    positionCode: 'UNDERWRITING_MANAGER',
    primaryBranchCode: 'HQ',
    primaryDepartmentCode: 'Underwriting',
    reportsToEmployeeNo: 'AICL-0002',
    roleNames: ['USER'],
    permissionNames: [
      'employees:read',
      'leave_requests:read',
      'attendance_policies:read',
    ],
  },
  {
    employeeNo: 'AICL-0007',
    firstName: 'Salim',
    lastName: 'Omar',
    email: 'salim.omar@alliance.co.tz',
    phone: '+255700000070',
    positionCode: 'BANCASSURANCE_RELATIONSHIP_MANAGER',
    primaryBranchCode: 'HQ',
    primaryDepartmentCode: 'Bancassurance',
    reportsToEmployeeNo: 'AICL-0002',
    roleNames: ['USER'],
    permissionNames: [
      'employees:read',
      'leave_requests:read',
      'attendance_policies:read',
    ],
  },
  {
    employeeNo: 'AICL-0008',
    firstName: 'Neema',
    lastName: 'John',
    email: 'neema.john@alliance.co.tz',
    phone: '+255700000080',
    positionCode: 'IT_MANAGER',
    primaryBranchCode: 'HQ',
    primaryDepartmentCode: 'IT',
    reportsToEmployeeNo: 'AICL-0002',
    roleNames: ['USER'],
    permissionNames: [
      'employees:read',
      'attendance_devices:read',
      'attendance_checkpoints:read',
      'attendance_device_sync_logs:read',
    ],
  },
  {
    employeeNo: 'AICL-0009',
    firstName: 'Emmanuel',
    lastName: 'Lema',
    email: 'emmanuel.lema@alliance.co.tz',
    phone: '+255700000090',
    positionCode: 'OPERATIONS_MANAGER',
    primaryBranchCode: 'HQ',
    primaryDepartmentCode: 'Admin',
    reportsToEmployeeNo: 'AICL-0001',
    roleNames: ['USER'],
    permissionNames: [
      'employees:read',
      'departments:read',
      'positions:read',
      'attendance_settings:read',
    ],
  },
  {
    employeeNo: 'AICL-0010',
    firstName: 'Amina',
    lastName: 'Hassan',
    email: 'amina.hassan@alliance.co.tz',
    phone: '+255700000100',
    positionCode: 'BRANCH_MANAGER',
    primaryBranchCode: 'Arusha',
    primaryDepartmentCode: 'General Business',
    reportsToEmployeeNo: 'AICL-0002',
    roleNames: ['USER'],
    permissionNames: [
      'employees:read',
      'leave_requests:read',
      'attendance_holidays:read',
    ],
  },
  {
    employeeNo: 'AICL-0011',
    firstName: 'Baraka',
    lastName: 'Moshi',
    email: 'baraka.moshi@alliance.co.tz',
    phone: '+255700000110',
    positionCode: 'BRANCH_MANAGER',
    primaryBranchCode: 'Moshi',
    primaryDepartmentCode: 'General Business',
    reportsToEmployeeNo: 'AICL-0002',
    roleNames: ['USER'],
    permissionNames: [
      'employees:read',
      'leave_requests:read',
      'attendance_holidays:read',
    ],
  },
  {
    employeeNo: 'AICL-0012',
    firstName: 'Diana',
    lastName: 'Mwanza',
    email: 'diana.mwanza@alliance.co.tz',
    phone: '+255700000120',
    positionCode: 'BRANCH_MANAGER',
    primaryBranchCode: 'Mwanza',
    primaryDepartmentCode: 'General Business',
    reportsToEmployeeNo: 'AICL-0002',
    roleNames: ['USER'],
    permissionNames: [
      'employees:read',
      'leave_requests:read',
      'attendance_holidays:read',
    ],
  },
  {
    employeeNo: 'AICL-0013',
    firstName: 'Fatma',
    lastName: 'Abdallah',
    email: 'fatma.abdallah@alliance.co.tz',
    phone: '+255700000130',
    positionCode: 'BRANCH_MANAGER',
    primaryBranchCode: 'Zanzibar',
    primaryDepartmentCode: 'General Business',
    reportsToEmployeeNo: 'AICL-0002',
    roleNames: ['USER'],
    permissionNames: [
      'employees:read',
      'leave_requests:read',
      'attendance_holidays:read',
    ],
  },
];
