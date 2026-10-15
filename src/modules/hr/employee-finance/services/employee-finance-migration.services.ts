import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import { DataSource, In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { Base64FileDto } from '../../../files/dtos/base64-file.dto';
import {
  EmployeeFinanceAccount,
  EmployeeFinanceAuditLog,
  EmployeeFinanceInstallment,
  EmployeeFinanceLedgerEntry,
} from '../entities/employee-finance-account.entities';
import {
  EmployeeFinanceApplication,
  EmployeeFinanceApplicationGuarantor,
} from '../entities/employee-finance-application.entities';
import { EmployeeFinanceProduct } from '../entities/employee-finance-product.entities';
import {
  EmployeeFinanceAccountStatusEnum,
  EmployeeFinanceApplicationStatusEnum,
  EmployeeFinanceLedgerEntryTypeEnum,
} from '../employee-finance.enums';
import {
  actorMembershipId,
  addMonths,
  hash,
  textValue,
  todayString,
} from '../employee-finance.utils';
import { EmployeeFinanceAuditService } from './employee-finance-core.services';
import { EmployeeFinanceMoney } from './employee-finance-money.util';

/** Columns of the loan migration template, in order. */
export const LOAN_MIGRATION_COLUMNS = [
  {
    key: 'employee_no',
    label: 'Employee number',
    required: true,
    example: 'EMP-0001',
  },
  {
    key: 'product_code',
    label: 'Product code',
    required: true,
    example: 'STAFF-LOAN',
  },
  {
    key: 'loan_reference',
    label: 'Existing loan reference',
    required: true,
    example: 'OLD-2025-0147',
  },
  {
    key: 'principal_amount',
    label: 'Original principal',
    required: true,
    example: '3000000',
  },
  {
    key: 'disbursed_on',
    label: 'Disbursed on (YYYY-MM-DD)',
    required: true,
    example: '2025-11-15',
  },
  {
    key: 'annual_interest_rate',
    label: 'Annual interest %',
    required: false,
    example: '12',
  },
  {
    key: 'outstanding_principal',
    label: 'Outstanding principal at cut-over',
    required: true,
    example: '2000000',
  },
  {
    key: 'outstanding_interest',
    label: 'Outstanding interest at cut-over',
    required: false,
    example: '120000',
  },
  {
    key: 'outstanding_fees',
    label: 'Outstanding fees at cut-over',
    required: false,
    example: '0',
  },
  {
    key: 'monthly_installment',
    label: 'Current monthly instalment',
    required: true,
    example: '265000',
  },
  {
    key: 'remaining_installments',
    label: 'Instalments remaining',
    required: true,
    example: '8',
  },
  {
    key: 'next_due_date',
    label: 'Next due date (YYYY-MM-DD)',
    required: true,
    example: '2026-11-28',
  },
  {
    key: 'guarantor_employee_nos',
    label: 'Guarantor employee numbers (comma separated)',
    required: false,
    example: 'EMP-0002',
  },
  { key: 'notes', label: 'Notes', required: false, example: '' },
] as const;

type RowKey = (typeof LOAN_MIGRATION_COLUMNS)[number]['key'];
type MigrationRow = Record<RowKey, string>;

type ValidatedRow = {
  row_number: number;
  loan_reference: string;
  employee_no: string;
  errors: string[];
  warnings: string[];
  plan?: {
    employee: Employee;
    product: EmployeeFinanceProduct;
    guarantors: Employee[];
    principal: string;
    outstandingPrincipal: string;
    outstandingInterest: string;
    outstandingFees: string;
    outstandingTotal: string;
    remaining: number;
    nextDueDate: string;
    disbursedOn: string;
    rate: string;
    installments: Array<{
      number: number;
      dueDate: string;
      principal: string;
      interest: string;
      fee: string;
      total: string;
    }>;
  };
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function split(totalCents: bigint, parts: number) {
  const base = totalCents / BigInt(parts);
  return Array.from({ length: parts }, (_, index) =>
    index === parts - 1 ? totalCents - base * BigInt(parts - 1) : base,
  );
}

@Injectable()
export class EmployeeFinanceMigrationService {
  constructor(
    private readonly configService: ConfigService,
    private readonly auditService: EmployeeFinanceAuditService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeFinanceProduct)
    private readonly productRepository: Repository<EmployeeFinanceProduct>,
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceAuditLog)
    private readonly auditRepository: Repository<EmployeeFinanceAuditLog>,
  ) {}

  async template() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Loans');
    sheet.addRow(LOAN_MIGRATION_COLUMNS.map((column) => column.key)).font = {
      bold: true,
    };
    sheet.addRow(LOAN_MIGRATION_COLUMNS.map((column) => column.example));
    sheet.columns.forEach((column) => (column.width = 22));
    const guide = workbook.addWorksheet('Instructions');
    guide.addRow(['Column', 'Meaning', 'Required']).font = { bold: true };
    for (const column of LOAN_MIGRATION_COLUMNS) {
      guide.addRow([column.key, column.label, column.required ? 'Yes' : 'No']);
    }
    guide.addRow([]);
    for (const line of [
      'One row per loan still being repaid on the cut-over date. Fully repaid loans do not need migrating.',
      'Amounts are in the payroll currency, without thousands separators.',
      'Outstanding amounts must match the old system on the cut-over date; the import creates an opening balance and spreads it over the remaining instalments.',
      'Delete the example row before uploading. Run a dry run first: nothing is saved until every row passes.',
    ]) {
      guide.addRow([line]);
    }
    guide.getColumn(1).width = 28;
    guide.getColumn(2).width = 60;
    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      fileName: 'staff-loan-migration-template.xlsx',
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  private async parse(file: Base64FileDto): Promise<MigrationRow[]> {
    const buffer = Buffer.from(file.fileString, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      throw new BadRequestException('The file is larger than 5 MB.');
    }
    const name = file.fileName.toLowerCase();
    let table: string[][] = [];
    if (name.endsWith('.xlsx')) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      const sheet = workbook.worksheets[0];
      sheet?.eachRow({ includeEmpty: false }, (row) => {
        const values: string[] = [];
        for (
          let index = 1;
          index <= LOAN_MIGRATION_COLUMNS.length + 5;
          index += 1
        ) {
          const cell = row.getCell(index).value;
          values.push(
            cell instanceof Date
              ? cell.toISOString().slice(0, 10)
              : typeof cell === 'object' && cell !== null && 'text' in cell
                ? textValue((cell as { text?: unknown }).text)
                : typeof cell === 'object' && cell !== null && 'result' in cell
                  ? textValue((cell as { result?: unknown }).result)
                  : textValue(cell),
          );
        }
        table.push(values);
      });
    } else if (name.endsWith('.csv')) {
      table = buffer
        .toString('utf8')
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => {
          const cells: string[] = [];
          let current = '';
          let quoted = false;
          for (let index = 0; index < line.length; index += 1) {
            const char = line[index];
            if (char === '"' && line[index + 1] === '"' && quoted) {
              current += '"';
              index += 1;
            } else if (char === '"') {
              quoted = !quoted;
            } else if (char === ',' && !quoted) {
              cells.push(current);
              current = '';
            } else {
              current += char;
            }
          }
          cells.push(current);
          return cells;
        });
    } else {
      throw new BadRequestException('Upload the template as .xlsx or .csv.');
    }
    const [header, ...body] = table;
    if (!header) throw new BadRequestException('The file is empty.');
    const index = new Map(
      header.map((value, position) => [value.trim().toLowerCase(), position]),
    );
    const missing = LOAN_MIGRATION_COLUMNS.filter(
      (column) => column.required && !index.has(column.key),
    ).map((column) => column.key);
    if (missing.length) {
      throw new BadRequestException(
        `Missing template columns: ${missing.join(', ')}.`,
      );
    }
    return body
      .filter((cells) => cells.some((cell) => cell.trim()))
      .map(
        (cells) =>
          Object.fromEntries(
            LOAN_MIGRATION_COLUMNS.map((column) => [
              column.key,
              (cells[index.get(column.key) ?? -1] ?? '').trim(),
            ]),
          ) as MigrationRow,
      );
  }

  private async validate(companyId: number, rows: MigrationRow[]) {
    const employeeNos = Array.from(
      new Set(
        rows.flatMap((row) => [
          row.employee_no,
          ...row.guarantor_employee_nos
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        ]),
      ),
    ).filter(Boolean);
    const employees = employeeNos.length
      ? await this.employeeRepository.find({
          where: { company_id: companyId, employee_no: In(employeeNos) },
        })
      : [];
    const employeeByNo = new Map(
      employees.map((item) => [item.employee_no, item]),
    );
    const products = await this.productRepository.find({
      where: { companyId },
      order: { versionNumber: 'DESC' },
    });
    const productByCode = new Map<string, EmployeeFinanceProduct>();
    for (const product of products) {
      if (!productByCode.has(product.code))
        productByCode.set(product.code, product);
    }
    const references = rows.map((row) => row.loan_reference).filter(Boolean);
    const existing = references.length
      ? await this.accountRepository
          .createQueryBuilder('account')
          .select(
            "account.agreementSnapshot ->> 'external_reference'",
            'reference',
          )
          .where('account.companyId = :companyId', { companyId })
          .andWhere(
            "account.agreementSnapshot ->> 'external_reference' IN (:...references)",
            {
              references,
            },
          )
          .getRawMany<{ reference: string }>()
      : [];
    const alreadyMigrated = new Set(existing.map((row) => row.reference));
    const seen = new Set<string>();
    const repaymentDay = this.configService.get<number>(
      'EMPLOYEE_FINANCE_DEFAULT_REPAYMENT_DAY',
      28,
    );
    return rows.map((row, position): ValidatedRow => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const result: ValidatedRow = {
        row_number: position + 2,
        loan_reference: row.loan_reference,
        employee_no: row.employee_no,
        errors,
        warnings,
      };
      for (const column of LOAN_MIGRATION_COLUMNS) {
        if (column.required && !row[column.key])
          errors.push(`${column.key} is required.`);
      }
      if (row.loan_reference) {
        if (seen.has(row.loan_reference))
          errors.push('Loan reference appears twice in the file.');
        if (alreadyMigrated.has(row.loan_reference))
          errors.push('This loan was already migrated.');
        seen.add(row.loan_reference);
      }
      const employee = employeeByNo.get(row.employee_no);
      if (row.employee_no && !employee)
        errors.push(`Employee ${row.employee_no} not found.`);
      const product = productByCode.get(row.product_code.toUpperCase());
      if (row.product_code && !product)
        errors.push(`Product ${row.product_code} not found.`);
      const money = (key: RowKey, allowZero = true) => {
        const raw = row[key] || '0';
        if (!/^-?\d+(\.\d{1,2})?$/.test(raw.replace(/,/g, ''))) {
          errors.push(`${key} must be a number with at most 2 decimals.`);
          return 0n;
        }
        const cents = EmployeeFinanceMoney.toCents(raw.replace(/,/g, ''));
        if (cents < 0n || (!allowZero && cents === 0n)) {
          errors.push(
            `${key} must be ${allowZero ? 'zero or more' : 'above zero'}.`,
          );
        }
        return cents;
      };
      const principal = money('principal_amount', false);
      const outstandingPrincipal = money('outstanding_principal', false);
      const outstandingInterest = money('outstanding_interest');
      const outstandingFees = money('outstanding_fees');
      const monthly = money('monthly_installment', false);
      if (outstandingPrincipal > principal) {
        errors.push(
          'Outstanding principal is more than the original principal.',
        );
      }
      const remaining = Number(row.remaining_installments);
      if (!Number.isInteger(remaining) || remaining < 1 || remaining > 360) {
        errors.push(
          'remaining_installments must be a whole number from 1 to 360.',
        );
      }
      for (const key of ['disbursed_on', 'next_due_date'] as const) {
        if (row[key] && !ISO_DATE.test(row[key]))
          errors.push(`${key} must be YYYY-MM-DD.`);
      }
      if (
        row.next_due_date &&
        row.disbursed_on &&
        row.next_due_date <= row.disbursed_on
      ) {
        errors.push('next_due_date must be after disbursed_on.');
      }
      if (row.next_due_date && row.next_due_date < todayString()) {
        warnings.push(
          'next_due_date is in the past; the overdue job will flag it as overdue.',
        );
      }
      const guarantorNos = row.guarantor_employee_nos
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const guarantors = guarantorNos
        .map((number) => {
          const guarantor = employeeByNo.get(number);
          if (!guarantor) errors.push(`Guarantor ${number} not found.`);
          return guarantor;
        })
        .filter((item): item is Employee => Boolean(item));
      if (errors.length || !employee || !product) return result;
      const outstandingTotal =
        outstandingPrincipal + outstandingInterest + outstandingFees;
      const principalParts = split(outstandingPrincipal, remaining);
      const interestParts = split(outstandingInterest, remaining);
      const installments = principalParts.map((principalPart, index) => {
        const fee = index === 0 ? outstandingFees : 0n;
        return {
          number: index + 1,
          dueDate: addMonths(
            row.next_due_date,
            index,
            Number(row.next_due_date.slice(8, 10)) || repaymentDay,
          ),
          principal: EmployeeFinanceMoney.fromCents(principalPart),
          interest: EmployeeFinanceMoney.fromCents(interestParts[index]),
          fee: EmployeeFinanceMoney.fromCents(fee),
          total: EmployeeFinanceMoney.fromCents(
            principalPart + interestParts[index] + fee,
          ),
        };
      });
      const regular = EmployeeFinanceMoney.toCents(
        installments[installments.length > 1 ? 1 : 0].total,
      );
      const gap = regular > monthly ? regular - monthly : monthly - regular;
      if (gap > 100n) {
        warnings.push(
          `The spread instalment (${EmployeeFinanceMoney.fromCents(regular)}) differs from the stated monthly instalment (${EmployeeFinanceMoney.fromCents(monthly)}). Check the outstanding amounts and instalments remaining.`,
        );
      }
      result.plan = {
        employee,
        product,
        guarantors,
        principal: EmployeeFinanceMoney.fromCents(principal),
        outstandingPrincipal:
          EmployeeFinanceMoney.fromCents(outstandingPrincipal),
        outstandingInterest:
          EmployeeFinanceMoney.fromCents(outstandingInterest),
        outstandingFees: EmployeeFinanceMoney.fromCents(outstandingFees),
        outstandingTotal: EmployeeFinanceMoney.fromCents(outstandingTotal),
        remaining,
        nextDueDate: row.next_due_date,
        disbursedOn: row.disbursed_on,
        rate: row.annual_interest_rate || product.annualInterestRate || '0',
        installments,
      };
      return result;
    });
  }

  /**
   * Validates a migration file and, when dry_run is false and every row
   * passes, opens all loans in one transaction. Nothing is saved if any row
   * fails.
   */
  async import(
    actor: AuthenticatedUser,
    dto: { file: Base64FileDto; dry_run?: boolean; cutover_date?: string },
  ) {
    const companyId = actor.companyId!;
    const rows = await this.parse(dto.file);
    if (!rows.length)
      throw new BadRequestException('The file has no loan rows.');
    if (rows.length > 5000)
      throw new BadRequestException('Import at most 5,000 loans per file.');
    const validated = await this.validate(companyId, rows);
    const errorRows = validated.filter((row) => row.errors.length);
    const totals = {
      loan_count: validated.length,
      valid_count: validated.length - errorRows.length,
      error_count: errorRows.length,
      warning_count: validated.filter((row) => row.warnings.length).length,
      outstanding_principal: validated.reduce(
        (sum, row) =>
          EmployeeFinanceMoney.add(sum, row.plan?.outstandingPrincipal ?? '0'),
        '0.00',
      ),
      outstanding_interest: validated.reduce(
        (sum, row) =>
          EmployeeFinanceMoney.add(sum, row.plan?.outstandingInterest ?? '0'),
        '0.00',
      ),
      outstanding_fees: validated.reduce(
        (sum, row) =>
          EmployeeFinanceMoney.add(sum, row.plan?.outstandingFees ?? '0'),
        '0.00',
      ),
      outstanding_total: validated.reduce(
        (sum, row) =>
          EmployeeFinanceMoney.add(sum, row.plan?.outstandingTotal ?? '0'),
        '0.00',
      ),
    };
    const report = validated.map((row) => ({
      row_number: row.row_number,
      loan_reference: row.loan_reference,
      employee_no: row.employee_no,
      outstanding_total: row.plan?.outstandingTotal ?? null,
      first_due_date: row.plan?.installments[0]?.dueDate ?? null,
      errors: row.errors,
      warnings: row.warnings,
    }));
    const dryRun = dto.dry_run !== false;
    if (dryRun || errorRows.length) {
      return { dry_run: dryRun, committed: false, totals, rows: report };
    }
    const batchId = `MIG-${companyId}-${Date.now()}`;
    const cutover = dto.cutover_date || todayString();
    const performer = actorMembershipId(actor);
    const accountIds = await this.dataSource.transaction(async (manager) => {
      const ids: number[] = [];
      for (const row of validated) {
        const plan = row.plan!;
        const productSnapshot = { ...plan.product, migrated: true };
        const application = await manager
          .getRepository(EmployeeFinanceApplication)
          .save(
            manager.getRepository(EmployeeFinanceApplication).create({
              companyId,
              employeeId: plan.employee.id,
              productId: plan.product.id,
              applicationNo: `EFMIG-${companyId}-${row.loan_reference}`.slice(
                0,
                60,
              ),
              productType: plan.product.productType,
              status: EmployeeFinanceApplicationStatusEnum.DISBURSED,
              requestedAmount: plan.principal,
              requestedTermMonths: plan.remaining,
              purpose: `Migrated loan ${row.loan_reference}`,
              approvedAmount: plan.principal,
              approvedTermMonths: plan.remaining,
              approvedInterestRate: plan.rate,
              estimatedInstallment:
                plan.installments[plan.installments.length > 1 ? 1 : 0].total,
              eligibilitySnapshot: { migrated: true },
              eligibilitySnapshotHash: hash({ migrated: row.loan_reference }),
              productSnapshot,
              productSnapshotHash: hash(productSnapshot),
              employeeSnapshot: {
                id: plan.employee.id,
                employee_no: plan.employee.employee_no,
                full_name: [plan.employee.first_name, plan.employee.last_name]
                  .filter(Boolean)
                  .join(' '),
              },
              submittedAt: new Date(`${plan.disbursedOn}T00:00:00.000Z`),
              approvedAt: new Date(`${plan.disbursedOn}T00:00:00.000Z`),
              employeeAcceptedAt: new Date(`${plan.disbursedOn}T00:00:00.000Z`),
              createdByCompanyUserId: performer,
              metadata: {
                migration_batch: batchId,
                external_reference: row.loan_reference,
              },
            }),
          );
        const account = await manager
          .getRepository(EmployeeFinanceAccount)
          .save(
            manager.getRepository(EmployeeFinanceAccount).create({
              companyId,
              employeeId: plan.employee.id,
              applicationId: application.id,
              productId: plan.product.id,
              accountNo: `EF-${companyId}-M-${row.loan_reference}`.slice(0, 60),
              productType: plan.product.productType,
              status: EmployeeFinanceAccountStatusEnum.ACTIVE,
              principalAmount: plan.principal,
              interestAmount: plan.outstandingInterest,
              feeAmount: plan.outstandingFees,
              totalPayable: plan.outstandingTotal,
              outstandingPrincipal: plan.outstandingPrincipal,
              outstandingInterest: plan.outstandingInterest,
              outstandingFees: plan.outstandingFees,
              outstandingTotal: plan.outstandingTotal,
              scheduledMonthlyInstallment:
                plan.installments[plan.installments.length > 1 ? 1 : 0].total,
              termMonths: plan.remaining,
              interestRate: plan.rate,
              disbursedAt: new Date(`${plan.disbursedOn}T00:00:00.000Z`),
              firstRepaymentDate: plan.installments[0].dueDate,
              maturityDate:
                plan.installments[plan.installments.length - 1].dueDate,
              productSnapshot,
              agreementSnapshot: {
                migrated: true,
                migration_batch: batchId,
                external_reference: row.loan_reference,
                cutover_date: cutover,
                original_principal: plan.principal,
              },
            }),
          );
        await manager.getRepository(EmployeeFinanceInstallment).save(
          plan.installments.map((item) =>
            manager.getRepository(EmployeeFinanceInstallment).create({
              companyId,
              accountId: account.id,
              employeeId: plan.employee.id,
              scheduleVersion: 1,
              installmentNumber: item.number,
              dueDate: item.dueDate,
              originalDueDate: item.dueDate,
              principalDue: item.principal,
              interestDue: item.interest,
              feeDue: item.fee,
              totalDue: item.total,
            }),
          ),
        );
        await manager.getRepository(EmployeeFinanceLedgerEntry).save(
          manager.getRepository(EmployeeFinanceLedgerEntry).create({
            companyId,
            accountId: account.id,
            installmentId: null,
            entryType: EmployeeFinanceLedgerEntryTypeEnum.ADJUSTMENT_DEBIT,
            direction: 'DEBIT',
            principalAmount: plan.outstandingPrincipal,
            interestAmount: plan.outstandingInterest,
            feeAmount: plan.outstandingFees,
            totalAmount: plan.outstandingTotal,
            effectiveDate: cutover,
            postedAt: new Date(),
            sourceType: 'MIGRATION',
            sourceId: batchId,
            idempotencyKey: `migration:${companyId}:${row.loan_reference}`,
            reversesEntryId: null,
            description: `Opening balance migrated from ${row.loan_reference}`,
            balanceSnapshot: {
              outstanding_principal: plan.outstandingPrincipal,
              outstanding_interest: plan.outstandingInterest,
              outstanding_fees: plan.outstandingFees,
              outstanding_total: plan.outstandingTotal,
            },
            postedByCompanyUserId: performer,
          }),
        );
        for (const guarantor of plan.guarantors) {
          await manager.getRepository(EmployeeFinanceApplicationGuarantor).save(
            manager.getRepository(EmployeeFinanceApplicationGuarantor).create({
              companyId,
              applicationId: application.id,
              employeeId: plan.employee.id,
              guarantorEmployeeId: guarantor.id,
              status: 'APPROVED',
              comments: 'Migrated guarantee',
              snapshot: { employee_no: guarantor.employee_no, migrated: true },
            }),
          );
        }
        ids.push(account.id);
      }
      return ids;
    });
    await this.auditService.log({
      actor,
      action: 'finance.migration.imported',
      entityType: 'EMPLOYEE_FINANCE_MIGRATION_BATCH',
      entityId: batchId,
      summary: {
        ...totals,
        cutover_date: cutover,
        account_ids: accountIds,
        file_name: dto.file.fileName,
      },
    });
    return {
      dry_run: false,
      committed: true,
      batch_id: batchId,
      totals,
      rows: report,
    };
  }

  async listBatches(actor: AuthenticatedUser) {
    const logs = await this.auditRepository.find({
      where: {
        companyId: actor.companyId!,
        entityType: 'EMPLOYEE_FINANCE_MIGRATION_BATCH',
      },
      order: { id: 'ASC' },
    });
    const batches = new Map<string, Record<string, unknown>>();
    for (const log of logs) {
      const current = batches.get(log.entityId) ?? { batch_id: log.entityId };
      if (log.action === 'finance.migration.imported') {
        Object.assign(current, {
          imported_at: log.createdAt,
          imported_by: log.actorCompanyUserId,
          summary: log.summary,
        });
      }
      if (log.action === 'finance.migration.signed_off') {
        Object.assign(current, {
          signed_off_at: log.createdAt,
          signed_off_by: log.actorCompanyUserId,
          sign_off: log.summary,
        });
      }
      batches.set(log.entityId, current);
    }
    return Array.from(batches.values()).reverse();
  }

  /**
   * Finance confirms the migrated balances match the old system. The person
   * who imported a batch cannot sign it off.
   */
  async signOff(actor: AuthenticatedUser, batchId: string, comments?: string) {
    const batch = (await this.listBatches(actor)).find(
      (item) => item.batch_id === batchId,
    );
    if (!batch?.imported_at)
      throw new BadRequestException('Migration batch not found.');
    if (batch.signed_off_at)
      throw new ConflictException('This batch is already signed off.');
    if (batch.imported_by === actorMembershipId(actor)) {
      throw new ForbiddenException(
        'The person who imported a batch cannot sign it off.',
      );
    }
    await this.auditService.log({
      actor,
      action: 'finance.migration.signed_off',
      entityType: 'EMPLOYEE_FINANCE_MIGRATION_BATCH',
      entityId: batchId,
      summary: { comments: comments?.trim() || null },
    });
    return { batch_id: batchId, signed_off: true };
  }
}
