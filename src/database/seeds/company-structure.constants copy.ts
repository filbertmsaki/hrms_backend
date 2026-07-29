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
  departmentCode: string;
  reportsToPositionCode?: string;
  level: number | null;
  isManager: boolean;
  headcount?: number;
  description: string;
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
  reportsToEmployeeNo: string | null; // null for top-level manager
  roleNames?: string[];
  permissionNames?: string[];
}

type AllianceHikvisionEmployeeInput = {
  hikvisionEmployeeNo: string;
  fullName: string;
  email?: string;
  roleNames?: string[];
  permissionNames?: string[];
};

type AllianceEmployeeAssignment = Pick<
  CompanyEmployeeSeed,
  'positionCode' | 'primaryDepartmentCode' | 'reportsToEmployeeNo'
>;

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

export const ALLIANCE_DEPARTMENTS: CompanyDepartmentSeed[] = [
  {
    name: 'Executive Management',
    code: 'EXEC',
    description: 'Top-level executive office: CEO, General Manager, and CFO.',
    branchCode: 'HQ',
  },
  {
    name: 'Administration',
    code: 'ADMINISTRATION',
    description: 'Corporate administration, facilities, and executive support.',
    branchCode: 'HQ',
  },
  {
    name: 'Human Resources',
    code: 'HR',
    description: 'Human resources, talent management, and employee services.',
    branchCode: 'HQ',
  },
  {
    name: 'Accounts & Finance',
    code: 'ACCOUNTS_FINANCE',
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
    description:
      'Bank distribution, partner management, and bancassurance sales.',
    branchCode: 'HQ',
  },
  {
    name: 'General Business',
    code: 'GENERAL_BUSINESS',
    description:
      'Sales, marketing, and customer service for general insurance business.',
    branchCode: 'HQ',
  },
  {
    name: 'Information Technology',
    code: 'IT',
    description:
      'Information technology, systems, infrastructure, and digital services.',
    branchCode: 'HQ',
  },
  {
    name: 'Digital Innovation and Marketing',
    code: 'DIGITAL_INNOVATION',
    description:
      'Digital transformation, innovation, digital marketing and online services.',
    branchCode: 'HQ',
  },
];

export const ALLIANCE_POSITIONS: CompanyPositionSeed[] = [
  {
    name: 'Chief Executive Officer',
    code: 'CEO',
    category: 'Executive',
    departmentCode: 'EXEC',
    reportsToPositionCode: undefined,
    level: 5,
    isManager: true,
    headcount: 1,
    description:
      'Provides executive leadership and strategic direction for Alliance Insurance.',
  },
  {
    name: 'General Manager',
    code: 'GENERAL_MANAGER',
    category: 'Executive',
    departmentCode: 'EXEC',
    reportsToPositionCode: 'CEO',
    level: 5,
    isManager: true,
    headcount: 1,
    description:
      'Drives overall business performance and cross-functional alignment.',
  },
  {
    name: 'Chief Financial Officer',
    code: 'CFO',
    category: 'Executive',
    departmentCode: 'EXEC',
    reportsToPositionCode: 'CEO',
    level: 5,
    isManager: true,
    headcount: 1,
    description:
      'Oversees all financial strategy, reporting, and treasury operations for the company.',
  },
  {
    name: 'Branch Manager',
    code: 'BRANCH_MANAGER',
    category: 'Executive',
    departmentCode: 'EXEC',
    reportsToPositionCode: 'GENERAL_MANAGER',
    level: 3,
    isManager: true,
    description:
      'Leads the branch, ensures local targets are met, and manages branch operations.',
  },
  {
    name: 'Administration Manager',
    code: 'ADMINISTRATION_MANAGER',
    category: 'Administration',
    departmentCode: 'ADMINISTRATION',
    reportsToPositionCode: 'GENERAL_MANAGER',
    level: 3,
    isManager: true,
    headcount: 1,
    description:
      'Leads administration, facilities management, and executive support services.',
  },
  {
    name: 'Assistant Administration Manager',
    code: 'ASST_ADMINISTRATION_MANAGER',
    category: 'Administration',
    departmentCode: 'ADMINISTRATION',
    reportsToPositionCode: 'ADMINISTRATION_MANAGER',
    level: 2,
    isManager: true,
    headcount: 1,
    description:
      'Supports the Administration Manager in facilities, logistics, and office operations.',
  },
  {
    name: 'Operations Manager',
    code: 'OPERATIONS_MANAGER',
    category: 'Administration',
    departmentCode: 'ADMINISTRATION',
    reportsToPositionCode: 'ADMINISTRATION_MANAGER',
    level: 3,
    isManager: true,
    description:
      'Oversees office operations and supports process efficiency across branches.',
  },
  {
    name: 'Office Administrator',
    code: 'OFFICE_ADMINISTRATOR',
    category: 'Administration',
    departmentCode: 'ADMINISTRATION',
    reportsToPositionCode: 'ASST_ADMINISTRATION_MANAGER',
    level: 1,
    isManager: false,
    description:
      'Provides administrative support for the company and branch offices.',
  },
  {
    name: 'Receptionist',
    code: 'RECEPTIONIST',
    category: 'Administration',
    departmentCode: 'ADMINISTRATION',
    reportsToPositionCode: 'ADMINISTRATION_MANAGER',
    level: 1,
    isManager: false,
    description:
      'Responsible for front desk, visitor reception, and administrative coordination.',
  },
  {
    name: 'HR Manager',
    code: 'HR_MANAGER',
    category: 'HR',
    departmentCode: 'HR',
    reportsToPositionCode: 'GENERAL_MANAGER',
    level: 3,
    isManager: true,
    headcount: 1,
    description:
      'Leads the HR function and drives employee engagement and development.',
  },
  {
    name: 'HR Officer',
    code: 'HR_OFFICER',
    category: 'HR',
    departmentCode: 'HR',
    reportsToPositionCode: 'HR_MANAGER',
    level: 1,
    isManager: false,
    description:
      'Supports employee lifecycle operations, onboarding, and HR administration.',
  },
  {
    name: 'Talent Acquisition Officer',
    code: 'TALENT_ACQUISITION_OFFICER',
    category: 'HR',
    departmentCode: 'HR',
    reportsToPositionCode: 'HR_MANAGER',
    level: 2,
    isManager: false,
    description:
      'Manages hiring campaigns and candidate selection for the insurance business.',
  },
  {
    name: 'Finance Manager',
    code: 'FINANCE_MANAGER',
    category: 'Accounts',
    departmentCode: 'ACCOUNTS_FINANCE',
    reportsToPositionCode: 'CFO',
    level: 3,
    isManager: true,
    headcount: 1,
    description:
      'Leads financial planning, reporting, and cash management for the company.',
  },
  {
    name: 'Assistant Finance Manager',
    code: 'ASSISTANT_FINANCE_MANAGER',
    category: 'Accounts',
    departmentCode: 'ACCOUNTS_FINANCE',
    reportsToPositionCode: 'FINANCE_MANAGER',
    level: 2,
    isManager: true,
    headcount: 1,
    description:
      'Supports the Finance Manager in financial control, reporting, and team coordination.',
  },
  {
    name: 'Senior Accountant',
    code: 'SENIOR_ACCOUNTANT',
    category: 'Accounts',
    departmentCode: 'ACCOUNTS_FINANCE',
    reportsToPositionCode: 'FINANCE_MANAGER',
    level: 2,
    isManager: false,
    description:
      'Delivers advanced accounting, reporting, and financial control support.',
  },
  {
    name: 'Accountant',
    code: 'ACCOUNTANT',
    category: 'Accounts',
    departmentCode: 'ACCOUNTS_FINANCE',
    reportsToPositionCode: 'ASSISTANT_FINANCE_MANAGER',
    level: 1,
    isManager: false,
    description:
      'Maintains financial records and supports day-to-day accounting tasks.',
  },
  {
    name: 'Credit Controller',
    code: 'CREDIT_CONTROLLER',
    category: 'Accounts',
    departmentCode: 'ACCOUNTS_FINANCE',
    reportsToPositionCode: 'FINANCE_MANAGER',
    level: 2,
    isManager: false,
    description:
      'Manages receivables, credit risk, and collection activity for insurance clients.',
  },
  {
    name: 'Claims Manager',
    code: 'CLAIMS_MANAGER',
    category: 'Claims',
    departmentCode: 'CLAIMS',
    reportsToPositionCode: 'GENERAL_MANAGER',
    level: 3,
    isManager: true,
    headcount: 1,
    description:
      'Oversees the claims team and ensures consistent claims handling.',
  },
  {
    name: 'Assistant Claims Manager',
    code: 'ASSISTANT_CLAIMS_MANAGER',
    category: 'Claims',
    departmentCode: 'CLAIMS',
    reportsToPositionCode: 'CLAIMS_MANAGER',
    level: 2,
    isManager: true,
    headcount: 1,
    description:
      'Supports the Claims Manager in team supervision, complex claims, and process oversight.',
  },
  {
    name: 'Senior Claims Officer',
    code: 'SENIOR_CLAIMS_OFFICER',
    category: 'Claims',
    departmentCode: 'CLAIMS',
    reportsToPositionCode: 'CLAIMS_MANAGER',
    level: 2,
    isManager: false,
    description:
      'Manages complex claims and guides claims staff through resolution.',
  },
  {
    name: 'Claims Officer',
    code: 'CLAIMS_OFFICER',
    category: 'Claims',
    departmentCode: 'CLAIMS',
    reportsToPositionCode: 'ASSISTANT_CLAIMS_MANAGER',
    level: 1,
    isManager: false,
    description:
      'Handles first-line claims intake and customer communications.',
  },
  {
    name: 'Claims Investigator',
    code: 'CLAIMS_INVESTIGATOR',
    category: 'Claims',
    departmentCode: 'CLAIMS',
    reportsToPositionCode: 'CLAIMS_MANAGER',
    level: 2,
    isManager: false,
    description:
      'Investigates claim incidents and validates coverage before settlement.',
  },
  // â”€â”€ Underwriting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    name: 'Underwriting Manager',
    code: 'UNDERWRITING_MANAGER',
    category: 'Underwriting',
    departmentCode: 'UNDERWRITING',
    reportsToPositionCode: 'GENERAL_MANAGER',
    level: 3,
    isManager: true,
    headcount: 1,
    description:
      'Leads underwriting operations and ensures disciplined risk selection.',
  },
  {
    name: 'Assistant Underwriting Manager',
    code: 'ASSISTANT_UNDERWRITING_MANAGER',
    category: 'Underwriting',
    departmentCode: 'UNDERWRITING',
    reportsToPositionCode: 'UNDERWRITING_MANAGER',
    level: 2,
    isManager: true,
    headcount: 1,
    description:
      'Supports the Underwriting Manager in risk evaluation, policy review, and team coordination.',
  },
  {
    name: 'Senior Underwriter',
    code: 'SENIOR_UNDERWRITER',
    category: 'Underwriting',
    departmentCode: 'UNDERWRITING',
    reportsToPositionCode: 'UNDERWRITING_MANAGER',
    level: 2,
    isManager: false,
    description:
      'Reviews larger or more complex risks and mentors underwriting staff.',
  },
  {
    name: 'Underwriter',
    code: 'UNDERWRITER',
    category: 'Underwriting',
    departmentCode: 'UNDERWRITING',
    reportsToPositionCode: 'ASSISTANT_UNDERWRITING_MANAGER',
    level: 1,
    isManager: false,
    description:
      'Evaluates risk and approves insurance applications for underwriting.',
  },
  {
    name: 'Risk Analyst',
    code: 'RISK_ANALYST',
    category: 'Underwriting',
    departmentCode: 'UNDERWRITING',
    reportsToPositionCode: 'UNDERWRITING_MANAGER',
    level: 2,
    isManager: false,
    description: 'Analyzes portfolio risk and supports underwriting decisions.',
  },
  // â”€â”€ Bancassurance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    name: 'Bancassurance Manager',
    code: 'BANCASSURANCE_MANAGER',
    category: 'Bancassurance',
    departmentCode: 'BANCASSURANCE',
    reportsToPositionCode: 'GENERAL_MANAGER',
    level: 3,
    isManager: true,
    headcount: 1,
    description: 'Manages bancassurance partnerships and relationship growth.',
  },
  {
    name: 'Assistant Bancassurance Manager',
    code: 'ASSISTANT_BANCASSURANCE_MANAGER',
    category: 'Bancassurance',
    departmentCode: 'BANCASSURANCE',
    reportsToPositionCode: 'BANCASSURANCE_MANAGER',
    level: 2,
    isManager: true,
    headcount: 1,
    description:
      'Supports the Bancassurance Manager in partner relations and team coordination.',
  },
  {
    name: 'Bancassurance Officer',
    code: 'BANCASSURANCE_OFFICER',
    category: 'Bancassurance',
    departmentCode: 'BANCASSURANCE',
    reportsToPositionCode: 'ASSISTANT_BANCASSURANCE_MANAGER',
    level: 1,
    isManager: false,
    description:
      'Develops bancassurance relationships and supports partner sales.',
  },
  {
    name: 'Business Development Officer',
    code: 'BUSINESS_DEVELOPMENT_OFFICER',
    category: 'General Business',
    departmentCode: 'GENERAL_BUSINESS',
    reportsToPositionCode: 'GENERAL_MANAGER',
    level: 1,
    isManager: false,
    description:
      'Identifies new business opportunities and builds insurance distribution channels.',
  },
  {
    name: 'Sales Agent',
    code: 'SALES_AGENT',
    category: 'General Business',
    departmentCode: 'GENERAL_BUSINESS',
    reportsToPositionCode: 'BUSINESS_DEVELOPMENT_OFFICER',
    level: 1,
    isManager: false,
    description:
      'Executes insurance sales and services customer relationships.',
  },
  {
    name: 'Marketing Officer',
    code: 'MARKETING_OFFICER',
    category: 'General Business',
    departmentCode: 'GENERAL_BUSINESS',
    reportsToPositionCode: 'GENERAL_MANAGER',
    level: 1,
    isManager: false,
    description:
      'Supports marketing campaigns and brand engagement for insurance products.',
  },
  {
    name: 'Customer Service Officer',
    code: 'CUSTOMER_SERVICE_OFFICER',
    category: 'General Business',
    departmentCode: 'GENERAL_BUSINESS',
    reportsToPositionCode: 'GENERAL_MANAGER',
    level: 1,
    isManager: false,
    description: 'Delivers customer support and service for policyholders.',
  },
  // â”€â”€ Information Technology â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    name: 'IT Manager',
    code: 'IT_MANAGER',
    category: 'IT',
    departmentCode: 'IT',
    reportsToPositionCode: 'GENERAL_MANAGER',
    level: 3,
    isManager: true,
    headcount: 1,
    description:
      'Leads IT operations, manages technology infrastructure, and oversees digital services.',
  },
  {
    name: 'Assistant IT Manager',
    code: 'ASSISTANT_IT_MANAGER',
    category: 'IT',
    departmentCode: 'IT',
    reportsToPositionCode: 'IT_MANAGER',
    level: 2,
    isManager: true,
    headcount: 1,
    description:
      'Supports IT leadership, coordinates day-to-day operations, and supervises IT service delivery.',
  },
  {
    name: 'Systems Administrator',
    code: 'SYSTEMS_ADMINISTRATOR',
    category: 'IT',
    departmentCode: 'IT',
    reportsToPositionCode: 'IT_MANAGER',
    level: 2,
    isManager: false,
    description:
      'Manages server infrastructure, network systems, and system security.',
  },
  {
    name: 'Software Developer',
    code: 'SOFTWARE_DEVELOPER',
    category: 'IT',
    departmentCode: 'IT',
    reportsToPositionCode: 'IT_MANAGER',
    level: 2,
    isManager: false,
    description:
      'Develops and maintains software applications for insurance operations.',
  },
  {
    name: 'IT Consultant',
    code: 'IT_CONSULTANT',
    category: 'IT',
    departmentCode: 'IT',
    reportsToPositionCode: 'IT_MANAGER',
    level: 2,
    isManager: false,
    description:
      'Provides strategic technology guidance and specialist advisory services.',
  },
  {
    name: 'IT Officer',
    code: 'IT_OFFICER',
    category: 'IT',
    departmentCode: 'IT',
    reportsToPositionCode: 'ASSISTANT_IT_MANAGER',
    level: 1,
    isManager: false,
    description:
      'Provides technical support, maintains systems, and supports IT operations.',
  },
];

const ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO = '00000003';
const ALLIANCE_ADMIN_MANAGER_HIKVISION_EMPLOYEE_NO = '00000009';
const ALLIANCE_HR_MANAGER_HIKVISION_EMPLOYEE_NO = '00000059';
const ALLIANCE_IT_MANAGER_HIKVISION_EMPLOYEE_NO = '00000040';
const ALLIANCE_BANCASSURANCE_MANAGER_HIKVISION_EMPLOYEE_NO = '00000004';
// Deborah Londina Sarakikya â€” imported from Hikvision device, reassigned to Underwriting Manager
const ALLIANCE_UNDERWRITING_MANAGER_HIKVISION_EMPLOYEE_NO = '00000016';

const ALLIANCE_HIKVISION_EMPLOYEES: AllianceHikvisionEmployeeInput[] = [
  {
    hikvisionEmployeeNo: '00000001',
    fullName: 'Filbert Msaki',
    email: 'filbert@alliance.co.tz',
    roleNames: ['COMPANY_ADMIN'],
  },
  { hikvisionEmployeeNo: '00000003', fullName: 'Agatha Godfrey Kiiza' },
  { hikvisionEmployeeNo: '00000004', fullName: 'Amina Gerard Manongi' },
  { hikvisionEmployeeNo: '00000005', fullName: 'Antoni Jordan Kambona' },
  { hikvisionEmployeeNo: '00000006', fullName: 'Asma Wahid Juma' },
  { hikvisionEmployeeNo: '00000007', fullName: 'Atuganile Asumile Mbapa' },
  { hikvisionEmployeeNo: '00000008', fullName: 'Augustino Filemon Kimashi' },
  { hikvisionEmployeeNo: '00000009', fullName: 'Avril Virginia Fernandes' },
  { hikvisionEmployeeNo: '00000010', fullName: 'Neema Justine' },
  { hikvisionEmployeeNo: '00000011', fullName: 'Barbara Thompson' },
  {
    hikvisionEmployeeNo: '00000012',
    fullName: 'Bosco Odilo Semiono',
    email: 'bossco.odillo@alliance.co.tz',
    roleNames: ['EMPLOYEE'],
  },
  { hikvisionEmployeeNo: '00000013', fullName: 'Brenda Raymond Mushi' },
  { hikvisionEmployeeNo: '00000014', fullName: 'Catherine Jackeline Aliwa' },
  { hikvisionEmployeeNo: '00000015', fullName: 'Dayness Jabir Mohamed' },
  { hikvisionEmployeeNo: '00000016', fullName: 'Deborah Londina Sarakikya' },
  { hikvisionEmployeeNo: '00000017', fullName: 'Deepa Manek' },
  { hikvisionEmployeeNo: '00000018', fullName: 'Destera Joshua Mlole' },
  { hikvisionEmployeeNo: '00000019', fullName: 'Dora Rhite Gadi' },
  { hikvisionEmployeeNo: '00000020', fullName: 'Elisa Ernest Tineishemo' },
  { hikvisionEmployeeNo: '00000021', fullName: 'Samira Masoud' },
  { hikvisionEmployeeNo: '00000022', fullName: 'Emmaculate Thadeus Minja' },
  { hikvisionEmployeeNo: '00000023', fullName: 'Emmy Eliezer Malekela' },
  { hikvisionEmployeeNo: '00000024', fullName: 'Erick Idrissa Mkwizu' },
  { hikvisionEmployeeNo: '00000025', fullName: 'Ester Vicent Kimario' },
  { hikvisionEmployeeNo: '00000026', fullName: 'Eugenia Atugonza Ndaro' },
  { hikvisionEmployeeNo: '00000027', fullName: 'Ezekiel Elia Kajiba' },
  { hikvisionEmployeeNo: '00000028', fullName: 'Gabriel Maya Kasunga' },
  { hikvisionEmployeeNo: '00000029', fullName: 'George Brown Sawala' },
  { hikvisionEmployeeNo: '00000030', fullName: 'Glory Gasper Uisso' },
  { hikvisionEmployeeNo: '00000031', fullName: 'Gwamaka Leonald Stambuli' },
  { hikvisionEmployeeNo: '00000032', fullName: 'Hassan Ally Hassan' },
  { hikvisionEmployeeNo: '00000033', fullName: 'Hawa Revocatus Nkorangowe' },
  { hikvisionEmployeeNo: '00000034', fullName: 'Henry Erasmo Mgalike' },
  { hikvisionEmployeeNo: '00000036', fullName: 'Ibrahim Rashid Mungi' },
  { hikvisionEmployeeNo: '00000037', fullName: 'Ismail Mohamed Ramadhan' },
  // â”€â”€ Underwriting department (imported from Hikvision device) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Wardat Ahmed Hussein â€” Underwriting Assistant Manager (device no. 00000100)
  { hikvisionEmployeeNo: '00000100', fullName: 'Wardat Ahmed Hussein' },
  {
    hikvisionEmployeeNo: '00000040',
    fullName: 'Jasson Kalemera',
    email: 'jasson.kalemera@alliance.co.tz',
    roleNames: ['EMPLOYEE'],
  },
  {
    hikvisionEmployeeNo: '00000059',
    fullName: 'Vicky Msifwaki',
    email: 'msifwaki.vicky@alliance.co.tz',
    roleNames: ['EMPLOYEE'],
  },
  {
    hikvisionEmployeeNo: '00000094',
    fullName: 'Inocent Nuruva',
    email: 'inocent@alliance.co.tz',
    roleNames: ['COMPANY_ADMIN'],
  },
  { hikvisionEmployeeNo: '00000038', fullName: 'Jackline Francis Nyangusy' },
  { hikvisionEmployeeNo: '00000039', fullName: 'Janki Sinha' },
  { hikvisionEmployeeNo: '00000041', fullName: 'Jastin Erick Laizer' },
  { hikvisionEmployeeNo: '00000043', fullName: 'Johnbosco Leonard Samba' },
  { hikvisionEmployeeNo: '00000044', fullName: 'Jonas Joseph Rutabingwa' },
  { hikvisionEmployeeNo: '00000045', fullName: 'Joy Menard Mdemeka' },
  { hikvisionEmployeeNo: '00000046', fullName: 'Judith Julius Barongo' },
  { hikvisionEmployeeNo: '00000047', fullName: 'Kausar Mehboob Doloo' },
  { hikvisionEmployeeNo: '00000048', fullName: 'Kelvin Brown Fifi' },
  { hikvisionEmployeeNo: '00000049', fullName: 'Kelvin Charles Ruhanga' },
  { hikvisionEmployeeNo: '00000050', fullName: 'Kiza Benjamin Aochi' },
  { hikvisionEmployeeNo: '00000052', fullName: 'Martha Ibrahim Wauda' },
  { hikvisionEmployeeNo: '00000053', fullName: 'Martin Jackson Hoka' },
  {
    hikvisionEmployeeNo: '00000054',
    fullName: 'MaryCatherine Leopold Ngakoka',
  },
  { hikvisionEmployeeNo: '00000055', fullName: 'Mchama Mohamed Mwinyimvua' },
  { hikvisionEmployeeNo: '00000056', fullName: 'Melina Epaphra Moshi' },
  { hikvisionEmployeeNo: '00000057', fullName: 'Mohamed Hassan Mlyande' },
  { hikvisionEmployeeNo: '00000058', fullName: 'Moses Benetson Mbeikya' },
  { hikvisionEmployeeNo: '00000060', fullName: 'Mussa Juma Mwanya' },
  { hikvisionEmployeeNo: '00000061', fullName: 'Mwaija Omar Rashid' },
  { hikvisionEmployeeNo: '00000062', fullName: 'Mwanaidi Anthon Omar' },
  { hikvisionEmployeeNo: '00000063', fullName: 'Neema Allan Andondile' },
  { hikvisionEmployeeNo: '00000064', fullName: 'Nicodemus Thomas  Robi' },
  { hikvisionEmployeeNo: '00000065', fullName: 'Norah Dick Mchaki' },
  { hikvisionEmployeeNo: '00000066', fullName: 'Obadia Naftal Kamboi' },
  { hikvisionEmployeeNo: '00000067', fullName: 'Oswald Ryan Tellis' },
  { hikvisionEmployeeNo: '00000068', fullName: 'Philly Filbert Msuha' },
  { hikvisionEmployeeNo: '00000069', fullName: 'Rahma Ally Salum' },
  { hikvisionEmployeeNo: '00000070', fullName: 'Ridhika Sandeep' },
  { hikvisionEmployeeNo: '00000071', fullName: 'Said Mubaraka' },
  { hikvisionEmployeeNo: '00000073', fullName: 'Sanjay Lakhan' },
  { hikvisionEmployeeNo: '00000074', fullName: 'Scholastica Protus Mmanda' },
  { hikvisionEmployeeNo: '00000076', fullName: 'Shoma Emmanuel Bulugu' },
  { hikvisionEmployeeNo: '00000077', fullName: 'Shukuru Said Onga' },
  { hikvisionEmployeeNo: '00000079', fullName: 'Sophia Shaban Mbisi' },
  { hikvisionEmployeeNo: '00000080', fullName: 'Tatheer Shiraz Kassamali' },
  { hikvisionEmployeeNo: '00000081', fullName: 'Thereza Makingi' },
  { hikvisionEmployeeNo: '00000082', fullName: 'Urusla Fantan Mtanda' },
  { hikvisionEmployeeNo: '00000083', fullName: 'Utaly Mohamed Utaly' },
  { hikvisionEmployeeNo: '00000084', fullName: 'Vicky Dias Mosha' },
  { hikvisionEmployeeNo: '00000087', fullName: 'Zabibu Said Aman' },
  { hikvisionEmployeeNo: '00000088', fullName: 'Zahara Athuman Mussa' },
  { hikvisionEmployeeNo: '00000091', fullName: 'Sifa Witness Juma' },
  { hikvisionEmployeeNo: '00000096', fullName: 'Issa golden' },
  { hikvisionEmployeeNo: '00000097', fullName: 'Elizabeth Ndaro' },
  { hikvisionEmployeeNo: '00000098', fullName: 'Luhende Bonda' },
  { hikvisionEmployeeNo: '00000099', fullName: 'Shamira Juma Sukka' },
  { hikvisionEmployeeNo: '00000103', fullName: 'Rajiv Kumar' },
  { hikvisionEmployeeNo: '00000104', fullName: 'Maria Temu' },
  { hikvisionEmployeeNo: '00000105', fullName: 'Witness Mwijage' },
  { hikvisionEmployeeNo: '00000106', fullName: 'Yusra Imran Mohamed' },
  { hikvisionEmployeeNo: '00000107', fullName: 'LIDYA JOHNBOSCO NGONYANI' },
  { hikvisionEmployeeNo: '00000109', fullName: 'JAYMAN HITEN CHOHAN' },
  { hikvisionEmployeeNo: '00000110', fullName: 'Veera Badra Swamy Banala' },
  { hikvisionEmployeeNo: '00000111', fullName: 'Emmanuel Kazungu' },
  { hikvisionEmployeeNo: '00000112', fullName: 'James Damian' },
  { hikvisionEmployeeNo: '00000113', fullName: 'Harshen Sajeev' },
  { hikvisionEmployeeNo: '00000114', fullName: 'Hussein Mpugusi' },
  { hikvisionEmployeeNo: '00000115', fullName: 'Fatuma Mussa Kitine' },
  { hikvisionEmployeeNo: '00000116', fullName: 'Janhvi Mokha' },
  { hikvisionEmployeeNo: '00000117', fullName: 'Prisha Davda' },
  { hikvisionEmployeeNo: '00000118', fullName: 'Hatibu Juma Nara' },
  { hikvisionEmployeeNo: '00000119', fullName: 'Abdallah Karama Abdallah' },
  { hikvisionEmployeeNo: '00000120', fullName: 'Poonam Chotai' },
  { hikvisionEmployeeNo: '00000125', fullName: 'Preenal Asher' },
  {
    hikvisionEmployeeNo: '00000108',
    fullName: 'Ravi Kumar',
    email: 'ravi.kumar@alliance.co.tz',
    roleNames: ['EMPLOYEE'],
  },
];

const ALLIANCE_EMPLOYEE_ASSIGNMENTS = buildAllianceEmployeeAssignments();

export const ALLIANCE_EMPLOYEES: CompanyEmployeeSeed[] =
  ALLIANCE_HIKVISION_EMPLOYEES.map((seed) => {
    const { firstName, lastName } = splitAllianceEmployeeName(seed.fullName);
    const employeeNo = seed.hikvisionEmployeeNo;
    const assignment = ALLIANCE_EMPLOYEE_ASSIGNMENTS[seed.hikvisionEmployeeNo];

    return {
      employeeNo,
      hikvisionEmployeeNo: seed.hikvisionEmployeeNo,
      firstName,
      lastName,
      gender: inferAllianceEmployeeGender(firstName),
      email: seed.email ?? buildAllianceEmployeeEmail(firstName, lastName),
      phone: buildAllianceEmployeePhone(seed.hikvisionEmployeeNo),
      positionCode: assignment.positionCode,
      primaryBranchCode: 'HQ',
      primaryDepartmentCode: assignment.primaryDepartmentCode,
      reportsToEmployeeNo: assignment.reportsToEmployeeNo,
      roleNames: seed.roleNames ?? ['EMPLOYEE'],
      permissionNames: seed.permissionNames,
    };
  });

function buildAllianceEmployeeAssignments(): Record<
  string,
  AllianceEmployeeAssignment
> {
  const assignments = new Map<string, AllianceEmployeeAssignment>();

  const assign = (
    hikvisionEmployeeNo: string,
    primaryDepartmentCode: string,
    positionCode: string,
    reportsToEmployeeNo: string | null,
  ) => {
    if (assignments.has(hikvisionEmployeeNo)) {
      throw new Error(
        `Duplicate department assignment for employee ${hikvisionEmployeeNo}`,
      );
    }

    assignments.set(hikvisionEmployeeNo, {
      primaryDepartmentCode,
      positionCode,
      reportsToEmployeeNo,
    });
  };

  assign(
    '00000007',
    'ADMINISTRATION',
    'OFFICE_ADMINISTRATOR',
    ALLIANCE_ADMIN_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign('00000009', 'ADMINISTRATION', 'OPERATIONS_MANAGER', null);

  assign('00000059', 'HR', 'HR_MANAGER', null);
  assign(
    '00000023',
    'HR',
    'HR_OFFICER',
    ALLIANCE_HR_MANAGER_HIKVISION_EMPLOYEE_NO,
  );

  assign(
    '00000001',
    'IT',
    'SYSTEMS_ADMINISTRATOR',
    ALLIANCE_IT_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000012',
    'IT',
    'IT_OFFICER',
    ALLIANCE_IT_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign('00000040', 'IT', 'IT_MANAGER', null);
  assign(
    '00000094',
    'IT',
    'SOFTWARE_DEVELOPER',
    ALLIANCE_IT_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000108',
    'IT',
    'IT_CONSULTANT',
    ALLIANCE_IT_MANAGER_HIKVISION_EMPLOYEE_NO,
  );

  assign('00000004', 'BANCASSURANCE', 'BANCASSURANCE_MANAGER', null);
  assign(
    '00000005',
    'BANCASSURANCE',
    'BANCASSURANCE_OFFICER',
    ALLIANCE_BANCASSURANCE_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000006',
    'BANCASSURANCE',
    'BANCASSURANCE_OFFICER',
    ALLIANCE_BANCASSURANCE_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000008',
    'BANCASSURANCE',
    'BANCASSURANCE_OFFICER',
    ALLIANCE_BANCASSURANCE_MANAGER_HIKVISION_EMPLOYEE_NO,
  );

  assign('00000003', 'CLAIMS', 'CLAIMS_MANAGER', null);
  assign(
    '00000010',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000011',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000013',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000014',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000015',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  // Deborah Londina Sarakikya â€” reassigned from Claims; Underwriting Manager (Hikvision import)
  assign('00000016', 'UNDERWRITING', 'UNDERWRITING_MANAGER', null);
  // Wardat Ahmed Hussein â€” Underwriting Assistant Manager (Hikvision device 00000100)
  assign(
    '00000100',
    'UNDERWRITING',
    'ASSISTANT_UNDERWRITING_MANAGER',
    ALLIANCE_UNDERWRITING_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000017',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000018',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000019',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000020',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000021',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000022',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000024',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000025',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000026',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000027',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000028',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000029',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000030',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000031',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000032',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000033',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000034',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000036',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign(
    '00000037',
    'CLAIMS',
    'CLAIMS_OFFICER',
    ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO,
  );

  assign('00000038', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000039', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000041', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000043', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000044', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000045', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000046', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000047', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000048', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000049', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000050', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000052', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000053', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000054', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000055', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000056', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000057', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000058', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000060', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000061', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000062', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000063', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000064', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000065', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000066', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000067', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000068', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000069', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000070', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000071', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000073', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000074', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000076', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000077', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000079', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000080', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000081', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000082', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000083', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000084', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000087', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000088', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000091', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000096', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000097', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000098', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000099', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000103', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000104', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000105', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000106', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000107', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000109', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000110', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000111', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000112', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000113', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000114', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000115', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000116', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000117', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000118', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000119', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000120', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');
  assign('00000125', 'CLAIMS', 'CLAIMS_OFFICER', '00000003');

  const allEmployeeNos = new Set(
    ALLIANCE_HIKVISION_EMPLOYEES.map(
      (employee) => employee.hikvisionEmployeeNo,
    ),
  );

  for (const employeeNo of allEmployeeNos) {
    if (!assignments.has(employeeNo)) {
      throw new Error(
        `Missing department assignment for employee ${employeeNo}`,
      );
    }
  }

  if (assignments.size !== allEmployeeNos.size) {
    throw new Error(
      `Employee assignment mismatch: expected ${allEmployeeNos.size}, got ${assignments.size}`,
    );
  }

  return Object.fromEntries(assignments);
}

function splitAllianceEmployeeName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length <= 1) {
    return {
      firstName: parts[0] ?? 'Employee',
      lastName: 'Alliance',
    };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function inferAllianceEmployeeGender(firstName: string): 'male' | 'female' {
  const normalized = firstName.trim().toLowerCase();
  const femaleFirstNames = new Set([
    'agatha',
    'amina',
    'asma',
    'atuganile',
    'avril',
    'barbara',
    'brenda',
    'catherine',
    'dayness',
    'deborah',
    'deepa',
    'destera',
    'dora',
    'elisa',
    'elizabeth',
    'emmaculate',
    'ester',
    'eugenia',
    'fatuma',
    'glory',
    'hawa',
    'jackline',
    'janhvi',
    'janki',
    'joy',
    'judith',
    'kausar',
    'lidya',
    'maria',
    'martha',
    'marycatherine',
    'melina',
    'mwaija',
    'mwanaidi',
    'neema',
    'norah',
    'poonam',
    'preenal',
    'prisha',
    'rahma',
    'ridhika',
    'samira',
    'scholastica',
    'shamira',
    'sifa',
    'sophia',
    'tatheer',
    'thereza',
    'urusla',
    'veera',
    'vicky',
    'wardat',
    'witness',
    'yusra',
    'zabibu',
    'zahara',
  ]);

  return femaleFirstNames.has(normalized) ? 'female' : 'male';
}

function buildAllianceEmployeeEmail(
  firstName: string,
  lastName: string,
): string {
  const first = slugifyAllianceSeedValue(firstName);
  const last = slugifyAllianceSeedValue(lastName).replace(/-/g, '.');

  if (!last) {
    return `${first}@alliance.co.tz`;
  }

  return `${first}.${last}@alliance.co.tz`;
}

function buildAllianceEmployeePhone(hikvisionEmployeeNo: string): string {
  const digits = hikvisionEmployeeNo.replace(/\D/g, '').padStart(8, '0');
  return `+25571${digits.slice(-7)}`;
}

function slugifyAllianceSeedValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
