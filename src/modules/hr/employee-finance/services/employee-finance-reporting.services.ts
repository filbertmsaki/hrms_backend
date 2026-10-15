import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeFinanceQueryDto } from '../dto/employee-finance.dto';
import {
  EmployeeFinanceAccount,
  EmployeeFinanceExitRecovery,
  EmployeeFinanceInstallment,
  EmployeeFinanceLedgerEntry,
} from '../entities/employee-finance-account.entities';
import {
  EmployeeFinanceApplication,
  EmployeeFinanceApplicationApproval,
} from '../entities/employee-finance-application.entities';
import {
  EmployeeFinanceAccountStatusEnum,
  EmployeeFinanceDecisionEnum,
  EmployeeFinanceInstallmentStatusEnum,
  EmployeeFinanceProductTypeEnum,
  EmployeeFinanceLedgerEntryTypeEnum,
} from '../employee-finance.enums';
import {
  activeAccountStatuses,
  daysBetweenDates,
  recordValue,
  textValue,
  todayString,
} from '../employee-finance.utils';
import {
  EmployeeFinanceAccountService,
  EmployeeFinanceAuditService,
  EmployeeFinanceReportsService,
  formatMoney,
  installmentRemainder,
} from './employee-finance-core.services';
import { EmployeeFinanceMoney } from './employee-finance-money.util';

type ReportRow = Record<string, string | number | boolean | null>;

type LoanReport = {
  reportType: string;
  title: string;
  generatedAt: string;
  filters: Record<string, unknown>;
  totals: Record<string, string | number>;
  rows: ReportRow[];
};

/** The FRS 12.3 / 19 staff loan reports. */
export const EMPLOYEE_FINANCE_LOAN_REPORTS = [
  {
    type: 'applications',
    label: 'Loan application report',
    description: 'Every application with amount, status, and current stage.',
  },
  {
    type: 'approvals',
    label: 'Loan approval report',
    description: 'Each approval decision by stage, approver, and cycle.',
  },
  {
    type: 'active-loans',
    label: 'Active loan report',
    description:
      'Loans being repaid, with balance, instalment, and next due date.',
  },
  {
    type: 'monthly-deductions',
    label: 'Monthly loan deduction report',
    description: 'Payroll deductions posted to loans, by month.',
  },
  {
    type: 'outstanding',
    label: 'Loan outstanding and overdue report',
    description:
      'Outstanding balance and overdue amount per loan, with days overdue.',
  },
  {
    type: 'settled-loans',
    label: 'Loan settlement report',
    description:
      'Loans closed by full repayment, early settlement, exit recovery, or write-off.',
  },
  {
    type: 'exit-recoveries',
    label: 'Loan recovery at full and final settlement',
    description: 'Amounts due and recovered from leavers.',
  },
] as const;

@Injectable()
export class EmployeeFinanceLoanReportsService {
  constructor(
    private readonly accountService: EmployeeFinanceAccountService,
    private readonly coreReports: EmployeeFinanceReportsService,
    private readonly auditService: EmployeeFinanceAuditService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeFinanceApplication)
    private readonly applicationRepository: Repository<EmployeeFinanceApplication>,
    @InjectRepository(EmployeeFinanceApplicationApproval)
    private readonly approvalRepository: Repository<EmployeeFinanceApplicationApproval>,
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceInstallment)
    private readonly installmentRepository: Repository<EmployeeFinanceInstallment>,
    @InjectRepository(EmployeeFinanceLedgerEntry)
    private readonly ledgerRepository: Repository<EmployeeFinanceLedgerEntry>,
    @InjectRepository(EmployeeFinanceExitRecovery)
    private readonly exitRecoveryRepository: Repository<EmployeeFinanceExitRecovery>,
  ) {}

  catalog() {
    return EMPLOYEE_FINANCE_LOAN_REPORTS;
  }

  private async employees(companyId: number, ids: number[]) {
    const unique = Array.from(new Set(ids));
    if (!unique.length) return new Map<number, Employee>();
    const rows = await this.employeeRepository.find({
      where: { company_id: companyId, id: In(unique) },
      select: [
        'id',
        'employee_no',
        'first_name',
        'last_name',
        'primary_department_id',
        'primary_branch_id',
      ],
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  private employeeColumns(employee: Employee | undefined) {
    return {
      employee_no: employee?.employee_no ?? null,
      employee_name: employee
        ? [employee.first_name, employee.last_name].filter(Boolean).join(' ')
        : null,
      department_id: employee?.primary_department_id ?? null,
      branch_id: employee?.primary_branch_id ?? null,
    };
  }

  private inRange(
    value: string | null | undefined,
    query: EmployeeFinanceQueryDto,
  ) {
    if (!value) return true;
    const day = value.slice(0, 10);
    if (query.date_from && day < query.date_from) return false;
    if (query.date_to && day > query.date_to) return false;
    return true;
  }

  async report(
    actor: AuthenticatedUser,
    reportType: string,
    query: EmployeeFinanceQueryDto,
  ): Promise<LoanReport> {
    const companyId = actor.companyId!;
    const type = reportType.trim().toLowerCase();
    const definition = EMPLOYEE_FINANCE_LOAN_REPORTS.find(
      (item) => item.type === type,
    );
    if (!definition) {
      throw new BadRequestException('Unknown loan report type.');
    }
    const base = {
      reportType: type,
      title: definition.label,
      generatedAt: new Date().toISOString(),
      filters: { ...query },
    };
    if (type === 'applications')
      return { ...base, ...(await this.applications(companyId, query)) };
    if (type === 'approvals')
      return { ...base, ...(await this.approvals(companyId, query)) };
    if (type === 'active-loans')
      return { ...base, ...(await this.activeLoans(companyId, query)) };
    if (type === 'monthly-deductions')
      return { ...base, ...(await this.monthlyDeductions(companyId, query)) };
    if (type === 'outstanding')
      return { ...base, ...(await this.outstanding(companyId, query)) };
    if (type === 'settled-loans')
      return { ...base, ...(await this.settledLoans(companyId, query)) };
    return { ...base, ...(await this.exitRecoveries(companyId, query)) };
  }

  private async applications(
    companyId: number,
    query: EmployeeFinanceQueryDto,
  ) {
    const applications = (
      await this.applicationRepository.find({
        where: {
          companyId,
          ...(query.status ? { status: query.status as never } : {}),
          ...(query.employee_id
            ? { employeeId: Number(query.employee_id) }
            : {}),
          ...(query.product_id ? { productId: Number(query.product_id) } : {}),
        },
        order: { id: 'DESC' },
      })
    ).filter((item) => this.inRange(item.createdAt?.toISOString(), query));
    const people = await this.employees(
      companyId,
      applications.map((item) => item.employeeId),
    );
    const rows = applications.map((item) => ({
      application_no: item.applicationNo,
      ...this.employeeColumns(people.get(item.employeeId)),
      product_type: item.productType,
      product: textValue(
        recordValue(item.productSnapshot).name,
        item.productType,
      ),
      requested_amount: item.requestedAmount,
      requested_term_months: item.requestedTermMonths,
      approved_amount: item.approvedAmount,
      approved_term_months: item.approvedTermMonths,
      status: item.status,
      approval_route: Array.isArray(item.approvalRoute)
        ? item.approvalRoute.join(' > ')
        : null,
      approval_cycle: item.approvalCycle ?? 1,
      submitted_at: item.submittedAt
        ? item.submittedAt.toISOString().slice(0, 10)
        : null,
      approved_at: item.approvedAt
        ? item.approvedAt.toISOString().slice(0, 10)
        : null,
      decision_comments: item.decisionComments,
    }));
    const byStatus: Record<string, number> = {};
    for (const row of rows)
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    return {
      totals: {
        application_count: rows.length,
        requested_total: rows.reduce(
          (sum, row) => EmployeeFinanceMoney.add(sum, row.requested_amount),
          '0.00',
        ),
        ...Object.fromEntries(
          Object.entries(byStatus).map(([key, value]) => [
            `status_${key.toLowerCase()}`,
            value,
          ]),
        ),
      },
      rows,
    };
  }

  private async approvals(companyId: number, query: EmployeeFinanceQueryDto) {
    const approvals = (
      await this.approvalRepository.find({
        where: { companyId },
        order: { id: 'DESC' },
      })
    ).filter((item) => this.inRange(item.createdAt?.toISOString(), query));
    const applications = approvals.length
      ? await this.applicationRepository.find({
          where: {
            companyId,
            id: In(
              Array.from(new Set(approvals.map((item) => item.applicationId))),
            ),
          },
        })
      : [];
    const applicationById = new Map(
      applications.map((item) => [item.id, item]),
    );
    const people = await this.employees(
      companyId,
      applications.map((item) => item.employeeId),
    );
    const rows = approvals
      .filter(
        (item) =>
          !query.employee_id ||
          applicationById.get(item.applicationId)?.employeeId ===
            Number(query.employee_id),
      )
      .map((item) => {
        const application = applicationById.get(item.applicationId);
        return {
          application_no: application?.applicationNo ?? null,
          ...this.employeeColumns(
            application ? people.get(application.employeeId) : undefined,
          ),
          stage: item.stage,
          decision: item.decision,
          approval_cycle: item.approvalCycle ?? 1,
          approved_amount: item.approvedAmount,
          approver_company_user_id: item.createdByCompanyUserId,
          on_behalf_of_company_user_id: item.onBehalfOfCompanyUserId,
          comments: item.comments,
          decided_at: item.createdAt
            ? item.createdAt.toISOString().slice(0, 16).replace('T', ' ')
            : null,
        };
      });
    return {
      totals: {
        decision_count: rows.length,
        approved: rows.filter((row) =>
          ['APPROVED', 'RECOMMENDED'].includes(String(row.decision)),
        ).length,
        returned: rows.filter(
          (row) => row.decision === EmployeeFinanceDecisionEnum.RETURNED,
        ).length,
        rejected: rows.filter(
          (row) => row.decision === EmployeeFinanceDecisionEnum.REJECTED,
        ).length,
        delegated: rows.filter(
          (row) => row.on_behalf_of_company_user_id !== null,
        ).length,
      },
      rows,
    };
  }

  private async openInstallmentsByAccount(
    companyId: number,
    accountIds: number[],
  ) {
    const map = new Map<number, EmployeeFinanceInstallment[]>();
    if (!accountIds.length) return map;
    const installments = await this.installmentRepository.find({
      where: {
        companyId,
        accountId: In(accountIds),
        status: In([
          EmployeeFinanceInstallmentStatusEnum.SCHEDULED,
          EmployeeFinanceInstallmentStatusEnum.PARTIALLY_PAID,
          EmployeeFinanceInstallmentStatusEnum.OVERDUE,
          EmployeeFinanceInstallmentStatusEnum.DEFERRED,
        ]),
      },
      order: { dueDate: 'ASC', id: 'ASC' },
    });
    for (const installment of installments) {
      map.set(installment.accountId, [
        ...(map.get(installment.accountId) ?? []),
        installment,
      ]);
    }
    return map;
  }

  private async activeLoans(companyId: number, query: EmployeeFinanceQueryDto) {
    const accounts = await this.accountRepository.find({
      where: {
        companyId,
        status: In(
          activeAccountStatuses()
            .filter(
              (status) =>
                status !==
                EmployeeFinanceAccountStatusEnum.PENDING_DISBURSEMENT,
            )
            .concat([
              EmployeeFinanceAccountStatusEnum.EXIT_RECOVERY,
              EmployeeFinanceAccountStatusEnum.SETTLEMENT_PENDING,
            ]),
        ),
        ...(query.employee_id ? { employeeId: Number(query.employee_id) } : {}),
        ...(query.product_id ? { productId: Number(query.product_id) } : {}),
      },
      order: { id: 'ASC' },
    });
    const people = await this.employees(
      companyId,
      accounts.map((item) => item.employeeId),
    );
    const installments = await this.openInstallmentsByAccount(
      companyId,
      accounts.map((item) => item.id),
    );
    const rows = accounts.map((account) => {
      const open = installments.get(account.id) ?? [];
      return {
        account_no: account.accountNo,
        ...this.employeeColumns(people.get(account.employeeId)),
        product_type: account.productType,
        principal: account.principalAmount,
        total_payable: account.totalPayable,
        outstanding: account.outstandingTotal,
        monthly_installment: account.scheduledMonthlyInstallment,
        remaining_installments: open.length,
        next_due_date: open[0]?.dueDate ?? null,
        disbursed_on: account.disbursedAt
          ? account.disbursedAt.toISOString().slice(0, 10)
          : null,
        maturity_date: account.maturityDate,
        status: account.status,
      };
    });
    return {
      totals: {
        loan_count: rows.length,
        principal_total: rows.reduce(
          (sum, row) => EmployeeFinanceMoney.add(sum, row.principal),
          '0.00',
        ),
        outstanding_total: rows.reduce(
          (sum, row) => EmployeeFinanceMoney.add(sum, row.outstanding),
          '0.00',
        ),
        monthly_collection: rows.reduce(
          (sum, row) => EmployeeFinanceMoney.add(sum, row.monthly_installment),
          '0.00',
        ),
      },
      rows,
    };
  }

  private async monthlyDeductions(
    companyId: number,
    query: EmployeeFinanceQueryDto,
  ) {
    const entries = (
      await this.ledgerRepository.find({
        where: {
          companyId,
          entryType: EmployeeFinanceLedgerEntryTypeEnum.PAYROLL_REPAYMENT,
        },
        order: { effectiveDate: 'ASC', id: 'ASC' },
      })
    ).filter((entry) => this.inRange(entry.effectiveDate, query));
    const accounts = entries.length
      ? await this.accountRepository.find({
          where: {
            companyId,
            id: In(
              Array.from(new Set(entries.map((entry) => entry.accountId))),
            ),
          },
        })
      : [];
    const accountById = new Map(
      accounts.map((account) => [account.id, account]),
    );
    const people = await this.employees(
      companyId,
      accounts.map((account) => account.employeeId),
    );
    const rows = entries
      .filter(
        (entry) =>
          !query.employee_id ||
          accountById.get(entry.accountId)?.employeeId ===
            Number(query.employee_id),
      )
      .map((entry) => {
        const account = accountById.get(entry.accountId);
        return {
          month: entry.effectiveDate.slice(0, 7),
          ...this.employeeColumns(
            account ? people.get(account.employeeId) : undefined,
          ),
          account_no: account?.accountNo ?? null,
          product_type: account?.productType ?? null,
          payroll_run_id: entry.sourceId,
          principal: entry.principalAmount,
          interest: entry.interestAmount,
          fees: entry.feeAmount,
          deducted: entry.totalAmount,
          balance_after: textValue(
            recordValue(entry.balanceSnapshot).outstanding_total,
          ),
        };
      });
    const byMonth: Record<string, string> = {};
    for (const row of rows)
      byMonth[row.month] = EmployeeFinanceMoney.add(
        byMonth[row.month] ?? '0',
        row.deducted,
      );
    return {
      totals: {
        deduction_count: rows.length,
        deducted_total: rows.reduce(
          (sum, row) => EmployeeFinanceMoney.add(sum, row.deducted),
          '0.00',
        ),
        ...Object.fromEntries(
          Object.entries(byMonth).map(([month, value]) => [
            `month_${month}`,
            value,
          ]),
        ),
      },
      rows,
    };
  }

  private async outstanding(companyId: number, query: EmployeeFinanceQueryDto) {
    const active = await this.activeLoans(companyId, query);
    const accounts = await this.accountRepository.find({
      where: {
        companyId,
        accountNo: In(active.rows.map((row) => String(row.account_no))),
      },
    });
    const installments = await this.openInstallmentsByAccount(
      companyId,
      accounts.map((item) => item.id),
    );
    const byNo = new Map(
      accounts.map((account) => [account.accountNo, account]),
    );
    const today = todayString();
    const rows = active.rows.map((row) => {
      const account = byNo.get(String(row.account_no));
      const open = account ? (installments.get(account.id) ?? []) : [];
      const overdue = open.filter((item) => item.dueDate < today);
      const overdueCents = overdue.reduce(
        (sum, item) => sum + installmentRemainder(item).total,
        0n,
      );
      const oldest = overdue[0]?.dueDate ?? null;
      const days = oldest ? daysBetweenDates(oldest, today) : 0;
      return {
        ...row,
        overdue_amount: EmployeeFinanceMoney.fromCents(overdueCents),
        overdue_installments: overdue.length,
        days_overdue: days,
        aging_bucket:
          days === 0
            ? 'current'
            : days <= 30
              ? '1-30'
              : days <= 60
                ? '31-60'
                : days <= 90
                  ? '61-90'
                  : '90+',
      };
    });
    const overdueRows = rows.filter(
      (row) => Number(row.overdue_installments) > 0,
    );
    return {
      totals: {
        loan_count: rows.length,
        outstanding_total: active.totals.outstanding_total,
        overdue_loan_count: overdueRows.length,
        overdue_total: rows.reduce(
          (sum, row) =>
            EmployeeFinanceMoney.add(sum, String(row.overdue_amount)),
          '0.00',
        ),
      },
      rows,
    };
  }

  private async settledLoans(
    companyId: number,
    query: EmployeeFinanceQueryDto,
  ) {
    const accounts = await this.accountRepository.find({
      where: {
        companyId,
        status: In([
          EmployeeFinanceAccountStatusEnum.SETTLED,
          EmployeeFinanceAccountStatusEnum.WRITTEN_OFF,
        ]),
        ...(query.employee_id ? { employeeId: Number(query.employee_id) } : {}),
      },
      order: { id: 'ASC' },
    });
    const ledger = accounts.length
      ? await this.ledgerRepository.find({
          where: {
            companyId,
            accountId: In(accounts.map((account) => account.id)),
          },
          order: { id: 'ASC' },
        })
      : [];
    const people = await this.employees(
      companyId,
      accounts.map((account) => account.employeeId),
    );
    const rows = accounts
      .map((account) => {
        const entries = ledger.filter(
          (entry) => entry.accountId === account.id,
        );
        const last = entries[entries.length - 1];
        const sum = (types: EmployeeFinanceLedgerEntryTypeEnum[]) =>
          entries
            .filter((entry) => types.includes(entry.entryType))
            .reduce(
              (total, entry) =>
                EmployeeFinanceMoney.add(total, entry.totalAmount),
              '0.00',
            );
        const writtenOff = sum([
          EmployeeFinanceLedgerEntryTypeEnum.PRINCIPAL_WRITE_OFF,
        ]);
        const settlement = sum([
          EmployeeFinanceLedgerEntryTypeEnum.SETTLEMENT_REPAYMENT,
        ]);
        const closedBy =
          account.status === EmployeeFinanceAccountStatusEnum.WRITTEN_OFF
            ? 'WRITE_OFF'
            : entries.some((entry) => entry.sourceType === 'EXIT_RECOVERY')
              ? 'EXIT_RECOVERY'
              : EmployeeFinanceMoney.toCents(settlement) > 0n
                ? 'EARLY_SETTLEMENT'
                : 'FULL_REPAYMENT';
        return {
          account_no: account.accountNo,
          ...this.employeeColumns(people.get(account.employeeId)),
          product_type: account.productType,
          principal: account.principalAmount,
          payroll_repaid: sum([
            EmployeeFinanceLedgerEntryTypeEnum.PAYROLL_REPAYMENT,
          ]),
          direct_repaid: sum([
            EmployeeFinanceLedgerEntryTypeEnum.DIRECT_REPAYMENT,
            EmployeeFinanceLedgerEntryTypeEnum.ADDITIONAL_REPAYMENT,
          ]),
          settlement_paid: settlement,
          interest_waived: sum([
            EmployeeFinanceLedgerEntryTypeEnum.INTEREST_WAIVER,
          ]),
          fees_waived: sum([EmployeeFinanceLedgerEntryTypeEnum.FEE_WAIVER]),
          written_off: writtenOff,
          closed_by: closedBy,
          closed_on: last?.effectiveDate ?? null,
          status: account.status,
        };
      })
      .filter((row) => this.inRange(row.closed_on, query));
    return {
      totals: {
        loan_count: rows.length,
        written_off_total: rows.reduce(
          (sum, row) => EmployeeFinanceMoney.add(sum, row.written_off),
          '0.00',
        ),
        early_settlements: rows.filter(
          (row) => row.closed_by === 'EARLY_SETTLEMENT',
        ).length,
        exit_recoveries: rows.filter((row) => row.closed_by === 'EXIT_RECOVERY')
          .length,
      },
      rows,
    };
  }

  private async exitRecoveries(
    companyId: number,
    query: EmployeeFinanceQueryDto,
  ) {
    const recoveries = await this.exitRecoveryRepository.find({
      where: {
        companyId,
        ...(query.employee_id ? { employeeId: Number(query.employee_id) } : {}),
      },
      order: { id: 'DESC' },
    });
    const people = await this.employees(
      companyId,
      recoveries.map((item) => item.employeeId),
    );
    const rows = recoveries.map((item) => ({
      offboarding_request_id: item.offboardingRequestId,
      ...this.employeeColumns(people.get(item.employeeId)),
      account_no: textValue(recordValue(item.snapshot).account_no),
      to_recover: item.recoveryAmount,
      recovered: item.recoveredAmount,
      remaining: EmployeeFinanceMoney.subtract(
        item.recoveryAmount,
        item.recoveredAmount,
      ),
      interest_rebated: textValue(
        recordValue(item.snapshot).unearned_interest_rebate,
        '0.00',
      ),
      status: item.status,
      recovered_on: item.recoveredAt
        ? item.recoveredAt.toISOString().slice(0, 10)
        : null,
    }));
    return {
      totals: {
        recovery_count: rows.length,
        to_recover_total: rows.reduce(
          (sum, row) => EmployeeFinanceMoney.add(sum, row.to_recover),
          '0.00',
        ),
        recovered_total: rows.reduce(
          (sum, row) => EmployeeFinanceMoney.add(sum, row.recovered),
          '0.00',
        ),
        remaining_total: rows.reduce(
          (sum, row) => EmployeeFinanceMoney.add(sum, row.remaining),
          '0.00',
        ),
      },
      rows,
    };
  }

  /**
   * Exports any loan report (the FRS reports above or the operational ones
   * such as aging) as Excel or CSV, and records the export in the audit log.
   */
  async export(
    actor: AuthenticatedUser,
    reportType: string,
    query: EmployeeFinanceQueryDto,
    format: string,
  ) {
    const type = reportType.trim().toLowerCase();
    const isLoanReport = EMPLOYEE_FINANCE_LOAN_REPORTS.some(
      (item) => item.type === type,
    );
    const report = isLoanReport
      ? await this.report(actor, type, query)
      : (recordValue(
          await this.coreReports.report(actor, type, query),
        ) as unknown as LoanReport);
    const rows = (Array.isArray(report.rows) ? report.rows : []).map((row) =>
      Object.fromEntries(
        Object.entries(recordValue(row)).map(([key, value]) => [
          key,
          value === null || value === undefined
            ? ''
            : typeof value === 'object'
              ? JSON.stringify(value)
              : (value as string | number | boolean),
        ]),
      ),
    );
    const headers = Array.from(
      new Set(rows.flatMap((row) => Object.keys(row))),
    );
    const stamp = todayString();
    await this.auditService.log({
      actor,
      action: 'finance.report.exported',
      entityType: 'EMPLOYEE_FINANCE_REPORT',
      entityId: type,
      summary: { format, row_count: rows.length, filters: { ...query } },
    });
    if (format === 'csv') {
      const escape = (value: string | number | boolean | null | undefined) =>
        `"${String(value ?? '').replace(/"/g, '""')}"`;
      const csv = [
        headers.map(escape).join(','),
        ...rows.map((row) =>
          headers.map((header) => escape(row[header])).join(','),
        ),
      ].join('\r\n');
      return {
        buffer: Buffer.from(`\uFEFF${csv}`, 'utf8'),
        fileName: `loan-${type}-${stamp}.csv`,
        contentType: 'text/csv; charset=utf-8',
      };
    }
    if (format !== 'xlsx') {
      throw new BadRequestException('Format must be xlsx or csv.');
    }
    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(type.slice(0, 31));
    sheet.addRow([report.title ?? type]).font = { bold: true, size: 13 };
    sheet.addRow([
      `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    ]);
    sheet.addRow([]);
    const headerRow = sheet.addRow(
      headers.map((header) => header.replace(/_/g, ' ')),
    );
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE7ECF4' },
    };
    for (const row of rows) sheet.addRow(headers.map((header) => row[header]));
    sheet.columns.forEach((column) => {
      column.width = 18;
    });
    sheet.views = [{ state: 'frozen', ySplit: 4 }];
    const totals = recordValue(report.totals);
    if (Object.keys(totals).length) {
      const summary = workbook.addWorksheet('Totals');
      summary.addRow(['Measure', 'Value']).font = { bold: true };
      for (const [key, value] of Object.entries(totals)) {
        summary.addRow([
          key.replace(/_/g, ' '),
          typeof value === 'object' ? JSON.stringify(value) : (value as string),
        ]);
      }
      summary.getColumn(1).width = 32;
      summary.getColumn(2).width = 20;
    }
    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      fileName: `loan-${type}-${stamp}.xlsx`,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  /**
   * Loan statement for an employee (own loans only) or for Finance, as a
   * PDF or Excel file (FRS 12.2.10).
   */
  async statement(
    actor: AuthenticatedUser,
    accountId: number,
    format: string,
    options: { selfService?: boolean } = {},
  ) {
    const statement = await this.accountService.getStatement(actor, accountId);
    const account = statement.account;
    if (options.selfService && account.employeeId !== actor.employeeId) {
      throw new ForbiddenException(
        'You can only download your own loan statement.',
      );
    }
    const employee = await this.employeeRepository.findOne({
      where: { id: account.employeeId, company_id: account.companyId },
    });
    const employeeName = employee
      ? [employee.first_name, employee.last_name].filter(Boolean).join(' ')
      : String(account.employeeId);
    const installments = [...statement.installments].sort((a, b) =>
      a.scheduleVersion === b.scheduleVersion
        ? a.dueDate.localeCompare(b.dueDate)
        : a.scheduleVersion - b.scheduleVersion,
    );
    const ledger = statement.ledger;
    await this.auditService.log({
      actor,
      companyId: account.companyId,
      action: 'finance.statement.downloaded',
      entityType: 'EMPLOYEE_FINANCE_ACCOUNT',
      entityId: account.id,
      summary: { format },
    });
    const fileBase = `loan-statement-${account.accountNo}-${todayString()}`;
    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const summary = workbook.addWorksheet('Summary');
      for (const [label, value] of [
        ['Account', account.accountNo],
        ['Employee', `${employeeName} (${employee?.employee_no ?? ''})`],
        ['Product', account.productType],
        ['Principal', account.principalAmount],
        ['Interest', account.interestAmount],
        ['Fees', account.feeAmount],
        ['Total payable', account.totalPayable],
        ['Outstanding', account.outstandingTotal],
        ['Monthly instalment', account.scheduledMonthlyInstallment],
        ['Status', account.status],
        ['Statement date', todayString()],
      ]) {
        summary.addRow([label, value]);
      }
      summary.getColumn(1).width = 22;
      summary.getColumn(2).width = 30;
      const schedule = workbook.addWorksheet('Schedule');
      schedule.addRow([
        'Version',
        'No.',
        'Due date',
        'Original due',
        'Principal',
        'Interest',
        'Fees',
        'Total due',
        'Paid',
        'Status',
      ]).font = { bold: true };
      for (const item of installments) {
        schedule.addRow([
          item.scheduleVersion,
          item.installmentNumber,
          item.dueDate,
          item.originalDueDate ?? '',
          item.principalDue,
          item.interestDue,
          item.feeDue,
          item.totalDue,
          item.paidAmount,
          item.status,
        ]);
      }
      const ledgerSheet = workbook.addWorksheet('Transactions');
      ledgerSheet.addRow([
        'Date',
        'Type',
        'Direction',
        'Principal',
        'Interest',
        'Fees',
        'Amount',
        'Balance after',
        'Reference',
      ]).font = { bold: true };
      for (const entry of ledger) {
        ledgerSheet.addRow([
          entry.effectiveDate,
          entry.entryType,
          entry.direction,
          entry.principalAmount,
          entry.interestAmount,
          entry.feeAmount,
          entry.totalAmount,
          textValue(recordValue(entry.balanceSnapshot).outstanding_total),
          `${entry.sourceType}${entry.sourceId ? ` ${entry.sourceId}` : ''}`,
        ]);
      }
      [schedule, ledgerSheet].forEach((sheet) =>
        sheet.columns.forEach((column) => (column.width = 15)),
      );
      return {
        buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
        fileName: `${fileBase}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }
    if (format !== 'pdf') {
      throw new BadRequestException('Format must be pdf or xlsx.');
    }
    const document = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve, reject) => {
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });
    document
      .fontSize(15)
      .font('Helvetica-Bold')
      .text(actor.companyName ?? 'Loan statement');
    document
      .fontSize(11)
      .font('Helvetica')
      .text(`Loan statement as at ${todayString()}`);
    document.moveDown(0.6);
    const facts: Array<[string, string]> = [
      ['Account', account.accountNo],
      ['Employee', `${employeeName} (${employee?.employee_no ?? ''})`],
      [
        'Product',
        account.productType === EmployeeFinanceProductTypeEnum.SALARY_ADVANCE
          ? 'Salary advance'
          : 'Staff loan',
      ],
      ['Principal', formatMoney(account.principalAmount)],
      [
        'Interest / fees',
        `${formatMoney(account.interestAmount)} / ${formatMoney(account.feeAmount)}`,
      ],
      ['Total payable', formatMoney(account.totalPayable)],
      ['Outstanding', formatMoney(account.outstandingTotal)],
      ['Monthly instalment', formatMoney(account.scheduledMonthlyInstallment)],
      ['Status', account.status.replace(/_/g, ' ').toLowerCase()],
    ];
    document.fontSize(9);
    for (const [label, value] of facts) {
      document
        .font('Helvetica-Bold')
        .text(`${label}: `, { continued: true })
        .font('Helvetica')
        .text(value);
    }
    const table = (
      title: string,
      headers: string[],
      widths: number[],
      rows: string[][],
    ) => {
      document
        .moveDown(0.8)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(title, 40);
      document.moveDown(0.2).fontSize(8);
      const drawRow = (cells: string[], bold: boolean) => {
        if (document.y > 770) document.addPage();
        const y = document.y;
        let x = 40;
        document.font(bold ? 'Helvetica-Bold' : 'Helvetica');
        cells.forEach((cell, index) => {
          document.text(cell, x, y, {
            width: widths[index] - 4,
            lineBreak: false,
          });
          x += widths[index];
        });
        document.y = y + 12;
      };
      drawRow(headers, true);
      rows.forEach((row) => drawRow(row, false));
    };
    table(
      'Repayment schedule',
      [
        'No.',
        'Due',
        'Principal',
        'Interest',
        'Fees',
        'Total',
        'Paid',
        'Status',
      ],
      [30, 62, 70, 62, 52, 70, 70, 99],
      installments
        .filter(
          (item) =>
            item.status !== EmployeeFinanceInstallmentStatusEnum.CANCELLED,
        )
        .map((item) => [
          String(item.installmentNumber),
          item.dueDate,
          formatMoney(item.principalDue),
          formatMoney(item.interestDue),
          formatMoney(item.feeDue),
          formatMoney(item.totalDue),
          formatMoney(item.paidAmount),
          item.status.replace(/_/g, ' ').toLowerCase(),
        ]),
    );
    table(
      'Transactions',
      ['Date', 'Type', 'Debit', 'Credit', 'Balance'],
      [62, 190, 80, 80, 103],
      ledger.map((entry) => [
        entry.effectiveDate,
        entry.entryType.replace(/_/g, ' ').toLowerCase(),
        entry.direction === 'DEBIT' ? formatMoney(entry.totalAmount) : '',
        entry.direction === 'CREDIT' ? formatMoney(entry.totalAmount) : '',
        formatMoney(
          textValue(recordValue(entry.balanceSnapshot).outstanding_total, '0'),
        ),
      ]),
    );
    document.end();
    return {
      buffer: await finished,
      fileName: `${fileBase}.pdf`,
      contentType: 'application/pdf',
    };
  }
}
