import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { AdjustLeaveBalanceDto } from '../dtos/adjust-leave-balance.dto';
import { LeaveBalanceAdjustmentModeEnum } from '../enums/leave-balance-adjustment-mode.enum';
import { LeaveType } from '../entities/leave-type.entity';
import { LeaveService } from '../leave.service';

type UploadedWorkbook = { originalname: string; buffer: Buffer };
type ImportRowResult = {
  row: number;
  employee_no: string;
  leave_type_code: string;
  status: 'created' | 'failed';
  message?: string;
};

const HEADERS = [
  'employee_no',
  'leave_type_code',
  'fiscal_year',
  'mode',
  'amount',
  'reason',
] as const;

@Injectable()
export class LeaveBalanceImportService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(LeaveType)
    private readonly leaveTypeRepository: Repository<LeaveType>,
    private readonly leaveService: LeaveService,
  ) {}

  async downloadTemplate(companyId: number) {
    const [employees, leaveTypes] = await Promise.all([
      this.employeeRepository.find({
        where: { company_id: companyId },
        order: { employee_no: 'ASC' },
      }),
      this.leaveTypeRepository.find({
        where: { company_id: companyId },
        order: { name: 'ASC' },
      }),
    ]);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HRMS';
    workbook.created = new Date();
    const instructions = workbook.addWorksheet('Instructions', {
      views: [{ showGridLines: false }],
    });
    instructions.columns = [
      { header: 'Topic', key: 'topic', width: 28 },
      { header: 'Details', key: 'details', width: 100 },
    ];
    instructions.addRows([
      [
        'Leave balance import',
        'Enter one adjustment per employee and leave type, then upload this workbook from Leave Management > Leave Balances.',
      ],
      ['Required columns', HEADERS.join(', ')],
      [
        'Employee lookup',
        'Use employee_no exactly as shown on the Employees sheet.',
      ],
      [
        'Leave type lookup',
        'Use leave_type_code exactly as shown on the Leave Types sheet.',
      ],
      [
        'Modes',
        'ADD increases the balance, DEDUCT reduces it, and SET sets the available balance to the supplied amount.',
      ],
      ['Amount', 'Use a non-negative number with up to two decimal places.'],
      ['Fiscal year', 'Use four digits, for example 2026.'],
      [
        'Audit trail',
        'Every imported row is recorded as a balance adjustment with its reason. Invalid rows are returned for correction.',
      ],
    ]);
    this.styleHeader(instructions);

    const sheet = workbook.addWorksheet('Leave Balances', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    });
    sheet.columns = [
      { header: 'employee_no', key: 'employee_no', width: 20 },
      { header: 'leave_type_code', key: 'leave_type_code', width: 22 },
      { header: 'fiscal_year', key: 'fiscal_year', width: 15 },
      { header: 'mode', key: 'mode', width: 14 },
      { header: 'amount', key: 'amount', width: 14 },
      { header: 'reason', key: 'reason', width: 52 },
    ];
    this.styleHeader(sheet);
    sheet.addRow({
      employee_no: employees[0]?.employee_no ?? 'EMP-0001',
      leave_type_code: leaveTypes[0]?.code ?? 'ANNUAL',
      fiscal_year: String(new Date().getFullYear()),
      mode: 'ADD',
      amount: 1,
      reason: 'Imported opening adjustment',
    });
    sheet.getRow(2).font = { italic: true, color: { argb: 'FF64748B' } };
    sheet.getRow(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF7D6' },
    };
    for (let row = 2; row <= 501; row += 1) {
      sheet.getCell(`D${row}`).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"ADD,DEDUCT,SET"'],
      };
      if (leaveTypes.length)
        sheet.getCell(`B${row}`).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`'Leave Types'!$A$2:$A$${leaveTypes.length + 1}`],
        };
      if (employees.length)
        sheet.getCell(`A${row}`).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`'Employees'!$A$2:$A$${employees.length + 1}`],
        };
      sheet.getCell(`E${row}`).numFmt = '0.00';
    }
    sheet.autoFilter = { from: 'A1', to: 'F501' };

    const employeeSheet = workbook.addWorksheet('Employees', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    });
    employeeSheet.columns = [
      { header: 'employee_no', key: 'employee_no', width: 22 },
      { header: 'first_name', key: 'first_name', width: 24 },
      { header: 'last_name', key: 'last_name', width: 24 },
      { header: 'status', key: 'status', width: 16 },
    ];
    this.styleHeader(employeeSheet);
    employees.forEach((employee) =>
      employeeSheet.addRow({
        employee_no: employee.employee_no,
        first_name: employee.first_name,
        last_name: employee.last_name,
        status: employee.employment_status,
      }),
    );
    const typeSheet = workbook.addWorksheet('Leave Types', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    });
    typeSheet.columns = [
      { header: 'code', key: 'code', width: 22 },
      { header: 'name', key: 'name', width: 36 },
      { header: 'paid', key: 'paid', width: 12 },
      { header: 'status', key: 'status', width: 16 },
    ];
    this.styleHeader(typeSheet);
    leaveTypes.forEach((type) =>
      typeSheet.addRow({
        code: type.code,
        name: type.name,
        paid: type.is_paid ? 'Yes' : 'No',
        status: type.status,
      }),
    );
    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      fileName: `leave-balance-import-template-${companyId}.xlsx`,
    };
  }

  async import(
    companyId: number,
    file: UploadedWorkbook | undefined,
    actor: AuthenticatedUser,
  ) {
    if (
      !file?.buffer?.length ||
      !file.originalname.toLowerCase().endsWith('.xlsx')
    )
      throw new BadRequestException(
        'Select a valid .xlsx leave balance import file.',
      );
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException('The uploaded workbook could not be read.');
    }
    const sheet =
      workbook.getWorksheet('Leave Balances') ?? workbook.worksheets[0];
    if (!sheet)
      throw new BadRequestException('The workbook has no worksheets.');
    const headerByColumn = new Map<number, string>();
    sheet
      .getRow(1)
      .eachCell((cell, column) =>
        headerByColumn.set(column, this.cellText(cell).trim().toLowerCase()),
      );
    const missing = HEADERS.filter(
      (header) => ![...headerByColumn.values()].includes(header),
    );
    if (missing.length)
      throw new BadRequestException(
        `Missing required template columns: ${missing.join(', ')}`,
      );
    if (sheet.actualRowCount - 1 > 1000)
      throw new BadRequestException(
        'A leave balance import can contain at most 1,000 rows.',
      );
    const rows = Array.from(
      { length: Math.max(0, sheet.actualRowCount - 1) },
      (_, index) => this.readRow(sheet.getRow(index + 2), headerByColumn),
    ).filter((row) => Object.values(row).some(Boolean));
    if (!rows.length)
      throw new BadRequestException(
        'The workbook has no leave balance rows to import.',
      );
    const employeeNumbers = [
      ...new Set(rows.map((row) => row.employee_no.toLowerCase())),
    ];
    const leaveTypeCodes = [
      ...new Set(rows.map((row) => row.leave_type_code.toLowerCase())),
    ];
    const [employees, leaveTypes] = await Promise.all([
      this.employeeRepository
        .createQueryBuilder('employee')
        .where('employee.company_id = :companyId', { companyId })
        .andWhere('LOWER(employee.employee_no) IN (:...employeeNumbers)', {
          employeeNumbers,
        })
        .getMany(),
      this.leaveTypeRepository
        .createQueryBuilder('leaveType')
        .where('leaveType.company_id = :companyId', { companyId })
        .andWhere('LOWER(leaveType.code) IN (:...leaveTypeCodes)', {
          leaveTypeCodes,
        })
        .getMany(),
    ]);
    const employeeByNumber = new Map(
      employees.map((employee) => [
        employee.employee_no.toLowerCase(),
        employee,
      ]),
    );
    const typeByCode = new Map(
      leaveTypes.map((type) => [type.code.toLowerCase(), type]),
    );
    const results: ImportRowResult[] = [];
    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2;
      try {
        const employee = employeeByNumber.get(row.employee_no.toLowerCase());
        if (!employee)
          throw new Error(
            `Employee ${row.employee_no || '(blank)'} was not found.`,
          );
        const leaveType = typeByCode.get(row.leave_type_code.toLowerCase());
        if (!leaveType)
          throw new Error(
            `Leave type ${row.leave_type_code || '(blank)'} was not found.`,
          );
        if (!/^\d{4}$/.test(row.fiscal_year))
          throw new Error('fiscal_year must use four digits.');
        const mode = row.mode.toUpperCase() as LeaveBalanceAdjustmentModeEnum;
        if (!Object.values(LeaveBalanceAdjustmentModeEnum).includes(mode))
          throw new Error('mode must be ADD, DEDUCT, or SET.');
        const amount = Number(row.amount);
        if (
          !Number.isFinite(amount) ||
          amount < 0 ||
          Math.round(amount * 100) !== amount * 100
        )
          throw new Error(
            'amount must be a non-negative number with up to two decimals.',
          );
        if (!row.reason.trim()) throw new Error('reason is required.');
        const dto: AdjustLeaveBalanceDto = {
          employee_id: employee.id,
          leave_type_id: leaveType.id,
          fiscal_year: row.fiscal_year,
          mode,
          amount,
          reason: row.reason.trim(),
        };
        await this.leaveService.adjustLeaveBalance(companyId, dto, actor);
        results.push({
          row: rowNumber,
          employee_no: row.employee_no,
          leave_type_code: row.leave_type_code,
          status: 'created',
        });
      } catch (error) {
        results.push({
          row: rowNumber,
          employee_no: row.employee_no,
          leave_type_code: row.leave_type_code,
          status: 'failed',
          message: this.errorMessage(error),
        });
      }
    }
    return {
      total: results.length,
      created: results.filter((row) => row.status === 'created').length,
      failed: results.filter((row) => row.status === 'failed').length,
      results,
    };
  }

  private styleHeader(sheet: ExcelJS.Worksheet) {
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' },
    };
    sheet.getRow(1).height = 24;
  }
  private readRow(row: ExcelJS.Row, headers: Map<number, string>) {
    const record: Record<string, string> = {};
    headers.forEach((header, column) => {
      record[header] = this.cellText(row.getCell(column)).trim();
    });
    return record;
  }
  private cellText(cell: ExcelJS.Cell) {
    if (cell.value instanceof Date)
      return cell.value.toISOString().slice(0, 10);
    return cell.text ?? '';
  }
  private errorMessage(error: unknown) {
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: string | string[] }).message;
      return Array.isArray(message)
        ? message.join('; ')
        : typeof message === 'string'
          ? message
          : 'The row could not be imported.';
    }
    return 'The row could not be imported.';
  }
}
