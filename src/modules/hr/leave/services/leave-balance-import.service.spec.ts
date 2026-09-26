import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ExcelJS from 'exceljs';
import { DataSource, FindOperator, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { PERMISSIONS_KEY } from '../../../../common/decorators/permissions.decorator';
import { AttendanceDailySummary } from '../../attendance/processing/entities/attendance-daily-summary.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { HrAccessService } from '../../shared/hr-access.service';
import { LeaveAuditLog } from '../entities/leave-audit-log.entity';
import { LeaveBalanceAdjustment } from '../entities/leave-balance-adjustment.entity';
import { LeaveBalanceImportBatch } from '../entities/leave-balance-import-batch.entity';
import { LeaveBalanceImportRow } from '../entities/leave-balance-import-row.entity';
import { LeaveBalanceTransaction } from '../entities/leave-balance-transaction.entity';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeavePolicy } from '../entities/leave-policy.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveType } from '../entities/leave-type.entity';
import { LeaveBalanceAdjustmentSourceEnum } from '../enums/leave-balance-adjustment-source.enum';
import { LeaveBalanceImportBatchStatusEnum } from '../enums/leave-balance-import-batch-status.enum';
import { LeaveBalanceImportModeEnum } from '../enums/leave-balance-import-mode.enum';
import { LeaveGenderRestrictionEnum } from '../enums/leave-gender-restriction.enum';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';
import { LeaveBalanceTransactionTypeEnum } from '../enums/leave-balance-transaction-type.enum';
import { LeaveController } from '../leave.controller';
import { calculateAvailableLeaveDays } from '../utils/leave-balance-rules.util';
import { LeaveAuditService } from './leave-audit.service';
import { LeaveBalanceImportService } from './leave-balance-import.service';
import { LeaveBalanceImportJobData } from './leave-balance-import-job.constants';
import { LeaveBalanceLedgerService } from './leave-balance-ledger.service';
import { LeaveBalanceService } from './leave-balance.service';

// ---------------------------------------------------------------------------
// In-memory persistence with real transaction rollback semantics
// ---------------------------------------------------------------------------

type Row = Record<string, any>;
type EntityClass = abstract new (...args: never[]) => unknown;

class MemoryDatabase {
  tables = new Map<EntityClass, Row[]>();
  sequences = new Map<EntityClass, number>();

  table(entity: EntityClass): Row[] {
    if (!this.tables.has(entity)) {
      this.tables.set(entity, []);
    }
    return this.tables.get(entity)!;
  }

  nextId(entity: EntityClass): number {
    const next = (this.sequences.get(entity) ?? 0) + 1;
    this.sequences.set(entity, next);
    return next;
  }

  snapshot() {
    return {
      tables: new Map(
        [...this.tables].map(([entity, rows]) => [
          entity,
          structuredClone(rows),
        ]),
      ),
      sequences: new Map(this.sequences),
    };
  }

  restore(snapshot: ReturnType<MemoryDatabase['snapshot']>) {
    this.tables = snapshot.tables;
    this.sequences = snapshot.sequences;
  }
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) {
    return true;
  }
  return Object.entries(where).every(([key, condition]) => {
    if (condition instanceof FindOperator) {
      const value = row[key];
      switch (condition.type) {
        case 'in':
          return (condition.value as unknown[]).includes(value);
        case 'raw': {
          const values = (
            condition.objectLiteralParameters as { values: string[] }
          ).values;
          return values.includes(String(value).toLowerCase());
        }
        case 'lessThan':
          return value !== null && value < condition.value;
        default:
          throw new Error(`Unsupported operator ${condition.type}`);
      }
    }
    return row[key] === condition;
  });
}

function createRepository(db: MemoryDatabase, entity: EntityClass) {
  const persist = (value: Row) => {
    if (value.id === undefined || value.id === null) {
      value.id = db.nextId(entity);
    }
    const now = new Date();
    value.created_at ??= now;
    value.updated_at = now;
    const table = db.table(entity);
    const index = table.findIndex((item) => item.id === value.id);
    const copy = { ...value };
    if (index >= 0) {
      table[index] = copy;
    } else {
      table.push(copy);
    }
    return value;
  };

  const find = (options: Row = {}) => {
    let rows = db
      .table(entity)
      .filter((row) => matches(row, options.where as Row | undefined));
    if (options.order) {
      const order = Object.entries(options.order as Record<string, string>);
      rows = [...rows].sort((left, right) => {
        for (const [key, direction] of order) {
          if (left[key] === right[key]) continue;
          const result = left[key] > right[key] ? 1 : -1;
          return direction === 'DESC' ? -result : result;
        }
        return 0;
      });
    }
    const skip = (options.skip as number | undefined) ?? 0;
    const take = options.take as number | undefined;
    rows = rows.slice(skip, take === undefined ? undefined : skip + take);
    return rows.map((row) => ({ ...row }));
  };

  return {
    create: (value: Row) => ({ ...value }),
    save: (value: Row | Row[]) =>
      Promise.resolve(
        Array.isArray(value)
          ? value.map((item) => persist(item))
          : persist(value),
      ),
    insert: (value: Row | Row[]) => {
      const values = Array.isArray(value) ? value : [value];
      values.forEach((item) => persist(item));
      return Promise.resolve({
        identifiers: values.map((item) => ({ id: item.id as number })),
      });
    },
    find: (options?: Row) => Promise.resolve(find(options)),
    findOne: (options?: Row) => Promise.resolve(find(options)[0] ?? null),
    findAndCount: (options: Row = {}) =>
      Promise.resolve([
        find(options),
        find({ where: options.where }).length,
      ] as const),
    update: (criteria: number | Row, partial: Row) => {
      const where = typeof criteria === 'number' ? { id: criteria } : criteria;
      const rows = db.table(entity).filter((row) => matches(row, where));
      rows.forEach((row) =>
        Object.assign(row, partial, { updated_at: new Date() }),
      );
      return Promise.resolve({ affected: rows.length });
    },
  };
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const COMPANY_ID = 10;
const OTHER_COMPANY_ID = 20;
const FISCAL_YEAR = String(new Date().getUTCFullYear());

const headOffice = { id: 1, name: 'Head Office' };
const arusha = { id: 5, name: 'Arusha' };
const itDepartment = { id: 2, name: 'IT' };
const finance = { id: 4, name: 'Finance' };
const engineer = { id: 3, name: 'Software Engineer' };
const accountant = { id: 6, name: 'Accountant' };

function employee(overrides: Row): Row {
  return {
    company_id: COMPANY_ID,
    middle_name: null,
    gender: 'male',
    employment_status: EmploymentStatusEnum.ACTIVE,
    primary_branch_id: headOffice.id,
    primary_branch: headOffice,
    primary_department_id: itDepartment.id,
    primary_department: itDepartment,
    primary_position_id: engineer.id,
    primary_position: engineer,
    grade_id: null,
    employment_type: 'permanent',
    confirmation_status: 'confirmed',
    hire_date: '2020-01-01',
    version: 1,
    ...overrides,
  };
}

function leaveType(overrides: Row): Row {
  return {
    company_id: COMPANY_ID,
    is_paid: true,
    requires_attachment: false,
    is_carry_forward_allowed: false,
    max_carry_forward_days: '0.00',
    max_days_per_year: '0.00',
    gender_restriction: LeaveGenderRestrictionEnum.ANY,
    status: LeaveRecordStatusEnum.ACTIVE,
    ...overrides,
  };
}

function balance(
  employeeId: number,
  leaveTypeId: number,
  available: number,
): Row {
  const days = available.toFixed(2);
  return {
    company_id: COMPANY_ID,
    employee_id: employeeId,
    leave_type_id: leaveTypeId,
    fiscal_year: FISCAL_YEAR,
    allocated_days: days,
    opening_balance_days: '0.00',
    entitlement_days: days,
    accrued_days: days,
    used_days: '0.00',
    pending_days: '0.00',
    approved_future_days: '0.00',
    carried_forward_days: '0.00',
    expired_days: '0.00',
    adjusted_days: '0.00',
    attendance_deduction_days: '0.00',
    generated_at: new Date(),
    leave_year_start_date: `${FISCAL_YEAR}-01-01`,
    leave_year_end_date: `${FISCAL_YEAR}-12-31`,
    last_transaction_id: null,
    version: 1,
  };
}

function seed(db: MemoryDatabase) {
  const employees = db.table(Employee);
  employees.push(
    employee({
      id: 101,
      employee_no: 'AICL/001',
      first_name: 'Filbert',
      last_name: 'Msaki',
    }),
    employee({
      id: 102,
      employee_no: 'AICL/002',
      first_name: 'John',
      last_name: 'Doe',
      primary_department_id: finance.id,
      primary_department: finance,
      primary_position_id: accountant.id,
      primary_position: accountant,
    }),
    employee({
      id: 103,
      employee_no: 'AICL/003',
      first_name: 'Jane',
      last_name: 'Roe',
      gender: 'female',
      employment_status: EmploymentStatusEnum.RESIGNED,
    }),
    employee({
      id: 104,
      employee_no: 'AICL/004',
      first_name: 'Asha',
      middle_name: 'Neema',
      last_name: 'Juma',
      gender: 'female',
      primary_branch_id: arusha.id,
      primary_branch: arusha,
    }),
    // Same employee number, different tenant.
    employee({
      id: 201,
      company_id: OTHER_COMPANY_ID,
      employee_no: 'AICL/001',
      first_name: 'Other',
      last_name: 'Tenant',
    }),
  );
  db.sequences.set(Employee, 300);

  db.table(LeaveType).push(
    leaveType({
      id: 1,
      code: 'ANNUAL',
      name: 'Annual Leave',
      max_days_per_year: '21.00',
    }),
    leaveType({
      id: 2,
      code: 'SICK',
      name: 'Sick Leave',
      max_days_per_year: '10.00',
    }),
    leaveType({
      id: 3,
      code: 'COMP',
      name: 'Compassionate Leave',
      max_days_per_year: '5.00',
    }),
    leaveType({
      id: 4,
      code: 'MATERNITY',
      name: 'Maternity Leave',
      max_days_per_year: '84.00',
      gender_restriction: LeaveGenderRestrictionEnum.FEMALE,
    }),
    leaveType({
      id: 5,
      code: 'STUDY',
      name: 'Study Leave',
      status: LeaveRecordStatusEnum.INACTIVE,
    }),
    leaveType({
      id: 9,
      company_id: OTHER_COMPANY_ID,
      code: 'ANNUAL',
      name: 'Annual Leave',
    }),
  );
  db.sequences.set(LeaveType, 20);

  db.table(LeavePolicy).push(
    {
      id: 1,
      company_id: COMPANY_ID,
      status: LeaveRecordStatusEnum.ACTIVE,
      priority: 0,
      allow_negative_balance: false,
      maximum_accumulation_days: null,
      accrual_method: 'yearly',
      applicable_branch_id: null,
      applicable_department_id: null,
      applicable_position_id: null,
      applicable_grade_id: null,
      applicable_employment_type: null,
      applicable_confirmation_status: null,
      leave_types: [
        {
          leave_type_id: 1,
          annual_quota_days: '21.00',
          maximum_accumulation_days: '40.00',
        },
      ],
    },
    {
      id: 2,
      company_id: COMPANY_ID,
      status: LeaveRecordStatusEnum.ACTIVE,
      priority: 0,
      allow_negative_balance: true,
      maximum_accumulation_days: null,
      accrual_method: 'yearly',
      applicable_branch_id: null,
      applicable_department_id: null,
      applicable_position_id: null,
      applicable_grade_id: null,
      applicable_employment_type: null,
      applicable_confirmation_status: null,
      leave_types: [
        {
          leave_type_id: 2,
          annual_quota_days: '10.00',
          maximum_accumulation_days: null,
        },
      ],
    },
  );

  const balances = db.table(LeaveBalance);
  const add = (employeeId: number, leaveTypeId: number, available: number) =>
    balances.push({
      id: db.nextId(LeaveBalance),
      ...balance(employeeId, leaveTypeId, available),
    });
  add(101, 1, 21);
  add(101, 2, 10);
  add(101, 3, 5);
  add(102, 1, 18);
  add(102, 2, 10);
  // 102 has no COMP balance yet: the template initialises it.
  add(103, 1, 12);
  add(104, 1, 15);
  add(104, 2, 10);
  add(104, 3, 5);
  add(104, 4, 84);
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const PERMISSIONS = [
  'data_scope:company',
  'leave-balances.export',
  'leave-balances.bulk-import',
  'leave-balances.bulk-import.partial',
  'leave-balances.import-history',
];

function actorWith(
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    id: 9,
    email: 'hr@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: COMPANY_ID,
    companyName: 'Alliance',
    companyMembershipId: 33,
    employeeId: 900,
    roles: ['HR_MANAGER'],
    permissions: PERMISSIONS,
    ...overrides,
  };
}

function createHarness() {
  const db = new MemoryDatabase();
  seed(db);
  const repositories = new Map<
    EntityClass,
    ReturnType<typeof createRepository>
  >();
  const repo = (entity: EntityClass) => {
    if (!repositories.has(entity)) {
      repositories.set(entity, createRepository(db, entity));
    }
    return repositories.get(entity)! as unknown as Repository<never>;
  };
  const manager = { getRepository: repo };
  const dataSource = {
    transaction: async <T>(
      work: (entityManager: typeof manager) => Promise<T>,
    ) => {
      const snapshot = db.snapshot();
      try {
        return await work(manager);
      } catch (error) {
        db.restore(snapshot);
        throw error;
      }
    },
  };

  const scope = {
    accessibleEmployeeIds: null as number[] | null,
    companyScope: true,
  };
  const hrAccessService = {
    getAccessibleEmployeeIds: jest.fn(() =>
      Promise.resolve(scope.accessibleEmployeeIds),
    ),
    hasCompanyScope: jest.fn(() => scope.companyScope),
  };
  const leaveAuditService = new LeaveAuditService(repo(LeaveAuditLog));
  const leaveBalanceService = new LeaveBalanceService(
    repo(LeaveBalance),
    repo(LeaveType),
    repo(LeavePolicy),
    repo(LeaveRequest),
    repo(Employee),
    repo(AttendanceDailySummary),
    repo(LeaveBalanceAdjustment),
    leaveAuditService,
  );
  const ledger = new LeaveBalanceLedgerService(
    repo(LeaveBalanceTransaction),
    repo(LeaveBalance),
    repo(LeaveBalanceAdjustment),
  );
  // Behaves like a BullMQ worker picking the job up straight away.
  const queue = {
    add: jest.fn(
      async (
        _name: string,
        job: LeaveBalanceImportJobData,
      ): Promise<unknown> => {
        await service.processQueuedBatch(job);
        return { id: 'job' };
      },
    ),
  };
  const service: LeaveBalanceImportService = new LeaveBalanceImportService(
    dataSource as unknown as DataSource,
    repo(Employee),
    repo(LeaveType),
    repo(LeaveBalance),
    repo(LeaveBalanceImportBatch),
    repo(LeaveBalanceImportRow),
    leaveBalanceService,
    ledger,
    leaveAuditService,
    hrAccessService as unknown as HrAccessService,
    { get: jest.fn(() => undefined) } as unknown as ConfigService,
    queue as never,
  );

  const available = (employeeId: number, leaveTypeId: number) => {
    const row = db
      .table(LeaveBalance)
      .find(
        (item) =>
          item.employee_id === employeeId && item.leave_type_id === leaveTypeId,
      );
    return row ? calculateAvailableLeaveDays(row as LeaveBalance) : null;
  };
  const setAvailable = (
    employeeId: number,
    leaveTypeId: number,
    days: number,
  ) => {
    const row = db
      .table(LeaveBalance)
      .find(
        (item) =>
          item.employee_id === employeeId && item.leave_type_id === leaveTypeId,
      )!;
    Object.assign(row, balance(employeeId, leaveTypeId, days), {
      id: row.id,
      version: row.version + 1,
    });
  };
  const rows = (batchRef: string) => {
    const batch = db
      .table(LeaveBalanceImportBatch)
      .find((item) => item.batch_ref === batchRef)!;
    return db
      .table(LeaveBalanceImportRow)
      .filter((item) => item.batch_id === batch.id)
      .sort((left, right) => left.row_number - right.row_number);
  };
  const rowFor = (batchRef: string, employeeNo: string, code: string) =>
    rows(batchRef).find(
      (item) =>
        item.employee_no === employeeNo && item.leave_type_code === code,
    )!;

  return {
    db,
    service,
    queue,
    ledger,
    scope,
    hrAccessService,
    available,
    setAvailable,
    rows,
    rowFor,
  };
}

type Harness = ReturnType<typeof createHarness>;

type Edit = {
  employeeNo: string;
  code: string;
  newBalance?: string | number;
  reason?: string;
  set?: Record<string, string | number>;
};

async function editTemplate(
  buffer: Buffer,
  edits: Edit[],
  options: { duplicate?: Edit; append?: Record<string, string | number> } = {},
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet('Leave Balances')!;
  const columns = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => columns.set(cell.text, column));
  const cell = (row: ExcelJS.Row, header: string) =>
    row.getCell(columns.get(header)!);

  const apply = (row: ExcelJS.Row, edit: Edit) => {
    if (edit.newBalance !== undefined)
      cell(row, 'New Leave Balance').value = edit.newBalance;
    if (edit.reason !== undefined)
      cell(row, 'Adjustment Reason / Remarks').value = edit.reason;
    Object.entries(edit.set ?? {}).forEach(([header, value]) => {
      cell(row, header).value = value;
    });
  };

  let duplicateSource: ExcelJS.Row | null = null;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const employeeNo = cell(row, 'Employee Number').text;
    const code = cell(row, 'Leave Type Code').text;
    edits
      .filter((edit) => edit.employeeNo === employeeNo && edit.code === code)
      .forEach((edit) => apply(row, edit));
    if (
      options.duplicate?.employeeNo === employeeNo &&
      options.duplicate.code === code
    ) {
      duplicateSource = row;
    }
  });
  if (duplicateSource) {
    const copy = sheet.addRow(
      (duplicateSource as ExcelJS.Row).values as ExcelJS.CellValue[],
    );
    apply(copy, options.duplicate!);
  }
  if (options.append) {
    const row = sheet.addRow([]);
    Object.entries(options.append).forEach(([header, value]) => {
      cell(row, header).value = value;
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const xlsxFile = (buffer: Buffer, name = 'leave-balances.xlsx') => ({
  originalname: name,
  mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  size: buffer.length,
  buffer,
});

async function uploadEdits(
  harness: Harness,
  edits: Edit[],
  options: {
    actor?: AuthenticatedUser;
    defaultReason?: string;
    duplicate?: Edit;
    append?: Record<string, string | number>;
    beforeUpload?: () => void;
  } = {},
) {
  const actor = options.actor ?? actorWith();
  const template = await harness.service.downloadTemplate(
    COMPANY_ID,
    {},
    actor,
  );
  const edited = await editTemplate(template.buffer, edits, options);
  options.beforeUpload?.();
  return harness.service.uploadAndValidate(
    COMPANY_ID,
    xlsxFile(edited),
    { default_reason: options.defaultReason },
    actor,
  );
}

async function readTemplate(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet('Leave Balances')!;
  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell) => headers.push(cell.text));
  const rows: Record<string, unknown>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    rows.push(
      Object.fromEntries(
        headers.map((header, index) => [header, row.getCell(index + 1).value]),
      ),
    );
  });
  return { workbook, sheet, headers, rows };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LeaveBalanceImportService', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  describe('template', () => {
    it('exports one row per eligible employee + leave type with the authoritative balance', async () => {
      const result = await harness.service.downloadTemplate(
        COMPANY_ID,
        {},
        actorWith(),
      );
      const { rows, headers, sheet } = await readTemplate(result.buffer);

      const visibleHeaders = headers.filter(
        (_header, index) => !sheet.getColumn(index + 1).hidden,
      );
      expect(visibleHeaders).toEqual([
        'Employee Number',
        'Full Name',
        'Branch',
        'Department',
        'Leave Type Code',
        'Leave Type Name',
        'Current Leave Balance',
        'New Leave Balance',
        'Adjustment Reason / Remarks',
      ]);
      const keys = rows.map(
        (row) =>
          `${String(row['Employee Number'])}:${String(row['Leave Type Code'])}`,
      );
      // Active employees only, active leave types only, gender eligibility applied.
      expect(keys).toEqual([
        'AICL/001:ANNUAL',
        'AICL/001:COMP',
        'AICL/001:SICK',
        'AICL/002:ANNUAL',
        'AICL/002:COMP',
        'AICL/002:SICK',
        'AICL/004:ANNUAL',
        'AICL/004:COMP',
        'AICL/004:MATERNITY',
        'AICL/004:SICK',
      ]);
      const filbert = rows.filter(
        (row) => row['Employee Number'] === 'AICL/001',
      );
      expect(
        filbert.map((row) => [
          row['Leave Type Code'],
          row['Current Leave Balance'],
        ]),
      ).toEqual([
        ['ANNUAL', 21],
        ['COMP', 5],
        ['SICK', 10],
      ]);
      expect(filbert[0]).toMatchObject({
        'Full Name': 'Filbert Msaki',
        Branch: 'Head Office',
        Department: 'IT',
        'Leave Year': FISCAL_YEAR,
        'Employee Ref': '101',
        'Leave Type Ref': '1',
      });
      expect(result.rowCount).toBe(10);
    });

    it('formats the data sheet as a bordered, filtered table area', async () => {
      const { sheet, headers } = await readTemplate(
        (await harness.service.downloadTemplate(COMPANY_ID, {}, actorWith()))
          .buffer,
      );
      const visibleColumnCount = headers.filter(
        (_header, index) => !sheet.getColumn(index + 1).hidden,
      ).length;

      expect(sheet.views).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ state: 'frozen', ySplit: 1 }),
        ]),
      );
      expect(sheet.autoFilter).toBe(
        `A1:${sheet.getColumn(headers.length).letter}1`,
      );
      expect(sheet.getRow(1).font).toMatchObject({ bold: true });
      expect(sheet.getRow(1).height).toBe(24);
      expect(sheet.getRow(2).height).toBe(22);
      expect(sheet.getColumn(2).width).toBe(30);
      expect(sheet.getColumn(8).width).toBe(19);

      for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
        for (
          let columnNumber = 1;
          columnNumber <= visibleColumnCount;
          columnNumber += 1
        ) {
          expect(sheet.getCell(rowNumber, columnNumber).border).toMatchObject({
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          });
        }
      }
    });

    it('initialises a missing balance with the standard generation rules instead of inventing a figure', async () => {
      expect(harness.available(102, 3)).toBeNull();

      const { rows } = await readTemplate(
        (await harness.service.downloadTemplate(COMPANY_ID, {}, actorWith()))
          .buffer,
      );

      const row = rows.find(
        (item) =>
          item['Employee Number'] === 'AICL/002' &&
          item['Leave Type Code'] === 'COMP',
      );
      expect(row?.['Current Leave Balance']).toBe(5);
      expect(harness.available(102, 3)).toBe(5);
    });

    it('contains only the employees in the user’s organisational scope', async () => {
      harness.scope.accessibleEmployeeIds = [104];
      harness.scope.companyScope = false;

      const { rows } = await readTemplate(
        (await harness.service.downloadTemplate(COMPANY_ID, {}, actorWith()))
          .buffer,
      );

      expect(new Set(rows.map((row) => row['Employee Number']))).toEqual(
        new Set(['AICL/004']),
      );
    });

    it('refuses to export an empty template when nobody is in scope', async () => {
      harness.scope.accessibleEmployeeIds = [];
      harness.scope.companyScope = false;

      await expect(
        harness.service.downloadTemplate(COMPANY_ID, {}, actorWith()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('records the export in the leave audit log', async () => {
      await harness.service.downloadTemplate(COMPANY_ID, {}, actorWith());
      expect(harness.db.table(LeaveAuditLog)).toEqual([
        expect.objectContaining({
          action: 'leave_balance_import.template_exported',
          company_id: COMPANY_ID,
          actor_company_user_id: 33,
        }),
      ]);
    });
  });

  describe('upload and validation', () => {
    it('validates each leave type independently and never changes balances', async () => {
      const batch = await uploadEdits(
        harness,
        [
          {
            employeeNo: 'AICL/001',
            code: 'ANNUAL',
            newBalance: 25,
            reason: 'Opening balance correction',
          },
          {
            employeeNo: 'AICL/001',
            code: 'SICK',
            newBalance: 8,
            reason: 'Opening balance correction',
          },
          {
            employeeNo: 'AICL/001',
            code: 'COMP',
            newBalance: 5,
            reason: 'Checked',
          },
        ],
        { beforeUpload: () => harness.setAvailable(101, 1, 20) },
      );

      expect(
        harness.rowFor(batch.batch_id, 'AICL/001', 'ANNUAL'),
      ).toMatchObject({
        validation_status: 'INVALID',
        error_code: 'CURRENT_BALANCE_MISMATCH',
        uploaded_current_balance: '21.00',
        db_current_balance: '20.00',
        new_balance: '25.00',
        adjustment_days: null,
      });
      expect(
        harness.rowFor(batch.batch_id, 'AICL/001', 'ANNUAL').message,
      ).toContain(
        "Template balance is 21 days, but the employee's current balance is 20 days",
      );
      expect(harness.rowFor(batch.batch_id, 'AICL/001', 'SICK')).toMatchObject({
        validation_status: 'VALID',
        adjustment_days: '-2.00',
      });
      expect(harness.rowFor(batch.batch_id, 'AICL/001', 'COMP')).toMatchObject({
        validation_status: 'NO_CHANGE',
      });
      expect(batch).toMatchObject({
        status: LeaveBalanceImportBatchStatusEnum.HAS_ERRORS,
        total_rows: 10,
        valid_rows: 1,
        invalid_rows: 1,
        warning_rows: 0,
        no_change_rows: 8,
      });
      // Upload only validates.
      expect(harness.available(101, 2)).toBe(10);
      expect(harness.db.table(LeaveBalanceAdjustment)).toHaveLength(0);
      expect(harness.db.table(LeaveBalanceTransaction)).toHaveLength(0);
    });

    it('treats a blank New Leave Balance as unchanged even when the balance has moved', async () => {
      const batch = await uploadEdits(harness, [], {
        beforeUpload: () => harness.setAvailable(101, 1, 19),
      });

      expect(batch.status).toBe(LeaveBalanceImportBatchStatusEnum.VALIDATED);
      expect(
        harness
          .rows(batch.batch_id)
          .every((row) => row.validation_status === 'NO_CHANGE'),
      ).toBe(true);
      expect(batch.actions.can_confirm_strict).toBe(false);
    });

    it.each([
      [
        {
          employeeNo: 'AICL/001',
          code: 'ANNUAL',
          newBalance: 'twenty',
          reason: 'x',
        },
        'INVALID_NEW_BALANCE',
      ],
      [
        {
          employeeNo: 'AICL/001',
          code: 'ANNUAL',
          newBalance: 20.125,
          reason: 'x',
        },
        'INVALID_NEW_BALANCE',
      ],
      [
        { employeeNo: 'AICL/001', code: 'ANNUAL', newBalance: -1, reason: 'x' },
        'NEGATIVE_BALANCE_NOT_ALLOWED',
      ],
      [
        { employeeNo: 'AICL/001', code: 'ANNUAL', newBalance: 30 },
        'REQUIRED_FIELD_MISSING',
      ],
      [
        {
          employeeNo: 'AICL/001',
          code: 'ANNUAL',
          newBalance: 30,
          reason: 'x',
          set: { 'Full Name': 'Philbert Msaki' },
        },
        'EMPLOYEE_DATA_MISMATCH',
      ],
      [
        {
          employeeNo: 'AICL/001',
          code: 'ANNUAL',
          newBalance: 30,
          reason: 'x',
          set: { 'Employee Number': 'AICL/404' },
        },
        'EMPLOYEE_NOT_FOUND',
      ],
      [
        {
          employeeNo: 'AICL/001',
          code: 'ANNUAL',
          newBalance: 30,
          reason: 'x',
          set: { 'Employee Ref': '102' },
        },
        'EMPLOYEE_DATA_MISMATCH',
      ],
      [
        {
          employeeNo: 'AICL/001',
          code: 'ANNUAL',
          newBalance: 30,
          reason: 'x',
          set: { 'Leave Type Code': 'NOPE' },
        },
        'LEAVE_TYPE_NOT_FOUND',
      ],
      [
        {
          employeeNo: 'AICL/001',
          code: 'ANNUAL',
          newBalance: 30,
          reason: 'x',
          set: { 'Leave Year': '1999' },
        },
        'LEAVE_YEAR_MISMATCH',
      ],
    ])('rejects %j with %s', async (edit, code) => {
      const batch = await uploadEdits(harness, [edit as Edit]);
      const row = harness
        .rows(batch.batch_id)
        .find((item) => item.row_number === 2)!;
      expect(row.validation_status).toBe('INVALID');
      expect(row.error_code).toBe(code);
    });

    it('rejects inactive employees and inactive or ineligible leave types', async () => {
      const batch = await uploadEdits(harness, [], {
        defaultReason: 'Migration',
        append: {
          'Employee Number': 'AICL/003',
          'Full Name': 'Jane Roe',
          Branch: 'Head Office',
          Department: 'IT',
          'Leave Year': FISCAL_YEAR,
          'Leave Type Code': 'ANNUAL',
          'Leave Type Name': 'Annual Leave',
          'Current Leave Balance': 12,
          'New Leave Balance': 14,
        },
      });
      const inactive = harness.rowFor(batch.batch_id, 'AICL/003', 'ANNUAL');
      expect(inactive.validation_status).toBe('INVALID');
      expect(inactive.issues.map((issue: Row) => issue.code)).toContain(
        'EMPLOYEE_INACTIVE',
      );

      const ineligible = await uploadEdits(harness, [], {
        defaultReason: 'Migration',
        append: {
          'Employee Number': 'AICL/001',
          'Full Name': 'Filbert Msaki',
          Branch: 'Head Office',
          Department: 'IT',
          'Leave Year': FISCAL_YEAR,
          'Leave Type Code': 'MATERNITY',
          'Leave Type Name': 'Maternity Leave',
          'Current Leave Balance': 0,
          'New Leave Balance': 84,
        },
      });
      expect(
        harness
          .rowFor(ineligible.batch_id, 'AICL/001', 'MATERNITY')
          .issues.map((issue: Row) => issue.code),
      ).toEqual(expect.arrayContaining(['LEAVE_TYPE_NOT_ELIGIBLE']));
    });

    it('rejects duplicate Employee + Leave Type rows', async () => {
      const batch = await uploadEdits(
        harness,
        [
          {
            employeeNo: 'AICL/002',
            code: 'SICK',
            newBalance: 7,
            reason: 'Correction',
          },
        ],
        {
          duplicate: {
            employeeNo: 'AICL/002',
            code: 'SICK',
            newBalance: 9,
            reason: 'Correction',
          },
        },
      );
      const duplicates = harness
        .rows(batch.batch_id)
        .filter(
          (row) =>
            row.employee_no === 'AICL/002' && row.leave_type_code === 'SICK',
        );
      expect(duplicates).toHaveLength(2);
      duplicates.forEach((row) => {
        expect(row.validation_status).toBe('INVALID');
        expect(row.error_code).toBe('DUPLICATE_EMPLOYEE_LEAVE_TYPE');
      });
    });

    it('accepts negative balances when the policy allows them and uses the default reason', async () => {
      const batch = await uploadEdits(
        harness,
        [{ employeeNo: 'AICL/002', code: 'SICK', newBalance: -2 }],
        {
          defaultReason: 'Advance sick leave',
        },
      );
      expect(harness.rowFor(batch.batch_id, 'AICL/002', 'SICK')).toMatchObject({
        validation_status: 'VALID',
        adjustment_days: '-12.00',
        reason: 'Advance sick leave',
      });
    });

    it('flags organisational changes and accumulation limits as warnings, not errors', async () => {
      const batch = await uploadEdits(harness, [
        {
          employeeNo: 'AICL/001',
          code: 'ANNUAL',
          newBalance: 45,
          reason: 'Carry-over agreed',
          set: { Department: 'Finance' },
        },
      ]);
      const row = harness.rowFor(batch.batch_id, 'AICL/001', 'ANNUAL');
      expect(row.validation_status).toBe('WARNING');
      expect(row.issues.map((issue: Row) => issue.code)).toEqual(
        expect.arrayContaining([
          'DEPARTMENT_MISMATCH',
          'EXCEEDS_MAXIMUM_ACCUMULATION',
        ]),
      );
      expect(batch.status).toBe(
        LeaveBalanceImportBatchStatusEnum.READY_FOR_IMPORT,
      );
    });

    it('rejects employees outside the user’s scope without exposing their data', async () => {
      const template = await harness.service.downloadTemplate(
        COMPANY_ID,
        {},
        actorWith(),
      );
      const edited = await editTemplate(template.buffer, [
        { employeeNo: 'AICL/001', code: 'ANNUAL', newBalance: 30, reason: 'x' },
      ]);
      harness.scope.accessibleEmployeeIds = [104];
      harness.scope.companyScope = false;

      const batch = await harness.service.uploadAndValidate(
        COMPANY_ID,
        xlsxFile(edited),
        {},
        actorWith(),
      );

      const row = harness.rowFor(batch.batch_id, 'AICL/001', 'ANNUAL');
      expect(row).toMatchObject({
        validation_status: 'INVALID',
        error_code: 'EMPLOYEE_ACCESS_DENIED',
        employee_id: null,
        db_current_balance: null,
      });
    });

    it('rejects a template generated for another company', async () => {
      const otherCompanyActor = actorWith({ companyId: OTHER_COMPANY_ID });
      const template = await harness.service.downloadTemplate(
        OTHER_COMPANY_ID,
        {},
        otherCompanyActor,
      );

      await expect(
        harness.service.uploadAndValidate(
          COMPANY_ID,
          xlsxFile(template.buffer),
          {},
          actorWith(),
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'COMPANY_MISMATCH' }),
      });
      expect(harness.db.table(LeaveBalanceImportBatch)).toHaveLength(0);
    });

    it('resolves employee numbers within the active company only', async () => {
      const batch = await uploadEdits(harness, [
        { employeeNo: 'AICL/001', code: 'ANNUAL', newBalance: 22, reason: 'x' },
      ]);
      expect(
        harness.rowFor(batch.batch_id, 'AICL/001', 'ANNUAL'),
      ).toMatchObject({
        employee_id: 101,
        validation_status: 'VALID',
      });
    });

    it('rejects files that are not the signed template', async () => {
      const template = await harness.service.downloadTemplate(
        COMPANY_ID,
        {},
        actorWith(),
      );
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(template.buffer as unknown as ExcelJS.Buffer);
      workbook.getWorksheet('Template Info')!.getCell('B2').value =
        'forged.token';
      const tampered = Buffer.from(await workbook.xlsx.writeBuffer());

      await expect(
        harness.service.uploadAndValidate(
          COMPANY_ID,
          xlsxFile(tampered),
          {},
          actorWith(),
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_TEMPLATE' }),
      });
      await expect(
        harness.service.uploadAndValidate(
          COMPANY_ID,
          xlsxFile(Buffer.from('not a workbook')),
          {},
          actorWith(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        harness.service.uploadAndValidate(
          COMPANY_ID,
          xlsxFile(template.buffer, 'balances.csv'),
          {},
          actorWith(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(
        harness.db.table(LeaveAuditLog).map((entry) => entry.action),
      ).toContain('leave_balance_import.rejected');
    });
  });

  describe('confirmation', () => {
    const example = [
      {
        employeeNo: 'AICL/001',
        code: 'ANNUAL',
        newBalance: 25,
        reason: 'Opening balance migration',
      },
      {
        employeeNo: 'AICL/001',
        code: 'SICK',
        newBalance: 8,
        reason: 'Opening balance migration',
      },
      {
        employeeNo: 'AICL/001',
        code: 'COMP',
        newBalance: 5,
        reason: 'Opening balance migration',
      },
    ];

    it('imports increases and decreases as adjustment transactions and skips unchanged balances', async () => {
      const uploaded = await uploadEdits(harness, example);

      const result = await harness.service.confirmImport(
        COMPANY_ID,
        uploaded.batch_id,
        {},
        actorWith(),
      );

      expect(result).toMatchObject({
        status: LeaveBalanceImportBatchStatusEnum.COMPLETED,
        import_mode: LeaveBalanceImportModeEnum.STRICT,
        imported_rows: 2,
        failed_rows: 0,
        skipped_rows: 8,
        employees_affected: 1,
      });
      expect(harness.available(101, 1)).toBe(25);
      expect(harness.available(101, 2)).toBe(8);
      expect(harness.available(101, 3)).toBe(5);
      // Other employees and leave types are untouched.
      expect(harness.available(102, 1)).toBe(18);
      expect(harness.available(104, 2)).toBe(10);

      const batchId = harness.db.table(LeaveBalanceImportBatch)[0].id as number;
      const adjustments = harness.db.table(LeaveBalanceAdjustment);
      expect(adjustments).toHaveLength(2);
      expect(adjustments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            company_id: COMPANY_ID,
            employee_id: 101,
            leave_type_id: 1,
            old_balance_days: '21.00',
            new_balance_days: '25.00',
            adjustment_amount_days: '4.00',
            source: LeaveBalanceAdjustmentSourceEnum.BULK_IMPORT,
            import_batch_id: batchId,
            reason: 'Opening balance migration',
            adjusted_by_company_user_id: 33,
            reference: `${uploaded.batch_id}#2`,
          }),
          expect.objectContaining({
            leave_type_id: 2,
            old_balance_days: '10.00',
            new_balance_days: '8.00',
            adjustment_amount_days: '-2.00',
          }),
        ]),
      );
      const transactions = harness.db.table(LeaveBalanceTransaction);
      expect(transactions).toHaveLength(2);
      expect(
        transactions.every(
          (item) =>
            item.transaction_type ===
            LeaveBalanceTransactionTypeEnum.ADJUSTMENT,
        ),
      ).toBe(true);
      expect(
        adjustments.map((item) => item.leave_balance_transaction_id).sort(),
      ).toEqual(transactions.map((item) => item.id).sort());
      const audit = harness.db
        .table(LeaveAuditLog)
        .filter((entry) => entry.action === 'leave_balance.bulk_adjusted');
      expect(audit).toHaveLength(2);
      expect(audit[0].payload).toMatchObject({
        import_batch_id: uploaded.batch_id,
        employee_no: 'AICL/001',
        previous_balance_days: '21.00',
        new_balance_days: '25.00',
        adjustment_days: '4.00',
        adjustment_direction: 'INCREASE',
        reason: 'Opening balance migration',
      });
      expect(
        harness.rowFor(uploaded.batch_id, 'AICL/001', 'ANNUAL'),
      ).toMatchObject({
        result_status: 'IMPORTED',
        previous_balance_at_import: '21.00',
        new_balance_at_import: '25.00',
      });
      expect(
        harness.rowFor(uploaded.batch_id, 'AICL/001', 'COMP').result_status,
      ).toBe('SKIPPED');
    });

    it('refuses strict mode when any row is invalid and changes nothing', async () => {
      const uploaded = await uploadEdits(harness, [
        ...example,
        {
          employeeNo: 'AICL/002',
          code: 'ANNUAL',
          newBalance: 'abc',
          reason: 'x',
        },
      ]);

      await expect(
        harness.service.confirmImport(
          COMPANY_ID,
          uploaded.batch_id,
          {},
          actorWith(),
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STRICT_MODE_HAS_ERRORS' }),
      });
      expect(harness.available(101, 1)).toBe(21);
      expect(harness.db.table(LeaveBalanceAdjustment)).toHaveLength(0);
    });

    it('imports valid rows only when explicitly requested by an authorised user', async () => {
      const uploaded = await uploadEdits(harness, [
        ...example,
        {
          employeeNo: 'AICL/002',
          code: 'ANNUAL',
          newBalance: 'abc',
          reason: 'x',
        },
      ]);
      const request = {
        import_mode: LeaveBalanceImportModeEnum.VALID_ROWS_ONLY,
      };
      const strictOnly = actorWith({
        permissions: PERMISSIONS.filter(
          (item) => item !== 'leave-balances.bulk-import.partial',
        ),
      });

      await expect(
        harness.service.confirmImport(
          COMPANY_ID,
          uploaded.batch_id,
          request,
          strictOnly,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        harness.service.confirmImport(
          COMPANY_ID,
          uploaded.batch_id,
          request,
          actorWith(),
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'SKIPPED_ROWS_NOT_ACKNOWLEDGED',
        }),
      });

      const result = await harness.service.confirmImport(
        COMPANY_ID,
        uploaded.batch_id,
        { ...request, acknowledge_skipped_rows: true },
        actorWith(),
      );

      expect(result).toMatchObject({
        status: LeaveBalanceImportBatchStatusEnum.PARTIALLY_COMPLETED,
        imported_rows: 2,
      });
      expect(harness.available(101, 1)).toBe(25);
      expect(harness.available(102, 1)).toBe(18);
      expect(
        harness.rowFor(uploaded.batch_id, 'AICL/002', 'ANNUAL').result_status,
      ).toBe('SKIPPED');
    });

    it('requires warnings to be acknowledged', async () => {
      const uploaded = await uploadEdits(harness, [
        {
          employeeNo: 'AICL/001',
          code: 'ANNUAL',
          newBalance: 45,
          reason: 'Agreed',
        },
      ]);

      await expect(
        harness.service.confirmImport(
          COMPANY_ID,
          uploaded.batch_id,
          {},
          actorWith(),
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'WARNINGS_NOT_ACKNOWLEDGED',
        }),
      });

      const result = await harness.service.confirmImport(
        COMPANY_ID,
        uploaded.batch_id,
        { acknowledge_warnings: true },
        actorWith(),
      );
      expect(result.status).toBe(LeaveBalanceImportBatchStatusEnum.COMPLETED);
      expect(harness.available(101, 1)).toBe(45);
    });

    it('rolls back the whole strict batch when a balance changed after validation', async () => {
      const uploaded = await uploadEdits(harness, example);
      // Leave taken between preview and confirmation.
      harness.setAvailable(101, 1, 19);

      const result = await harness.service.confirmImport(
        COMPANY_ID,
        uploaded.batch_id,
        {},
        actorWith(),
      );

      expect(result.status).toBe(LeaveBalanceImportBatchStatusEnum.FAILED);
      expect(result.failure_reason).toContain('no balances were changed');
      expect(harness.available(101, 1)).toBe(19);
      expect(harness.available(101, 2)).toBe(10);
      expect(harness.db.table(LeaveBalanceAdjustment)).toHaveLength(0);
      expect(harness.db.table(LeaveBalanceTransaction)).toHaveLength(0);
      expect(
        harness.rowFor(uploaded.batch_id, 'AICL/001', 'ANNUAL'),
      ).toMatchObject({
        result_status: 'FAILED',
        error_code: 'BALANCE_CHANGED_SINCE_VALIDATION',
      });
      expect(
        harness.rowFor(uploaded.batch_id, 'AICL/001', 'SICK'),
      ).toMatchObject({
        result_status: 'SKIPPED',
        error_code: 'NOT_IMPORTED_BATCH_ROLLED_BACK',
      });
    });

    it('skips only the conflicting row in valid-rows-only mode', async () => {
      const uploaded = await uploadEdits(harness, example);
      harness.setAvailable(101, 1, 19);

      const result = await harness.service.confirmImport(
        COMPANY_ID,
        uploaded.batch_id,
        { import_mode: LeaveBalanceImportModeEnum.VALID_ROWS_ONLY },
        actorWith(),
      );

      expect(result).toMatchObject({
        status: LeaveBalanceImportBatchStatusEnum.PARTIALLY_COMPLETED,
        imported_rows: 1,
        failed_rows: 1,
      });
      expect(harness.available(101, 1)).toBe(19);
      expect(harness.available(101, 2)).toBe(8);
    });

    it('leaves no partial balances or history when a write fails mid-import', async () => {
      const uploaded = await uploadEdits(harness, example);
      const original = harness.ledger.applyManualAdjustment.bind(
        harness.ledger,
      );
      jest
        .spyOn(harness.ledger, 'applyManualAdjustment')
        .mockImplementationOnce(original)
        .mockRejectedValueOnce(new Error('connection lost'));

      const result = await harness.service.confirmImport(
        COMPANY_ID,
        uploaded.batch_id,
        {},
        actorWith(),
      );

      expect(result.status).toBe(LeaveBalanceImportBatchStatusEnum.FAILED);
      expect(harness.available(101, 1)).toBe(21);
      expect(harness.available(101, 2)).toBe(10);
      expect(harness.db.table(LeaveBalanceAdjustment)).toHaveLength(0);
      expect(harness.db.table(LeaveBalanceTransaction)).toHaveLength(0);
      expect(
        harness.db
          .table(LeaveAuditLog)
          .some((entry) => entry.action === 'leave_balance.bulk_adjusted'),
      ).toBe(false);
    });

    it('returns immediately and finishes in-process when the queue is unavailable', async () => {
      const uploaded = await uploadEdits(harness, example);
      harness.queue.add.mockRejectedValueOnce(
        new Error('Queue "leave-balance-import" is disabled'),
      );

      const accepted = await harness.service.confirmImport(
        COMPANY_ID,
        uploaded.batch_id,
        {},
        actorWith(),
      );

      expect(accepted.status).toBe(
        LeaveBalanceImportBatchStatusEnum.PROCESSING,
      );
      expect(harness.available(101, 1)).toBe(21);
      await harness.service.waitForInProcessImports();
      const finished = await harness.service.getBatch(
        COMPANY_ID,
        uploaded.batch_id,
        actorWith(),
      );
      expect(finished).toMatchObject({
        status: LeaveBalanceImportBatchStatusEnum.COMPLETED,
        imported_rows: 2,
        processed_rows: 2,
      });
      expect(harness.available(101, 1)).toBe(25);
      // The background run audits as the confirming user.
      expect(
        harness.db
          .table(LeaveBalanceAdjustment)
          .every((row) => row.adjusted_by_company_user_id === 33),
      ).toBe(true);
    });

    it('enqueues one job per confirmed batch', async () => {
      const uploaded = await uploadEdits(harness, example);
      await harness.service.confirmImport(
        COMPANY_ID,
        uploaded.batch_id,
        {},
        actorWith(),
      );
      expect(harness.queue.add).toHaveBeenCalledWith(
        'process-leave-balance-import-batch',
        { companyId: COMPANY_ID, databaseBatchId: expect.any(Number) },
        expect.objectContaining({
          attempts: 1,
          jobId: expect.stringMatching(/^leave-balance-import-\d+$/),
        }),
      );
    });

    it('cannot be confirmed twice', async () => {
      const uploaded = await uploadEdits(harness, example);
      await harness.service.confirmImport(
        COMPANY_ID,
        uploaded.batch_id,
        {},
        actorWith(),
      );

      await expect(
        harness.service.confirmImport(
          COMPANY_ID,
          uploaded.batch_id,
          {},
          actorWith(),
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BATCH_NOT_CONFIRMABLE' }),
      });
      expect(harness.db.table(LeaveBalanceAdjustment)).toHaveLength(2);
      expect(harness.available(101, 1)).toBe(25);
    });

    it('is invisible to other tenants and to scoped users who did not upload it', async () => {
      const uploaded = await uploadEdits(harness, example);

      await expect(
        harness.service.confirmImport(
          OTHER_COMPANY_ID,
          uploaded.batch_id,
          {},
          actorWith({ companyId: OTHER_COMPANY_ID }),
        ),
      ).rejects.toMatchObject({ status: 404 });

      harness.scope.companyScope = false;
      await expect(
        harness.service.getBatch(
          COMPANY_ID,
          uploaded.batch_id,
          actorWith({ companyMembershipId: 77 }),
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        harness.service.getBatch(COMPANY_ID, uploaded.batch_id, actorWith()),
      ).resolves.toMatchObject({
        batch_id: uploaded.batch_id,
      });
    });
  });

  describe('error report', () => {
    it('returns the uploaded data with database balances, statuses and error details', async () => {
      const uploaded = await uploadEdits(
        harness,
        [
          {
            employeeNo: 'AICL/001',
            code: 'ANNUAL',
            newBalance: 25,
            reason: 'x',
          },
        ],
        { beforeUpload: () => harness.setAvailable(101, 1, 20) },
      );

      const report = await harness.service.downloadReport(
        COMPANY_ID,
        uploaded.batch_id,
        actorWith(),
      );
      const { rows } = await readTemplate(report.buffer);

      expect(
        rows.find(
          (row) =>
            row['Employee Number'] === 'AICL/001' &&
            row['Leave Type Code'] === 'ANNUAL',
        ),
      ).toMatchObject({
        'Current Leave Balance': 21,
        'New Leave Balance': 25,
        'Database Current Balance': 20,
        'Validation Status': 'INVALID',
        'Error Code': 'CURRENT_BALANCE_MISMATCH',
      });
    });

    it('can be corrected and uploaded again', async () => {
      const uploaded = await uploadEdits(harness, [
        {
          employeeNo: 'AICL/001',
          code: 'ANNUAL',
          newBalance: 'abc',
          reason: 'x',
        },
      ]);
      const report = await harness.service.downloadReport(
        COMPANY_ID,
        uploaded.batch_id,
        actorWith(),
      );
      const corrected = await editTemplate(report.buffer, [
        { employeeNo: 'AICL/001', code: 'ANNUAL', newBalance: 23, reason: 'x' },
      ]);

      const retry = await harness.service.uploadAndValidate(
        COMPANY_ID,
        xlsxFile(corrected),
        {},
        actorWith(),
      );

      expect(retry.status).toBe(
        LeaveBalanceImportBatchStatusEnum.READY_FOR_IMPORT,
      );
      expect(
        harness.rowFor(retry.batch_id, 'AICL/001', 'ANNUAL').validation_status,
      ).toBe('VALID');
    });
  });

  describe('permissions', () => {
    const required = (handler: keyof LeaveController) =>
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        LeaveController.prototype[handler],
      ) as string[];

    it('guards every bulk import endpoint with a dedicated permission', () => {
      expect(required('downloadLeaveBalanceImportTemplate')).toEqual([
        'leave-balances.export',
      ]);
      expect(required('uploadLeaveBalanceImport')).toEqual([
        'leave-balances.bulk-import',
      ]);
      expect(required('confirmLeaveBalanceImport')).toEqual([
        'leave-balances.bulk-import',
      ]);
      expect(required('cancelLeaveBalanceImport')).toEqual([
        'leave-balances.bulk-import',
      ]);
      expect(required('listLeaveBalanceImportHistory')).toEqual([
        'leave-balances.import-history',
        'leave-balances.bulk-import',
      ]);
    });
  });
});
