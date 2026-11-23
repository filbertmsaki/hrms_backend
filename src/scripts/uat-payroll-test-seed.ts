/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await --
   Operator-run UAT fixture script: raw SQL rows are untyped and the
   notification stubs are intentionally no-op async functions. */
/**
 * UAT payroll test fixture (company 1). Creates ONLY clearly marked,
 * fictional test records; never modifies existing employees or users.
 *
 * Markers: employee_no UAT-PAY-00x, emails *@hrms-uat.test, user_no UAT-*,
 * cost centre / calendar / group / product code UAT-TEST*.
 * Idempotent: re-running reuses existing test records.
 *
 * Run (from backend/, .env pointing at UAT):
 *   TS_NODE_TRANSPILE_ONLY=1 npx ts-node -r tsconfig-paths/register \
 *     scripts/uat-payroll-test-seed.ts --apply
 * Without --apply it only prints the plan (no writes).
 * Undo: scripts/uat-payroll-test-undo.ts
 *
 * Passwords are generated and written to ../frontend/.env.local only.
 */
import 'reflect-metadata';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../database/data-source';
import { hashPassword } from '../common/utils/hash.util';
import { User } from '../modules/users/entities/user.entity';
import { CompanyUser } from '../modules/companies/entities/company-user.entity';
import { Employee } from '../modules/hr/employees/entities/employee.entity';
import { EmployeeBankAccount } from '../modules/hr/employees/entities/employee-bank-account.entity';
import { EmploymentStatusEnum } from '../modules/hr/employees/enums/employment-status.enum';
import { EmployeeConfirmationStatusEnum } from '../modules/hr/employees/enums/employee-confirmation-status.enum';
import { CostCenter } from '../modules/hr/cost-centers/entities/cost-center.entity';
import {
  PayrollCalendar,
  PayrollGroup,
  PayrollGroupAssignment,
  PayrollPeriod,
} from '../modules/hr/payroll/entities/payroll-configuration.entities';
import { EmployeePayrollProfile } from '../modules/hr/payroll/entities/employee-payroll-profile.entity';
import {
  EmployeeCompensationVersion,
  EmployeeCompensationVersionStatusEnum,
} from '../modules/hr/employee-movements/entities/employee-compensation-version.entity';
import { AttendanceDailySummary } from '../modules/hr/attendance/processing/entities/attendance-daily-summary.entity';
import { EmployeePayrollResult } from '../modules/hr/payroll/entities/payroll-run.entities';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import type { HrAccessService } from '../modules/hr/shared/hr-access.service';
import {
  EmployeeFinanceApplication,
  EmployeeFinanceApplicationApproval,
  EmployeeFinanceApplicationDocument,
  EmployeeFinanceApplicationGuarantor,
  EmployeeFinanceSanctionLetter,
} from '../modules/hr/employee-finance/entities/employee-finance-application.entities';
import {
  EmployeeFinanceAccount,
  EmployeeFinanceAuditLog,
  EmployeeFinanceDefermentRequest,
  EmployeeFinanceDisbursement,
  EmployeeFinanceInstallment,
  EmployeeFinanceLedgerEntry,
  EmployeeFinanceRepayment,
  EmployeeFinanceReschedule,
  EmployeeFinanceSettlementQuote,
} from '../modules/hr/employee-finance/entities/employee-finance-account.entities';
import {
  EmployeeFinanceProduct,
  EmployeeFinanceProductApplicability,
} from '../modules/hr/employee-finance/entities/employee-finance-product.entities';
import {
  EmployeeFinanceAccountService,
  EmployeeFinanceApplicationService,
  EmployeeFinanceApprovalService,
  EmployeeFinanceAuditService,
  EmployeeFinanceDisbursementService,
  EmployeeFinanceEligibilityService,
  EmployeeFinanceInterestService,
  EmployeeFinanceLedgerService,
  EmployeeFinanceProductService,
} from '../modules/hr/employee-finance/services/employee-finance-core.services';
import { EmployeeFinanceApprovalStageEnum } from '../modules/hr/employee-finance/employee-finance.enums';

const COMPANY_ID = 1;
const EMAIL_DOMAIN = 'hrms-uat.test';
const PERIOD = { year: 2026, month: 12 };
const APPLY = process.argv.includes('--apply');

type Persona = {
  key: 'ADMIN' | 'HR' | 'FINANCE' | 'MANAGEMENT' | 'EMPLOYEE' | 'GUARANTOR';
  first: string;
  last: string;
  roles: string[];
  employee?: 'UAT-PAY-001' | 'UAT-PAY-003';
};

// Fictional people. ADMIN prepares payroll; HR/FINANCE/MANAGEMENT approve.
// MANAGEMENT gets COMPANY_ADMIN because the MANAGEMENT role has no payroll
// approval permission on UAT (reported as a configuration gap).
const PERSONAS: Persona[] = [
  {
    key: 'ADMIN',
    first: 'Test',
    last: 'Payroll Preparer',
    roles: ['COMPANY_ADMIN'],
  },
  { key: 'HR', first: 'Test', last: 'HR Approver', roles: ['HR_MANAGER'] },
  {
    key: 'FINANCE',
    first: 'Test',
    last: 'Finance Approver',
    roles: ['FINANCE'],
  },
  {
    key: 'MANAGEMENT',
    first: 'Test',
    last: 'Management Approver',
    roles: ['MANAGEMENT', 'COMPANY_ADMIN'],
  },
  {
    key: 'EMPLOYEE',
    first: 'Asha',
    last: 'Testmwema',
    roles: ['EMPLOYEE'],
    employee: 'UAT-PAY-001',
  },
  {
    key: 'GUARANTOR',
    first: 'Neema',
    last: 'Testkweli',
    roles: ['EMPLOYEE'],
    employee: 'UAT-PAY-003',
  },
];

const EMPLOYEES = [
  {
    no: 'UAT-PAY-001',
    first: 'Asha',
    last: 'Testmwema',
    gender: 'female',
    salary: '1500000.00',
    bank: '0000000001',
  },
  {
    no: 'UAT-PAY-002',
    first: 'Baraka',
    last: 'Testjuma',
    gender: 'male',
    salary: '900000.00',
    bank: '0000000002',
  },
  {
    no: 'UAT-PAY-003',
    first: 'Neema',
    last: 'Testkweli',
    gender: 'female',
    salary: '450000.00',
    bank: '0000000003',
  },
] as const;

const log = (...args: unknown[]) => console.log('[uat-seed]', ...args);
const pad = (value: number) => String(value).padStart(2, '0');
const iso = (date: Date) => date.toISOString().slice(0, 10);

class SeedConfig {
  private readonly values = new Map<string, unknown>([
    ['EMPLOYEE_FINANCE_MAX_ACTIVE_APPLICATIONS', 1],
    ['EMPLOYEE_FINANCE_REQUIRE_MANAGER_RECOMMENDATION', true],
    ['EMPLOYEE_FINANCE_REQUIRE_HR_APPROVAL', true],
    ['EMPLOYEE_FINANCE_REQUIRE_FINANCE_APPROVAL', true],
    ['EMPLOYEE_FINANCE_DEFAULT_REPAYMENT_DAY', 28],
    ['EMPLOYEE_FINANCE_MAX_INSTALLMENT_PERCENT_OF_NET_PAY', 35],
  ]);
  get<T>(key: string, fallback?: T): T {
    return (
      this.values.has(key)
        ? this.values.get(key)
        : (process.env[key] ?? fallback)
    ) as T;
  }
}

function writeEnvLocal(values: Record<string, string>) {
  const path = resolve(
    process.env.UAT_SEED_CREDENTIALS_FILE ??
      resolve(process.cwd(), 'uat-payroll-test.credentials.env'),
  );
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const kept = existing
    .split(/\r?\n/)
    .filter(
      (line) =>
        line && !Object.keys(values).some((key) => line.startsWith(`${key}=`)),
    );
  writeFileSync(
    path,
    [
      ...kept,
      ...Object.entries(values).map(([key, value]) => `${key}=${value}`),
    ].join('\n') + '\n',
    { encoding: 'utf8', mode: 0o600 },
  );
  return path;
}

async function main() {
  const options = AppDataSource.options as { database?: string; host?: string };
  const rehearsal = process.env.UAT_SEED_REHEARSAL_DB;
  if (
    options.database !== 'hrms_uat_db' &&
    !(
      rehearsal &&
      options.database === rehearsal &&
      rehearsal.startsWith('hrms_uat_rehearsal')
    )
  ) {
    throw new Error(
      `Refusing to run against ${options.host}/${options.database}; UAT only.`,
    );
  }
  const ds: DataSource = await AppDataSource.initialize();
  try {
    const company = await ds.query(
      `SELECT id, name FROM companies WHERE id = $1`,
      [COMPANY_ID],
    );
    if (!company.length) throw new Error('Company 1 not found.');
    log(
      'target',
      options.host,
      options.database,
      'company',
      company[0].name,
      APPLY ? 'APPLY' : 'PLAN ONLY',
    );

    const existingTestEmployees = await ds.query(
      `SELECT employee_no FROM employees WHERE company_id = $1 AND employee_no LIKE 'UAT-PAY-%'`,
      [COMPANY_ID],
    );
    const existingTestUsers = await ds.query(
      `SELECT email FROM users WHERE email LIKE $1`,
      [`%@${EMAIL_DOMAIN}`],
    );
    log(
      'existing test employees',
      existingTestEmployees.length,
      'existing test users',
      existingTestUsers.length,
    );
    log('plan', {
      users: PERSONAS.map((p) => `${p.key}:${p.roles.join('+')}`),
      employees: EMPLOYEES.map((e) => `${e.no} salary ${e.salary}`),
      calendar: 'UAT-TEST (separate from MAIN)',
      period: `${PERIOD.year}-${pad(PERIOD.month)}`,
      loan: 'STAFF_LOAN_STD 600,000 / 3 months for UAT-PAY-001, guarantor UAT-PAY-003',
      rules: 'approve DRAFT PAYE/NSSF/SDL/WCF (UAT only)',
    });
    if (!APPLY) return;

    // ---------- identity ----------
    const template = (
      await ds.query(
        `SELECT u.account_provisioning_status, u.is_email_verified FROM users u
         JOIN company_users cu ON cu.user_id = u.id WHERE cu.id = 3`,
      )
    )[0] ?? { account_provisioning_status: null, is_email_verified: true };
    const roleRows: Array<{ id: number; name: string }> = await ds.query(
      `SELECT id, name FROM roles WHERE company_id = $1`,
      [COMPANY_ID],
    );
    const roleId = (name: string) => {
      const role = roleRows.find((row) => row.name === name);
      if (!role)
        throw new Error(`Role ${name} missing in company ${COMPANY_ID}.`);
      return role.id;
    };
    const users = ds.getRepository(User);
    const memberships = ds.getRepository(CompanyUser);
    const passwords: Record<string, string> = {};
    const membership: Record<
      string,
      { userId: number; companyUserId: number; email: string }
    > = {};

    for (const persona of PERSONAS) {
      const email = `uat.payroll.${persona.key.toLowerCase()}@${EMAIL_DOMAIN}`;
      let user = await users.findOne({ where: { email } });
      if (!user) {
        const password = `Uat!${randomBytes(12).toString('base64url')}9a`;
        passwords[persona.key] = password;
        user = await users.save(
          users.create({
            user_no: `UAT-${persona.key}`.slice(0, 20),
            first_name: persona.first,
            last_name: persona.last,
            phone: `+25500000000${PERSONAS.indexOf(persona)}`,
            email,
            password: await hashPassword(password),
            status: 'active',
            user_type: 'COMPANY_USER',
            is_email_verified: true,
            must_set_password: false,
            account_provisioning_status: template.account_provisioning_status,
            auth_token_version: 1,
          } as Partial<User>),
        );
        log('created user', persona.key);
      }
      let member = await memberships.findOne({
        where: { company_id: COMPANY_ID, user_id: user.id },
      });
      if (!member) {
        member = await memberships.save(
          memberships.create({
            company_id: COMPANY_ID,
            user_id: user.id,
            status: 'active',
            is_default: true,
          }),
        );
      }
      for (const role of persona.roles) {
        await ds.query(
          `INSERT INTO company_user_roles (company_user_id, role_id)
           SELECT $1, $2 WHERE NOT EXISTS (
             SELECT 1 FROM company_user_roles WHERE company_user_id = $1 AND role_id = $2)`,
          [member.id, roleId(role)],
        );
      }
      membership[persona.key] = {
        userId: user.id,
        companyUserId: member.id,
        email,
      };
    }

    // ---------- HR records ----------
    const costCenters = ds.getRepository(CostCenter);
    const costCenter =
      (await costCenters.findOne({
        where: { company_id: COMPANY_ID, code: 'UAT-TEST' },
      })) ??
      (await costCenters.save(
        costCenters.create({
          company_id: COMPANY_ID,
          code: 'UAT-TEST',
          name: 'UAT payroll test',
          status: 'active',
        }),
      ));

    const employees = ds.getRepository(Employee);
    const banks = ds.getRepository(EmployeeBankAccount);
    const profiles = ds.getRepository(EmployeePayrollProfile);
    const compensations = ds.getRepository(EmployeeCompensationVersion);
    const employeeIds: Record<string, number> = {};
    const adminMember = membership.ADMIN.companyUserId;

    for (const [index, spec] of EMPLOYEES.entries()) {
      const persona = PERSONAS.find((p) => p.employee === spec.no);
      let employee = await employees.findOne({
        where: { company_id: COMPANY_ID, employee_no: spec.no },
      });
      if (!employee) {
        employee = await employees.save(
          employees.create({
            company_id: COMPANY_ID,
            company_user_id: persona
              ? membership[persona.key].companyUserId
              : null,
            employee_no: spec.no,
            first_name: spec.first,
            last_name: spec.last,
            gender: spec.gender,
            employment_status: EmploymentStatusEnum.ACTIVE,
            hire_date: '2025-03-01',
            confirmation_status: EmployeeConfirmationStatusEnum.CONFIRMED,
            cost_center_id: costCenter.id,
            primary_branch_id: 1,
          } as Partial<Employee>),
        );
        log('created employee', spec.no);
      }
      employeeIds[spec.no] = employee.id;

      let bank = await banks.findOne({
        where: { employee_id: employee.id, is_primary: true },
      });
      if (!bank) {
        bank = await banks.save(
          banks.create({
            employee_id: employee.id,
            bank_name: 'UAT TEST BANK (fictional)',
            account_name: `${spec.first} ${spec.last}`,
            account_number: spec.bank,
            bank_code: 'UATTEST',
            bank_branch_code: '000',
            account_currency: 'TZS',
            verification_status: 'VERIFIED',
            verified_at: new Date(),
            verified_by_company_user_id: adminMember,
            is_primary: true,
          }),
        );
      }

      if (
        !(await profiles.findOne({
          where: { companyId: COMPANY_ID, employeeId: employee.id },
        }))
      ) {
        await profiles.save(
          profiles.create({
            companyId: COMPANY_ID,
            employeeId: employee.id,
            payrollNumber: spec.no,
            taxpayerIdentificationNumber: `999-000-00${index + 1}`,
            socialSecuritySchemeCode: 'NSSF',
            socialSecurityNumber: `UATTEST00${index + 1}`,
            primaryBankAccountId: bank.id,
            currency: 'TZS',
            payFrequency: 'MONTHLY',
            payrollEnabled: true,
            payrollHold: false,
            effectiveFrom: '2026-07-01',
          } as Partial<EmployeePayrollProfile>),
        );
      }

      if (
        !(await compensations.findOne({
          where: { companyId: COMPANY_ID, employeeId: employee.id },
        }))
      ) {
        await compensations.save(
          compensations.create({
            companyId: COMPANY_ID,
            employeeId: employee.id,
            movementId: null,
            baseSalary: spec.salary,
            currency: 'TZS',
            salaryStructureCode: null,
            payFrequency: 'MONTHLY',
            effectiveFrom: '2025-03-01',
            effectiveTo: null,
            status: EmployeeCompensationVersionStatusEnum.ACTIVE,
            revisionReference: 'UAT-PAYROLL-TEST',
            justification: 'Fictional UAT payroll test salary',
            approvedByCompanyUserId: membership.HR.companyUserId,
            createdByCompanyUserId: adminMember,
            payrollSyncStatus: 'READY',
          } as Partial<EmployeeCompensationVersion>),
        );
      }
    }

    // ---------- payroll setup ----------
    const calendars = ds.getRepository(PayrollCalendar);
    const calendar =
      (await calendars.findOne({
        where: { companyId: COMPANY_ID, code: 'UAT-TEST' },
      })) ??
      (await calendars.save(
        calendars.create({
          companyId: COMPANY_ID,
          code: 'UAT-TEST',
          name: 'UAT payroll test calendar',
          frequency: 'MONTHLY',
          cutoffDay: 20,
          paymentDay: 28,
          timezone: 'Africa/Dar_es_Salaam',
        } as Partial<PayrollCalendar>),
      ));
    const groups = ds.getRepository(PayrollGroup);
    const group =
      (await groups.findOne({
        where: { companyId: COMPANY_ID, code: 'UAT-TEST' },
      })) ??
      (await groups.save(
        groups.create({
          companyId: COMPANY_ID,
          code: 'UAT-TEST',
          name: 'UAT payroll test group',
          frequency: 'MONTHLY',
          payrollCalendarId: calendar.id,
          currency: 'TZS',
          status: 'ACTIVE',
        } as Partial<PayrollGroup>),
      ));
    const assignments = ds.getRepository(PayrollGroupAssignment);
    for (const id of Object.values(employeeIds)) {
      if (
        !(await assignments.findOne({
          where: { payrollGroupId: group.id, employeeId: id },
        }))
      ) {
        await assignments.save(
          assignments.create({
            companyId: COMPANY_ID,
            payrollGroupId: group.id,
            employeeId: id,
            effectiveFrom: '2026-07-01',
            status: 'ACTIVE',
          } as Partial<PayrollGroupAssignment>),
        );
      }
    }

    const start = new Date(Date.UTC(PERIOD.year, PERIOD.month - 1, 1));
    const end = new Date(Date.UTC(PERIOD.year, PERIOD.month, 0));
    const periods = ds.getRepository(PayrollPeriod);
    const periodCode = `UAT-TEST-${PERIOD.year}${pad(PERIOD.month)}`;
    const period =
      (await periods.findOne({
        where: { companyId: COMPANY_ID, periodCode },
      })) ??
      (await periods.save(
        periods.create({
          companyId: COMPANY_ID,
          payrollCalendarId: calendar.id,
          periodCode,
          periodYear: PERIOD.year,
          periodMonth: PERIOD.month,
          startDate: iso(start),
          endDate: iso(end),
          cutoffDate: `${PERIOD.year}-${pad(PERIOD.month)}-20`,
          paymentDate: `${PERIOD.year}-${pad(PERIOD.month)}-28`,
          status: 'OPEN',
        } as Partial<PayrollPeriod>),
      ));

    // Finalized attendance for the test employees only: weekdays present,
    // weekends off.
    const attendance = ds.getRepository(AttendanceDailySummary);
    let attendanceRows = 0;
    for (const id of Object.values(employeeIds)) {
      for (
        let day = new Date(start);
        day <= end;
        day.setUTCDate(day.getUTCDate() + 1)
      ) {
        const date = iso(day);
        if (
          await attendance.findOne({
            where: { employeeId: id, attendanceDate: date } as never,
          })
        )
          continue;
        const weekend = [0, 6].includes(day.getUTCDay());
        await attendance.save(
          attendance.create({
            companyId: COMPANY_ID,
            branchId: 1,
            employeeId: id,
            attendanceDate: date,
            scheduleSource: 'UAT-TEST',
            timezone: 'Africa/Dar_es_Salaam',
            scheduleStartAt: weekend ? null : new Date(`${date}T05:00:00.000Z`),
            scheduleEndAt: weekend ? null : new Date(`${date}T14:00:00.000Z`),
            checkInAt: weekend ? null : new Date(`${date}T05:00:00.000Z`),
            checkOutAt: weekend ? null : new Date(`${date}T14:00:00.000Z`),
            lateMinutes: 0,
            earlyDepartureMinutes: 0,
            workMinutes: weekend ? 0 : 480,
            breakMinutes: weekend ? 0 : 60,
            overtimeMinutes: 0,
            attendanceStatus: weekend ? 'OFF_DAY' : 'PRESENT',
            remarks: null,
            flags: { source: 'uat-payroll-test' },
            calculationVersion: 1,
            isAdjusted: false,
            finalizedAt: new Date(),
          } as never),
        );
        attendanceRows += 1;
      }
    }

    // Statutory rules: approve the verified drafts for UAT testing only.
    const approved = await ds.query(
      `UPDATE statutory_rule_versions
          SET status = 'APPROVED', approved_by_company_user_id = $2, approved_at = NOW(),
              configuration = COALESCE(configuration, '{}'::jsonb)
                || jsonb_build_object('uat_test_approval', 'Approved for UAT payroll testing only; verify before production')
        WHERE company_id = $1 AND status = 'DRAFT' AND effective_to IS NULL
      RETURNING id`,
      [COMPANY_ID, membership.FINANCE.companyUserId],
    );

    // ---------- staff loan through the normal finance workflow ----------
    const loanAccountId = await seedLoan(ds, membership, employeeIds);

    const envPath = Object.keys(passwords).length
      ? writeEnvLocal({
          PLAYWRIGHT_BASE_URL:
            process.env.UAT_WEB_URL ?? 'http://192.168.1.30:9991',
          ...Object.fromEntries(
            ['ADMIN', 'HR', 'FINANCE', 'MANAGEMENT', 'EMPLOYEE'].flatMap(
              (key) =>
                passwords[key]
                  ? [
                      [`HRMS_E2E_${key}_EMAIL`, membership[key].email],
                      [`HRMS_E2E_${key}_PASSWORD`, passwords[key]],
                    ]
                  : [],
            ),
          ),
        })
      : null;

    log('done', {
      users: Object.fromEntries(
        Object.entries(membership).map(([k, v]) => [k, v.companyUserId]),
      ),
      employees: employeeIds,
      cost_center: costCenter.id,
      calendar: calendar.id,
      group: group.id,
      period: { id: period.id, code: periodCode },
      attendance_rows_created: attendanceRows,
      rules_approved: approved[0]?.length ?? approved.length,
      loan_account: loanAccountId,
      credentials_written_to: envPath ?? '(unchanged: users already existed)',
    });
  } finally {
    await ds.destroy();
  }
}

async function seedLoan(
  ds: DataSource,
  membership: Record<
    string,
    { userId: number; companyUserId: number; email: string }
  >,
  employeeIds: Record<string, number>,
) {
  const employeeId = employeeIds['UAT-PAY-001'];
  const guarantorId = employeeIds['UAT-PAY-003'];
  const existing = await ds.getRepository(EmployeeFinanceAccount).findOne({
    where: { companyId: COMPANY_ID, employeeId },
  });
  if (existing) return existing.id;

  const actor = (
    key: string,
    extra: Partial<AuthenticatedUser> = {},
  ): AuthenticatedUser => ({
    id: membership[key].userId,
    email: membership[key].email,
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: COMPANY_ID,
    companyMembershipId: membership[key].companyUserId,
    permissions: [],
    roles: [],
    ...extra,
  });
  const admin = actor('ADMIN');
  const employee = actor('EMPLOYEE', { employeeId });
  const guarantor = actor('GUARANTOR', { employeeId: guarantorId });

  // Same company scoping as production; notifications are not sent for
  // fictional test users.
  const access = {
    ensureActorCompanyId: (user: AuthenticatedUser) => user.companyId,
    assertCanAccessEmployee: () => undefined,
    assertCompanyScopedActor: () => undefined,
  } as unknown as HrAccessService;
  const silent = {
    enqueueSmsConfiguredNotification: async () => undefined,
  } as never;
  const config = new SeedConfig() as unknown as ConfigService;
  const repo = <T extends object>(entity: new () => T) =>
    ds.getRepository(entity);

  const audit = new EmployeeFinanceAuditService(
    access,
    repo(EmployeeFinanceAuditLog),
  );
  const products = new EmployeeFinanceProductService(
    config,
    access,
    audit,
    repo(EmployeeFinanceProduct),
    repo(EmployeeFinanceApplication),
  );
  const eligibility = new EmployeeFinanceEligibilityService(
    config,
    access,
    products,
    repo(Employee),
    repo(EmployeeCompensationVersion),
    repo(EmployeePayrollResult),
    repo(EmployeeFinanceAccount),
    repo(EmployeeFinanceProductApplicability),
  );
  const interest = new EmployeeFinanceInterestService();
  const ledger = new EmployeeFinanceLedgerService(
    repo(EmployeeFinanceAccount),
    repo(EmployeeFinanceLedgerEntry),
  );
  const accounts = new EmployeeFinanceAccountService(
    config,
    access,
    interest,
    audit,
    repo(EmployeeFinanceAccount),
    repo(EmployeeFinanceApplication),
    repo(EmployeeFinanceInstallment),
    repo(EmployeeFinanceLedgerEntry),
    repo(EmployeeFinanceDisbursement),
    repo(EmployeeFinanceRepayment),
    repo(EmployeeFinanceDefermentRequest),
    repo(EmployeeFinanceReschedule),
    repo(EmployeeFinanceSettlementQuote),
    eligibility,
  );
  const applications = new EmployeeFinanceApplicationService(
    config,
    access,
    products,
    eligibility,
    accounts,
    audit,
    repo(Employee),
    repo(EmployeeFinanceApplication),
    repo(EmployeeFinanceApplicationDocument),
    repo(EmployeeFinanceApplicationGuarantor),
    repo(EmployeeFinanceSanctionLetter),
    {} as never,
    {
      notifyEmployee: async () => undefined,
      notifyStageApprovers: async () => undefined,
    } as never,
  );
  const approvals = new EmployeeFinanceApprovalService(
    config,
    access,
    audit,
    {} as never,
    silent,
    repo(Employee),
    repo(EmployeeFinanceApplication),
    repo(EmployeeFinanceApplicationApproval),
    repo(EmployeeFinanceApplicationDocument),
    repo(EmployeeFinanceApplicationGuarantor),
    repo(EmployeeFinanceSanctionLetter),
    interest,
    undefined,
    undefined,
    undefined,
    undefined,
    eligibility,
  );
  const disbursements = new EmployeeFinanceDisbursementService(
    ledger,
    audit,
    {} as never,
    silent,
    repo(EmployeeFinanceAccount),
    repo(EmployeeFinanceApplication),
    repo(EmployeeFinanceDisbursement),
  );

  const product = await repo(EmployeeFinanceProduct).findOneOrFail({
    where: { companyId: COMPANY_ID, code: 'STAFF_LOAN_STD' },
  });
  let application = await applications.createForEmployee(admin, employeeId, {
    product_id: product.id,
    requested_amount: '600000.00',
    requested_term_months: 3,
    purpose: 'UAT payroll test loan (fictional)',
  });
  for (const [type, meta] of [
    ['REQUEST_LETTER', {}],
    ['GUARANTOR_FORM', { guarantor_employee_id: guarantorId }],
  ] as const) {
    const document = await applications.addDocument(employee, application.id, {
      document_type: type,
      file_url: `uat-test://${type.toLowerCase()}/${application.id}`,
      metadata: { source: 'uat-payroll-test', ...meta },
    });
    await applications.verifyDocument(admin, application.id, document.id, {
      status: 'VERIFIED',
    });
  }
  const guarantee = await applications.addGuarantor(employee, application.id, {
    guarantor_employee_id: guarantorId,
  });
  await applications.decideGuarantor(guarantor, guarantee.id, {
    decision: 'APPROVED',
    comments: 'UAT test guarantee',
  });
  application = await applications.submitMine(employee, application.id);
  const hash = application.eligibilitySnapshotHash;
  application = await approvals.approve(admin, application.id, {
    stage: EmployeeFinanceApprovalStageEnum.MANAGER,
    snapshot_hash: hash,
    comments: 'UAT test recommendation',
  });
  application = await approvals.approve(actor('HR'), application.id, {
    stage: EmployeeFinanceApprovalStageEnum.HR,
    snapshot_hash: hash,
    comments: 'UAT test HR approval',
  });
  application = await approvals.approve(actor('FINANCE'), application.id, {
    stage: EmployeeFinanceApprovalStageEnum.FINANCE,
    snapshot_hash: hash,
    comments: 'UAT test Finance approval',
  });
  const account = await applications.acceptMine(employee, application.id);
  const disbursement = await disbursements.create(admin, {
    account_id: account.id,
    amount: '600000.00',
    payment_reference: `UAT-TEST-DISB-${account.id}`,
    payment_date: iso(new Date()),
  });
  await disbursements.approve(actor('FINANCE'), disbursement.id);
  await disbursements.confirm(admin, disbursement.id);
  log('loan disbursed', { account: account.id });
  return account.id;
}

main().catch((error) => {
  console.error(
    '[uat-seed] FAILED:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
