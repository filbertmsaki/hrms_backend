import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { CreateLeaveRequestDto } from '../dtos/create-leave-request.dto';
import { LeaveDurationTypeEnum } from '../enums/leave-duration-type.enum';
import { LeaveHalfDaySessionEnum } from '../enums/leave-half-day-session.enum';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';
import { LeaveType } from '../entities/leave-type.entity';
import { LeaveService } from '../leave.service';

type UploadedWorkbook = {
  originalname: string;
  size: number;
  buffer: Buffer;
};

type ImportRowResult = {
  row: number;
  employee_no: string;
  leave_type_code: string;
  status: 'ready' | 'created' | 'failed';
  leave_request_id?: number | null;
  leave_no?: string | null;
  message?: string;
};

const HEADERS = [
  'employee_no',
  'leave_type_code',
  'duration_type',
  'start_date',
  'end_date',
  'half_day_session',
  'start_time',
  'end_time',
  'reason',
  'submit',
] as const;

@Injectable()
export class LeaveImportService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(LeaveType)
    private readonly leaveTypeRepository: Repository<LeaveType>,
    private readonly leaveService: LeaveService,
  ) {}

  async downloadTemplate(companyId: number) {
    const leaveTypes = await this.leaveTypeRepository.find({
      where: { company_id: companyId, status: LeaveRecordStatusEnum.ACTIVE },
      order: { name: 'ASC' },
    });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HRMS';
    workbook.created = new Date();

    const instructions = workbook.addWorksheet('Instructions', {
      views: [{ showGridLines: false }],
    });
    instructions.columns = [
      { key: 'topic', width: 27 },
      { key: 'guidance', width: 92 },
    ];
    instructions.addRows([
      [
        'Leave bulk import',
        'Complete the Leave Requests sheet, then upload this .xlsx file from Leave Management.',
      ],
      [
        'Required fields',
        'employee_no, leave_type_code, duration_type, start_date, end_date, and reason.',
      ],
      ['Dates', 'Use YYYY-MM-DD. Start date cannot be after end date.'],
      [
        'Full day',
        'Use FULL_DAY. Leave half_day_session, start_time, and end_time blank.',
      ],
      [
        'Half day',
        'Use HALF_DAY and set half_day_session to FIRST_HALF or SECOND_HALF.',
      ],
      [
        'Short leave',
        'Use SHORT_LEAVE and provide start_time and end_time in 24-hour HH:MM format.',
      ],
      [
        'Submit',
        'Use Yes to enter the normal approval workflow immediately, or No to create a draft.',
      ],
      [
        'Leave types',
        'Use a code exactly as listed on the Leave Types sheet. That sheet reflects the active leave types configured for this company when downloaded.',
      ],
      [
        'Import result',
        'Valid rows are created. Invalid rows are skipped and returned with a specific error so they can be corrected and re-uploaded.',
      ],
    ]);
    instructions.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    instructions.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' },
    };
    instructions.getRow(1).height = 24;
    instructions.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

    const requests = workbook.addWorksheet('Leave Requests', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    });
    requests.columns = [
      { header: 'employee_no', key: 'employee_no', width: 20 },
      { header: 'leave_type_code', key: 'leave_type_code', width: 22 },
      { header: 'duration_type', key: 'duration_type', width: 19 },
      { header: 'start_date', key: 'start_date', width: 16 },
      { header: 'end_date', key: 'end_date', width: 16 },
      { header: 'half_day_session', key: 'half_day_session', width: 21 },
      { header: 'start_time', key: 'start_time', width: 14 },
      { header: 'end_time', key: 'end_time', width: 14 },
      { header: 'reason', key: 'reason', width: 48 },
      { header: 'submit', key: 'submit', width: 12 },
    ];
    requests.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    requests.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' },
    };
    requests.getRow(1).height = 26;
    requests.addRow({
      employee_no: 'EMP-0001',
      leave_type_code: leaveTypes[0]?.code ?? 'ANNUAL',
      duration_type: LeaveDurationTypeEnum.FULL_DAY,
      start_date: '2026-09-15',
      end_date: '2026-09-19',
      reason: 'Annual leave',
      submit: 'Yes',
    });
    requests.getRow(2).font = { italic: true, color: { argb: 'FF64748B' } };
    requests.getRow(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF7D6' },
    };
    for (let row = 2; row <= 501; row += 1) {
      requests.getCell(`C${row}`).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"FULL_DAY,HALF_DAY,SHORT_LEAVE"'],
      };
      requests.getCell(`F${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"FIRST_HALF,SECOND_HALF"'],
      };
      requests.getCell(`J${row}`).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"Yes,No"'],
      };
      if (leaveTypes.length) {
        requests.getCell(`B${row}`).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`'Leave Types'!$A$2:$A$${leaveTypes.length + 1}`],
        };
      }
    }
    requests.autoFilter = { from: 'A1', to: 'J501' };

    const types = workbook.addWorksheet('Leave Types', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    });
    types.columns = [
      { header: 'code', key: 'code', width: 22 },
      { header: 'name', key: 'name', width: 34 },
      { header: 'paid', key: 'paid', width: 12 },
      { header: 'attachment_required', key: 'attachment', width: 22 },
      { header: 'max_days_per_year', key: 'maxDays', width: 22 },
      { header: 'gender_restriction', key: 'gender', width: 22 },
    ];
    types.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    types.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' },
    };
    leaveTypes.forEach((leaveType) => {
      types.addRow({
        code: leaveType.code,
        name: leaveType.name,
        paid: leaveType.is_paid ? 'Yes' : 'No',
        attachment: leaveType.requires_attachment ? 'Yes' : 'No',
        maxDays: leaveType.max_days_per_year,
        gender: leaveType.gender_restriction,
      });
    });

    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      fileName: `leave-import-template-${companyId}.xlsx`,
    };
  }

  async import(
    companyId: number,
    file: UploadedWorkbook | undefined,
    actor: AuthenticatedUser,
    previewOnly = false,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Select an .xlsx leave import file.');
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException(
        'Only .xlsx leave import files are supported.',
      );
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException('The uploaded workbook could not be read.');
    }
    const sheet =
      workbook.getWorksheet('Leave Requests') ?? workbook.worksheets[0];
    if (!sheet)
      throw new BadRequestException('The workbook has no worksheets.');

    const headerByColumn = new Map<number, string>();
    sheet.getRow(1).eachCell((cell, column) => {
      headerByColumn.set(column, this.cellText(cell).trim().toLowerCase());
    });
    const missing = HEADERS.slice(0, 9).filter(
      (header) => ![...headerByColumn.values()].includes(header),
    );
    if (missing.length) {
      throw new BadRequestException(
        `Missing required template columns: ${missing.join(', ')}`,
      );
    }

    const employeeNumbers = new Set<string>();
    const leaveTypeCodes = new Set<string>();
    for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
      const record = this.readRow(sheet.getRow(rowNumber), headerByColumn);
      if (Object.values(record).some((value) => value)) {
        employeeNumbers.add(record.employee_no.toLowerCase());
        leaveTypeCodes.add(record.leave_type_code.toLowerCase());
      }
    }
    if (sheet.actualRowCount - 1 > 1000) {
      throw new BadRequestException(
        'A leave import can contain at most 1,000 rows.',
      );
    }

    const employees = employeeNumbers.size
      ? await this.employeeRepository
          .createQueryBuilder('employee')
          .where('employee.company_id = :companyId', { companyId })
          .andWhere('LOWER(employee.employee_no) IN (:...employeeNumbers)', {
            employeeNumbers: [...employeeNumbers],
          })
          .getMany()
      : [];
    const leaveTypes = leaveTypeCodes.size
      ? await this.leaveTypeRepository
          .createQueryBuilder('leaveType')
          .where('leaveType.company_id = :companyId', { companyId })
          .andWhere('leaveType.status = :status', {
            status: LeaveRecordStatusEnum.ACTIVE,
          })
          .andWhere('LOWER(leaveType.code) IN (:...leaveTypeCodes)', {
            leaveTypeCodes: [...leaveTypeCodes],
          })
          .getMany()
      : [];
    const employeeByNumber = new Map(
      employees.map((item) => [item.employee_no.toLowerCase(), item]),
    );
    const typeByCode = new Map(
      leaveTypes.map((item) => [item.code.toLowerCase(), item]),
    );
    const results: ImportRowResult[] = [];

    for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
      const row = this.readRow(sheet.getRow(rowNumber), headerByColumn);
      if (!Object.values(row).some((value) => value)) continue;
      try {
        const employee = employeeByNumber.get(row.employee_no.toLowerCase());
        if (!employee)
          throw new Error(
            `Employee ${row.employee_no || '(blank)'} was not found.`,
          );
        const leaveType = typeByCode.get(row.leave_type_code.toLowerCase());
        if (!leaveType)
          throw new Error(
            `Active leave type ${row.leave_type_code || '(blank)'} was not found.`,
          );
        const durationType =
          row.duration_type.toUpperCase() as LeaveDurationTypeEnum;
        if (!Object.values(LeaveDurationTypeEnum).includes(durationType)) {
          throw new Error(
            'duration_type must be FULL_DAY, HALF_DAY, or SHORT_LEAVE.',
          );
        }
        const halfDaySession =
          row.half_day_session.toUpperCase() as LeaveHalfDaySessionEnum;
        const dto: CreateLeaveRequestDto = {
          employee_id: employee.id,
          leave_type_id: leaveType.id,
          duration_type: durationType,
          start_date: row.start_date,
          end_date: row.end_date,
          reason: row.reason,
          submit: !['no', 'false', '0'].includes(row.submit.toLowerCase()),
          ...(durationType === LeaveDurationTypeEnum.HALF_DAY
            ? { half_day_session: halfDaySession }
            : {}),
          ...(durationType === LeaveDurationTypeEnum.SHORT_LEAVE
            ? { start_time: row.start_time, end_time: row.end_time }
            : {}),
        };
        if (!row.reason.trim()) throw new Error('reason is required.');
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(row.start_date) ||
          Number.isNaN(Date.parse(`${row.start_date}T00:00:00Z`)) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(row.end_date) ||
          Number.isNaN(Date.parse(`${row.end_date}T00:00:00Z`))
        ) {
          throw new Error('start_date and end_date must use YYYY-MM-DD.');
        }
        if (row.start_date > row.end_date) {
          throw new Error('start_date cannot be after end_date.');
        }
        if (
          durationType === LeaveDurationTypeEnum.HALF_DAY &&
          !Object.values(LeaveHalfDaySessionEnum).includes(halfDaySession)
        ) {
          throw new Error(
            'half_day_session must be FIRST_HALF or SECOND_HALF.',
          );
        }
        if (
          durationType === LeaveDurationTypeEnum.SHORT_LEAVE &&
          (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.start_time) ||
            !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.end_time))
        ) {
          throw new Error(
            'Short leave start_time and end_time must use HH:MM.',
          );
        }
        if (previewOnly && leaveType.requires_attachment && dto.submit) {
          throw new Error(
            'This leave type requires an attachment. Import it as a draft, then attach evidence before submitting.',
          );
        }
        if (previewOnly) {
          results.push({
            row: rowNumber,
            employee_no: row.employee_no,
            leave_type_code: row.leave_type_code,
            status: 'ready',
            message:
              'Workbook fields and company records are valid. Leave policy, overlap, and balance rules will be checked again at confirmation.',
          });
          continue;
        }
        const created = (await this.leaveService.createLeaveRequest(
          companyId,
          dto,
          actor,
        )) as {
          id?: number;
          leave_no?: string;
        };
        results.push({
          row: rowNumber,
          employee_no: row.employee_no,
          leave_type_code: row.leave_type_code,
          status: 'created',
          leave_request_id: created.id ?? null,
          leave_no: created.leave_no ?? null,
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

    if (!results.length)
      throw new BadRequestException(
        'The workbook has no leave rows to import.',
      );
    return {
      total: results.length,
      created: results.filter((row) => row.status === 'created').length,
      ready: results.filter((row) => row.status === 'ready').length,
      failed: results.filter((row) => row.status === 'failed').length,
      preview: previewOnly,
      results,
    };
  }

  private readRow(
    row: ExcelJS.Row,
    headerByColumn: Map<number, string>,
  ): Record<string, string> {
    const record: Record<string, string> = {};
    headerByColumn.forEach((header, column) => {
      record[header] = this.cellText(row.getCell(column)).trim();
    });
    return record;
  }

  private cellText(cell: ExcelJS.Cell): string {
    if (cell.value instanceof Date)
      return cell.value.toISOString().slice(0, 10);
    return cell.text ?? '';
  }

  private errorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: string | string[] }).message;
      if (Array.isArray(message)) return message.join('; ');
      if (typeof message === 'string') return message;
    }
    return 'The row could not be imported.';
  }
}
