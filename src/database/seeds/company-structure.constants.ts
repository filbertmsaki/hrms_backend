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
  hikvisionEmployeeNo: string;
  firstName: string;
  lastName: string;
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
    name: 'IT',
    code: 'IT',
    description:
      'Information technology, systems, infrastructure, and digital services.',
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
    description:
      'Provides administrative support for the company and branch offices.',
  },
  {
    name: 'Receptionist',
    code: 'RECEPTIONIST',
    category: 'Administration',
    level: 1,
    isManager: false,
    description:
      'Responsible for front desk, visitor reception, and administrative coordination.',
  },
  {
    name: 'Operations Manager',
    code: 'OPERATIONS_MANAGER',
    category: 'Administration',
    level: 3,
    isManager: true,
    description:
      'Oversees office operations and supports process efficiency across branches.',
  },
  {
    name: 'HR Officer',
    code: 'HR_OFFICER',
    category: 'HR',
    level: 1,
    isManager: false,
    description:
      'Supports employee lifecycle operations, onboarding, and HR administration.',
  },
  {
    name: 'HR Manager',
    code: 'HR_MANAGER',
    category: 'HR',
    level: 3,
    isManager: true,
    description:
      'Leads the HR function and drives employee engagement and development.',
  },
  {
    name: 'Talent Acquisition Officer',
    code: 'TALENT_ACQUISITION_OFFICER',
    category: 'HR',
    level: 2,
    isManager: false,
    description:
      'Manages hiring campaigns and candidate selection for the insurance business.',
  },
  {
    name: 'Accountant',
    code: 'ACCOUNTANT',
    category: 'Accounts',
    level: 1,
    isManager: false,
    description:
      'Maintains financial records and supports day-to-day accounting tasks.',
  },
  {
    name: 'Senior Accountant',
    code: 'SENIOR_ACCOUNTANT',
    category: 'Accounts',
    level: 2,
    isManager: false,
    description:
      'Delivers advanced accounting, reporting, and financial control support.',
  },
  {
    name: 'Finance Manager',
    code: 'FINANCE_MANAGER',
    category: 'Accounts',
    level: 3,
    isManager: true,
    description:
      'Leads financial planning, reporting, and cash management for the company.',
  },
  {
    name: 'Credit Controller',
    code: 'CREDIT_CONTROLLER',
    category: 'Accounts',
    level: 2,
    isManager: false,
    description:
      'Manages receivables, credit risk, and collection activity for insurance clients.',
  },
  {
    name: 'Claims Officer',
    code: 'CLAIMS_OFFICER',
    category: 'Claims',
    level: 1,
    isManager: false,
    description:
      'Handles first-line claims intake and customer communications.',
  },
  {
    name: 'Senior Claims Officer',
    code: 'SENIOR_CLAIMS_OFFICER',
    category: 'Claims',
    level: 2,
    isManager: false,
    description:
      'Manages complex claims and guides claims staff through resolution.',
  },
  {
    name: 'Claims Manager',
    code: 'CLAIMS_MANAGER',
    category: 'Claims',
    level: 3,
    isManager: true,
    description:
      'Oversees the claims team and ensures consistent claims handling.',
  },
  {
    name: 'Claims Investigator',
    code: 'CLAIMS_INVESTIGATOR',
    category: 'Claims',
    level: 2,
    isManager: false,
    description:
      'Investigates claim incidents and validates coverage before settlement.',
  },
  {
    name: 'Underwriter',
    code: 'UNDERWRITER',
    category: 'Underwriting',
    level: 1,
    isManager: false,
    description:
      'Evaluates risk and approves insurance applications for underwriting.',
  },
  {
    name: 'Senior Underwriter',
    code: 'SENIOR_UNDERWRITER',
    category: 'Underwriting',
    level: 2,
    isManager: false,
    description:
      'Reviews larger or more complex risks and mentors underwriting staff.',
  },
  {
    name: 'Underwriting Manager',
    code: 'UNDERWRITING_MANAGER',
    category: 'Underwriting',
    level: 3,
    isManager: true,
    description:
      'Leads underwriting operations and ensures disciplined risk selection.',
  },
  {
    name: 'Assistant Underwriting Manager',
    code: 'ASSISTANT_UNDERWRITING_MANAGER',
    category: 'Underwriting',
    level: 2,
    isManager: true,
    description:
      'Supports the Underwriting Manager in risk evaluation, policy review, and team coordination.',
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
    description:
      'Develops bancassurance relationships and supports partner sales.',
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
    description:
      'Identifies new business opportunities and builds insurance distribution channels.',
  },
  {
    name: 'Sales Agent',
    code: 'SALES_AGENT',
    category: 'General Business',
    level: 1,
    isManager: false,
    description:
      'Executes insurance sales and services customer relationships.',
  },
  {
    name: 'Marketing Officer',
    code: 'MARKETING_OFFICER',
    category: 'General Business',
    level: 1,
    isManager: false,
    description:
      'Supports marketing campaigns and brand engagement for insurance products.',
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
    description:
      'Provides executive leadership and strategic direction for Alliance Insurance.',
  },
  {
    name: 'General Manager',
    code: 'GENERAL_MANAGER',
    category: 'Executive',
    level: 4,
    isManager: true,
    description:
      'Drives overall business performance and cross-functional alignment.',
  },
  {
    name: 'Branch Manager',
    code: 'BRANCH_MANAGER',
    category: 'Executive',
    level: 3,
    isManager: true,
    description:
      'Leads the branch, ensures local targets are met, and manages branch operations.',
  },
  {
    name: 'IT Officer',
    code: 'IT_OFFICER',
    category: 'IT',
    level: 1,
    isManager: false,
    description:
      'Provides technical support, maintains systems, and supports IT operations.',
  },
  {
    name: 'Assistant IT Manager',
    code: 'ASSISTANT_IT_MANAGER',
    category: 'IT',
    level: 2,
    isManager: true,
    description:
      'Supports IT leadership, coordinates day-to-day operations, and supervises IT service delivery.',
  },
  {
    name: 'IT Manager',
    code: 'IT_MANAGER',
    category: 'IT',
    level: 3,
    isManager: true,
    description:
      'Leads IT operations, manages technology infrastructure, and oversees digital services.',
  },
  {
    name: 'IT Consultant',
    code: 'IT_CONSULTANT',
    category: 'IT',
    level: 4,
    isManager: true,
    description:
      'Provides strategic technology guidance and heads the IT department.',
  },
  {
    name: 'Systems Administrator',
    code: 'SYSTEMS_ADMINISTRATOR',
    category: 'IT',
    level: 2,
    isManager: false,
    description:
      'Manages server infrastructure, network systems, and system security.',
  },
  {
    name: 'Software Developer',
    code: 'SOFTWARE_DEVELOPER',
    category: 'IT',
    level: 2,
    isManager: false,
    description:
      'Develops and maintains software applications for insurance operations.',
  },
];

const ALLIANCE_CLAIMS_MANAGER_HIKVISION_EMPLOYEE_NO = '00000003';
const ALLIANCE_ADMIN_MANAGER_HIKVISION_EMPLOYEE_NO = '00000009';
const ALLIANCE_HR_MANAGER_HIKVISION_EMPLOYEE_NO = '00000059';
const ALLIANCE_IT_MANAGER_HIKVISION_EMPLOYEE_NO = '00000040';
const ALLIANCE_BANCASSURANCE_MANAGER_HIKVISION_EMPLOYEE_NO = '00000004';
// Deborah Londina Sarakikya — imported from Hikvision device, reassigned to Underwriting Manager
const ALLIANCE_UNDERWRITING_MANAGER_HIKVISION_EMPLOYEE_NO = '00000016';

const ALLIANCE_HIKVISION_EMPLOYEES: AllianceHikvisionEmployeeInput[] = [
  {
    hikvisionEmployeeNo: '00000001',
    fullName: 'Filbert Msaki',
    email: 'filbert@alliance.co.tz',
    roleNames: ['ADMINISTRATOR'],
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
    roleNames: ['USER'],
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
  { hikvisionEmployeeNo: '00000035', fullName: 'Baraka' },
  { hikvisionEmployeeNo: '00000036', fullName: 'Ibrahim Rashid Mungi' },
  { hikvisionEmployeeNo: '00000037', fullName: 'Ismail Mohamed Ramadhan' },
  // ── Underwriting department (imported from Hikvision device) ─────────────
  // Wardat Ahmed Hussein — Underwriting Assistant Manager (device no. 00000100)
  { hikvisionEmployeeNo: '00000100', fullName: 'Wardat Ahmed Hussein' },
  {
    hikvisionEmployeeNo: '00000040',
    fullName: 'Jasson Kalemera',
    email: 'jasson.kalemera@alliance.co.tz',
    roleNames: ['USER'],
  },
  {
    hikvisionEmployeeNo: '00000059',
    fullName: 'Vicky Msifwaki',
    email: 'msifwaki.vicky@alliance.co.tz',
    roleNames: ['USER'],
  },
  {
    hikvisionEmployeeNo: '00000094',
    fullName: 'Inocent Nuruva',
    email: 'inocent@alliance.co.tz',
    roleNames: ['ADMINISTRATOR'],
  },
  {
    hikvisionEmployeeNo: '00000108',
    fullName: 'Ravi Kumar',
    email: 'ravi.kumar@alliance.co.tz',
    roleNames: ['USER'],
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
      email: seed.email ?? buildAllianceEmployeeEmail(firstName, lastName),
      phone: buildAllianceEmployeePhone(seed.hikvisionEmployeeNo),
      positionCode: assignment.positionCode,
      primaryBranchCode: 'HQ',
      primaryDepartmentCode: assignment.primaryDepartmentCode,
      reportsToEmployeeNo: assignment.reportsToEmployeeNo,
      roleNames: seed.roleNames ?? ['USER'],
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
    'ADMIN',
    'OFFICE_ADMINISTRATOR',
    ALLIANCE_ADMIN_MANAGER_HIKVISION_EMPLOYEE_NO,
  );
  assign('00000009', 'ADMIN', 'OPERATIONS_MANAGER', null);

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

  assign(
    '00000004',
    'BANCASSURANCE',
    'BANCASSURANCE_RELATIONSHIP_MANAGER',
    null,
  );
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
  // Deborah Londina Sarakikya — reassigned from Claims; Underwriting Manager (Hikvision import)
  assign('00000016', 'UNDERWRITING', 'UNDERWRITING_MANAGER', null);
  // Wardat Ahmed Hussein — Underwriting Assistant Manager (Hikvision device 00000100)
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
    '00000035',
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
