process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

import './setup-e2e';
import 'reflect-metadata';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { ConfigService } from '@nestjs/config';
import ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../src/database/data-source';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-user.interface';
import { Company } from '../src/modules/companies/entities/company.entity';
import { CompanyUser } from '../src/modules/companies/entities/company-user.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { Employee } from '../src/modules/hr/employees/entities/employee.entity';
import { EmployeeBankAccount } from '../src/modules/hr/employees/entities/employee-bank-account.entity';
import { EmploymentStatusEnum } from '../src/modules/hr/employees/enums/employment-status.enum';
import { OffboardingRequest } from '../src/modules/hr/offboarding/entities/offboarding-request.entity';
import { OffboardingSettlementItem } from '../src/modules/hr/offboarding/entities/offboarding-settlement-item.entity';
import { OffboardingTypeEnum } from '../src/modules/hr/offboarding/enums/offboarding-type.enum';
import { HrAccessService } from '../src/modules/hr/shared/hr-access.service';
import {
  EmployeeFinanceAccount,
  EmployeeFinanceAuditLog,
  EmployeeFinanceDefermentRequest,
  EmployeeFinanceDisbursement,
  EmployeeFinanceExitRecovery,
  EmployeeFinanceInstallment,
  EmployeeFinanceLedgerEntry,
  EmployeeFinancePayrollInstruction,
  EmployeeFinanceRepayment,
  EmployeeFinanceReschedule,
  EmployeeFinanceSettlementQuote,
} from '../src/modules/hr/employee-finance/entities/employee-finance-account.entities';
import {
  EmployeeFinanceApplication,
  EmployeeFinanceApplicationApproval,
} from '../src/modules/hr/employee-finance/entities/employee-finance-application.entities';
import { EmployeeFinanceProduct } from '../src/modules/hr/employee-finance/entities/employee-finance-product.entities';
import {
  EmployeeFinanceIntegrationLog,
  EmployeeFinanceIntegrationSettings,
} from '../src/modules/hr/employee-finance/entities/employee-finance-integration.entities';
import {
  EmployeeFinanceAccountService,
  EmployeeFinanceAuditService,
  EmployeeFinanceExitRecoveryService,
  EmployeeFinanceInterestService,
  EmployeeFinanceLedgerService,
  EmployeeFinanceProductService,
  EmployeeFinanceReconciliationService,
  EmployeeFinanceReportsService,
} from '../src/modules/hr/employee-finance/services/employee-finance-core.services';
import { EmployeeFinanceMigrationService } from '../src/modules/hr/employee-finance/services/employee-finance-migration.services';
import {
  EMPLOYEE_FINANCE_LOAN_REPORTS,
  EmployeeFinanceLoanReportsService,
} from '../src/modules/hr/employee-finance/services/employee-finance-reporting.services';
import { EmployeeFinanceIntegrationService } from '../src/modules/hr/employee-finance/services/employee-finance-integration.services';
import {
  EmployeeFinanceAccountStatusEnum,
  EmployeeFinanceDisbursementStatusEnum,
  EmployeeFinanceInterestMethodEnum,
  EmployeeFinanceProductTypeEnum,
} from '../src/modules/hr/employee-finance/employee-finance.enums';

class TestConfigService {
  get<T>(key: string, defaultValue?: T): T {
    return (
      key === 'EMPLOYEE_FINANCE_DEFAULT_REPAYMENT_DAY' ? 28 : defaultValue
    ) as T;
  }
}

const isZip = (buffer: Buffer) => buffer.subarray(0, 2).toString() === 'PK';

describe('Employee finance phases 5-7: reports, integrations, migration (e2e, real Postgres)', () => {
  let dataSource: DataSource;
  let company: Company;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const people: Record<
    string,
    { userId: number; membershipId: number; employeeId?: number }
  > = {};
  const hrAccessService = {
    ensureActorCompanyId: jest.fn(
      (actor: AuthenticatedUser) => actor.companyId,
    ),
    assertCanAccessEmployee: jest.fn(),
  } as unknown as HrAccessService;
  const config = new TestConfigService() as unknown as ConfigService;
  const actorFor = (key: string): AuthenticatedUser => ({
    id: people[key].userId,
    email: `${key}.${suffix}@example.com`,
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: company.id,
    companyName: company.name,
    companyMembershipId: people[key].membershipId,
    employeeId: people[key].employeeId,
    permissions: [],
    roles: [],
  });

  let migration: EmployeeFinanceMigrationService;
  let reports: EmployeeFinanceLoanReportsService;
  let integration: EmployeeFinanceIntegrationService;
  let reconciliation: EmployeeFinanceReconciliationService;
  let exitRecovery: EmployeeFinanceExitRecoveryService;
  let ledger: EmployeeFinanceLedgerService;
  let bankServer: Server;
  let bankUrl = '';
  const bankResponses: number[] = [];
  const bankCalls: Array<{ path: string; key: string | undefined }> = [];

  async function person(key: string, withEmployee: boolean) {
    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `O${Object.keys(people).length}${suffix}`.slice(0, 20),
        first_name: key,
        last_name: 'Ops',
        phone: `+255${Math.floor(Math.random() * 1e9)}`.slice(0, 20),
        email: `${key}.${suffix}@example.com`,
        password: 'not-a-real-hash',
        status: 'active',
        user_type: 'COMPANY_USER',
        auth_token_version: 1,
      }),
    );
    const membership = await dataSource.getRepository(CompanyUser).save(
      dataSource.getRepository(CompanyUser).create({
        company_id: company.id,
        user_id: user.id,
        status: 'active',
        is_default: true,
      }),
    );
    let employeeId: number | undefined;
    if (withEmployee) {
      employeeId = (
        await dataSource.getRepository(Employee).save(
          dataSource.getRepository(Employee).create({
            company_id: company.id,
            company_user_id: membership.id,
            employee_no: `OPS-${key}-${suffix}`.slice(0, 50),
            first_name: key,
            last_name: 'Ops',
            gender: 'male',
            employment_status: EmploymentStatusEnum.ACTIVE,
            hire_date: '2023-01-01',
          }),
        )
      ).id;
    }
    people[key] = { userId: user.id, membershipId: membership.id, employeeId };
  }

  async function workbookFile(rows: Array<Record<string, string>>) {
    const template = await migration.template();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template.buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    const headers = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
    sheet.spliceRows(2, 1);
    for (const row of rows)
      sheet.addRow(headers.map((header) => row[header] ?? ''));
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      fileName: 'loans.xlsx',
      fileSize: buffer.length,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileString: buffer.toString('base64'),
    };
  }

  beforeAll(async () => {
    dataSource = AppDataSource.isInitialized
      ? AppDataSource
      : await AppDataSource.initialize();
    company = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `Loan Ops E2E ${suffix}`,
        slug: `loan-ops-e2e-${suffix}`,
        status: 'active',
        metadata: { source: 'employee-finance-operations-e2e' },
      }),
    );
    await person('borrower', true);
    await person('leaver', true);
    await person('finance', false);
    await person('checker', false);
    await dataSource.getRepository(EmployeeBankAccount).save(
      dataSource.getRepository(EmployeeBankAccount).create({
        employee_id: people.borrower.employeeId!,
        bank_name: 'Test Bank',
        account_name: 'Borrower Ops',
        account_number: '0150123456789',
        bank_branch_code: '015',
        account_currency: 'TZS',
        verification_status: 'VERIFIED',
        is_primary: true,
      } as Partial<EmployeeBankAccount>),
    );

    const repo = <T extends object>(entity: new () => T) =>
      dataSource.getRepository(entity);
    const audit = new EmployeeFinanceAuditService(
      hrAccessService,
      repo(EmployeeFinanceAuditLog),
    );
    const products = new EmployeeFinanceProductService(
      config,
      hrAccessService,
      audit,
      repo(EmployeeFinanceProduct),
      repo(EmployeeFinanceApplication),
    );
    await products.create(actorFor('finance'), {
      product_type: EmployeeFinanceProductTypeEnum.STAFF_LOAN,
      code: 'OPS-LOAN',
      name: 'Ops staff loan',
      interest_method: EmployeeFinanceInterestMethodEnum.FLAT_RATE,
      annual_interest_rate: '10',
      minimum_amount: '1000',
      maximum_term_months: 24,
      effective_from: '2023-01-01',
    });
    ledger = new EmployeeFinanceLedgerService(
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceLedgerEntry),
    );
    const accountService = new EmployeeFinanceAccountService(
      config,
      hrAccessService,
      new EmployeeFinanceInterestService(),
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
    );
    migration = new EmployeeFinanceMigrationService(
      config,
      audit,
      dataSource,
      repo(Employee),
      repo(EmployeeFinanceProduct),
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceAuditLog),
    );
    const coreReports = new EmployeeFinanceReportsService(
      config,
      repo(EmployeeFinanceApplication),
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceInstallment),
      repo(EmployeeFinanceDisbursement),
      repo(EmployeeFinanceRepayment),
      repo(EmployeeFinanceSettlementQuote),
      repo(EmployeeFinanceAuditLog),
    );
    reports = new EmployeeFinanceLoanReportsService(
      accountService,
      coreReports,
      audit,
      repo(Employee),
      repo(EmployeeFinanceApplication),
      repo(EmployeeFinanceApplicationApproval),
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceInstallment),
      repo(EmployeeFinanceLedgerEntry),
      repo(EmployeeFinanceExitRecovery),
    );
    integration = new EmployeeFinanceIntegrationService(
      audit,
      {} as never,
      repo(EmployeeFinanceIntegrationSettings),
      repo(EmployeeFinanceIntegrationLog),
      repo(EmployeeFinanceLedgerEntry),
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceDisbursement),
      repo(Employee),
      repo(EmployeeBankAccount),
    );
    reconciliation = new EmployeeFinanceReconciliationService(
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceInstallment),
      repo(EmployeeFinancePayrollInstruction),
      ledger,
      repo(EmployeeFinanceLedgerEntry),
      audit,
    );
    exitRecovery = new EmployeeFinanceExitRecoveryService(
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceExitRecovery),
      repo(OffboardingRequest),
      repo(OffboardingSettlementItem),
      ledger,
      repo(EmployeeFinanceInstallment),
      repo(EmployeeFinancePayrollInstruction),
      audit,
    );

    bankServer = createServer((request, response) => {
      bankCalls.push({
        path: request.url ?? '',
        key: request.headers['idempotency-key'] as string | undefined,
      });
      const status = bankResponses.shift() ?? 200;
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ reference: `BANKREF-${bankCalls.length}` }),
      );
    });
    await new Promise<void>((resolve) =>
      bankServer.listen(0, '127.0.0.1', resolve),
    );
    bankUrl = `http://127.0.0.1:${(bankServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => bankServer?.close(() => resolve()));
    if (company?.id) {
      for (const table of [
        'employee_finance_integration_logs',
        'employee_finance_integration_settings',
        'employee_finance_exit_recoveries',
        'offboarding_settlement_items',
        'offboarding_requests',
        'employee_finance_application_guarantors',
        'employee_finance_disbursements',
        'employee_finance_ledger_entries',
        'employee_finance_installments',
        'employee_finance_accounts',
        'employee_finance_applications',
        'employee_finance_products',
        'employee_finance_audit_logs',
      ]) {
        await dataSource.query(
          `DELETE FROM "${table}" WHERE "company_id" = $1`,
          [company.id],
        );
      }
      const employeeIds = Object.values(people)
        .map((p) => p.employeeId)
        .filter(Boolean);
      await dataSource.query(
        `DELETE FROM "employee_bank_accounts" WHERE "employee_id" = ANY($1)`,
        [employeeIds],
      );
      await dataSource.query(
        `DELETE FROM "employees" WHERE "company_id" = $1`,
        [company.id],
      );
      await dataSource.query(
        `DELETE FROM "company_users" WHERE "company_id" = $1`,
        [company.id],
      );
      await dataSource.query(`DELETE FROM "users" WHERE "id" = ANY($1)`, [
        Object.values(people).map((p) => p.userId),
      ]);
      await dataSource.query(`DELETE FROM "companies" WHERE "id" = $1`, [
        company.id,
      ]);
    }
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('migrates existing loans all-or-nothing, reconciles them, and needs a second person to sign off', async () => {
    const good = (ref: string, employee: string) => ({
      employee_no: `OPS-${employee}-${suffix}`.slice(0, 50),
      product_code: 'OPS-LOAN',
      loan_reference: `${ref}-${suffix}`,
      principal_amount: '1200000',
      disbursed_on: '2026-01-15',
      annual_interest_rate: '10',
      outstanding_principal: '800000',
      outstanding_interest: '40000',
      outstanding_fees: '0',
      monthly_installment: '105000',
      remaining_installments: '8',
      next_due_date: '2026-11-28',
      guarantor_employee_nos: '',
      notes: '',
    });
    const bad = await migration.import(actorFor('finance'), {
      file: await workbookFile([
        good('OLD-1', 'borrower'),
        { ...good('OLD-2', 'nobody') },
      ]),
      dry_run: false,
    });
    expect(bad.committed).toBe(false);
    expect(bad.totals.error_count).toBe(1);
    expect(
      await dataSource
        .getRepository(EmployeeFinanceAccount)
        .count({ where: { companyId: company.id } }),
    ).toBe(0);

    const file = await workbookFile([
      good('OLD-1', 'borrower'),
      good('OLD-3', 'leaver'),
    ]);
    const dry = await migration.import(actorFor('finance'), { file });
    expect(dry.committed).toBe(false);
    expect(dry.totals.outstanding_total).toBe('1680000.00');
    const done = await migration.import(actorFor('finance'), {
      file,
      dry_run: false,
      cutover_date: '2026-10-31',
    });
    expect(done.committed).toBe(true);
    const again = await migration.import(actorFor('finance'), {
      file,
      dry_run: false,
    });
    expect(again.committed).toBe(false);
    expect(again.rows[0].errors).toContain('This loan was already migrated.');

    const accounts = await dataSource
      .getRepository(EmployeeFinanceAccount)
      .find({ where: { companyId: company.id } });
    expect(accounts).toHaveLength(2);
    for (const account of accounts) {
      expect(account.status).toBe(EmployeeFinanceAccountStatusEnum.ACTIVE);
      const result = await reconciliation.reconcile(
        actorFor('finance'),
        account.id,
      );
      expect('issues' in result ? result.issues : []).toEqual([]);
    }
    await expect(
      migration.signOff(actorFor('finance'), done.batch_id!),
    ).rejects.toThrow('cannot sign it off');
    await migration.signOff(
      actorFor('checker'),
      done.batch_id!,
      'Balances agree with the old system',
    );
    const [batch] = await migration.listBatches(actorFor('finance'));
    expect(batch.signed_off_at).toBeTruthy();
  });

  it('produces every FRS loan report, exports, and statements', async () => {
    for (const definition of EMPLOYEE_FINANCE_LOAN_REPORTS) {
      const report = await reports.report(
        actorFor('finance'),
        definition.type,
        {},
      );
      expect(Array.isArray(report.rows)).toBe(true);
    }
    const active = await reports.report(
      actorFor('finance'),
      'active-loans',
      {},
    );
    expect(active.totals.outstanding_total).toBe('1680000.00');
    expect(
      isZip(
        (await reports.export(actorFor('finance'), 'active-loans', {}, 'xlsx'))
          .buffer,
      ),
    ).toBe(true);
    const csv = await reports.export(actorFor('finance'), 'aging', {}, 'csv');
    expect(csv.buffer.toString('utf8')).toContain('account_no');
    const [account] = await dataSource
      .getRepository(EmployeeFinanceAccount)
      .find({ where: { companyId: company.id } });
    const pdf = await reports.statement(actorFor('finance'), account.id, 'pdf');
    expect(pdf.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(
      isZip(
        (await reports.statement(actorFor('finance'), account.id, 'xlsx'))
          .buffer,
      ),
    ).toBe(true);
  });

  it('exports a balanced journal, a bank file, and sends payments once with retry', async () => {
    const settings = await integration.updateSettings(actorFor('finance'), {
      erp_mode: 'FILE',
      bank_mode: 'FILE',
      gl_mapping: {
        loans_receivable: '1400',
        bank: '1000',
        interest_income: '4100',
      },
      bank_credentials: { token: 'secret-token' },
    });
    expect(JSON.stringify(settings)).not.toContain('secret-token');
    expect(settings.bank_credentials_set).toBe(true);
    const preview = await integration.buildJournal(company.id, {});
    expect(preview.balanced).toBe(true);
    expect(preview.journal_count).toBe(2);
    const journal = await integration.exportJournal(actorFor('finance'), {
      format: 'xlsx',
    });
    expect(isZip(journal.buffer)).toBe(true);
    await expect(
      integration.exportJournal(actorFor('finance'), {}),
    ).rejects.toThrow('no loan postings');

    const [account] = await dataSource
      .getRepository(EmployeeFinanceAccount)
      .find({
        where: {
          companyId: company.id,
          employeeId: people.borrower.employeeId,
        },
      });
    await dataSource.getRepository(EmployeeFinanceDisbursement).save(
      dataSource.getRepository(EmployeeFinanceDisbursement).create({
        companyId: company.id,
        accountId: account.id,
        amount: '50000.00',
        paymentReference: `TOPUP-${suffix}`,
        paymentDate: '2026-10-31',
        status: EmployeeFinanceDisbursementStatusEnum.APPROVED,
        createdByCompanyUserId: people.finance.membershipId,
      }),
    );
    const bankFile = await integration.bankPaymentFile(actorFor('finance'));
    expect(bankFile.buffer.toString('utf8')).toContain('0150123456789');

    await expect(
      integration.submitPayments(actorFor('finance')),
    ).rejects.toThrow('Direct bank submission is off');
    await integration.updateSettings(actorFor('finance'), {
      bank_mode: 'DIRECT',
      bank_endpoint_url: bankUrl,
      bank_auth_type: 'bearer',
    });
    bankResponses.push(500);
    const failed = await integration.submitPayments(actorFor('finance'));
    expect(failed.status).toBe('FAILED');
    expect(failed.next_retry_at).toBeTruthy();
    const retried = await integration.retry(actorFor('finance'), failed.log_id);
    expect(retried.status).toBe('SUCCESS');
    const duplicate = await integration.submitPayments(actorFor('finance'));
    expect(duplicate.duplicate).toBe(true);
    expect(bankCalls.filter((call) => call.path === '/payments')).toHaveLength(
      2,
    );
    expect(new Set(bankCalls.map((call) => call.key)).size).toBe(1);
    const test = await integration.testConnection(actorFor('finance'), 'BANK');
    expect(test.ok).toBe(true);
  });

  it('moves a leaver into exit recovery once and recovers partially then fully', async () => {
    const offboarding = await dataSource.getRepository(OffboardingRequest).save(
      dataSource.getRepository(OffboardingRequest).create({
        company_id: company.id,
        employee_id: people.leaver.employeeId!,
        offboarding_code: `OFB-${suffix}`.slice(0, 50),
        title: 'Resignation',
        offboarding_type: OffboardingTypeEnum.RESIGNATION,
        reason: 'Resigned',
        last_working_date: '2026-11-30',
      } as Partial<OffboardingRequest>),
    );
    const [recovery] = await exitRecovery.createForOffboarding(
      company.id,
      offboarding.id,
    );
    await exitRecovery.createForOffboarding(company.id, offboarding.id);
    expect(
      await dataSource.getRepository(OffboardingSettlementItem).count({
        where: {
          company_id: company.id,
          offboarding_request_id: offboarding.id,
        },
      }),
    ).toBe(1);
    const due = Number(recovery.recoveryAmount);
    const partial = await exitRecovery.confirmRecovery(
      actorFor('finance'),
      recovery.id,
      { amount: '100000' },
    );
    expect(partial.status).toBe('PARTIALLY_RECOVERED');
    const rest = (due - 100000).toFixed(2);
    const full = await exitRecovery.confirmRecovery(
      actorFor('finance'),
      recovery.id,
      { amount: rest },
    );
    expect(full.status).toBe('RECOVERED');
    const account = await dataSource
      .getRepository(EmployeeFinanceAccount)
      .findOneByOrFail({ id: recovery.accountId });
    expect(account.status).toBe(EmployeeFinanceAccountStatusEnum.EXIT_RECOVERY);
    expect((await ledger.calculateBalance(company.id, account.id)).total).toBe(
      '0.00',
    );
    const result = await reconciliation.reconcile(
      actorFor('finance'),
      account.id,
    );
    expect('issues' in result ? result.issues : []).toEqual([]);
  });
});
